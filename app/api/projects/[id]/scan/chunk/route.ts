import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callGEOQuery, callEvaluation, getModelInfo, getCheapestEvaluationModel, type EvaluationMetrics } from '@/lib/ai'
import { calculateDynamicCost } from '@/lib/credits'
import { TABLES, type ScanMetrics } from '@/lib/db/schema'
import { getFollowUpQuestion, type QueryType } from '@/lib/scan/follow-up-templates'

export const runtime = 'edge'
export const maxDuration = 25 // Edge runtime allows up to 30s on Hobby plan

// POST - Process a chunk of queries
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now()
  
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: projectId } = await params
    const { scanId, queryIds, modelIds } = await request.json()

    if (!scanId || !queryIds || !modelIds || queryIds.length === 0 || modelIds.length === 0) {
      return NextResponse.json({ error: 'Invalid chunk data' }, { status: 400 })
    }

    console.log(`[Chunk] Processing: scan=${scanId}, queries=${queryIds.length}, models=${modelIds.length}`)

    // Get project
    const { data: project } = await supabase
      .from(TABLES.PROJECTS)
      .select('*')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .single()

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Get queries
    const { data: queries } = await supabase
      .from(TABLES.PROJECT_QUERIES)
      .select('*')
      .in('id', queryIds)
      .eq('project_id', projectId)

    if (!queries || queries.length === 0) {
      return NextResponse.json({ error: 'Queries not found' }, { status: 404 })
    }

    // Get evaluation model settings
    const { data: helperSettings } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', '_helpers')
      .single()
    
    // Use configured evaluation model or default to cheapest
    const evaluationModel = helperSettings?.encrypted_api_key || getCheapestEvaluationModel()
    
    // Validate evaluation model exists
    if (!getModelInfo(evaluationModel)) {
      return NextResponse.json({ 
        error: `Invalid evaluation model: ${evaluationModel}. Please update in Settings.` 
      }, { status: 400 })
    }

    // Get follow-up settings from project
    const followUpEnabled = project.follow_up_enabled === true
    const followUpDepth = project.follow_up_depth || 1
    
    // Process each query × model combination
    const results = []
    let totalCostCents = 0
    let totalInputTokens = 0
    let totalOutputTokens = 0
    let totalOperations = 0

    // Process all query-model combinations in parallel
    const tasks = []
    for (const query of queries) {
      for (const modelId of modelIds) {
        const modelInfo = getModelInfo(modelId)
        if (!modelInfo || !modelInfo.isActive) {
          console.warn(`[Chunk] Model ${modelId} not found or inactive`)
          continue
        }

        // Create a promise for this query-model combination (including follow-ups)
        tasks.push((async () => {
          let operationCount = 0
          let costCents = 0
          let inputTokens = 0
          let outputTokens = 0
          
          try {
            // ========================================
            // INITIAL RESPONSE (follow_up_level = 0)
            // ========================================
            const response = await callGEOQuery(modelId, query.query_text, project.language || 'en')
            operationCount++

            if (!response.content) {
              console.log(`[Chunk] Empty response from ${modelId}`)
              return {
                queryId: query.id,
                modelId,
                success: false,
                error: 'Empty response',
                costCents: 0,
                inputTokens: 0,
                outputTokens: 0,
                operationCount: 0,
              }
            }

            // Analyze response with AI evaluation
            const evalResult = await callEvaluation(
              evaluationModel,
              response.content,
              project.brand_variations || [],
              project.domain
            )

            if (!evalResult.metrics) {
              return {
                queryId: query.id,
                modelId,
                success: false,
                error: 'No metrics',
                costCents: 0,
                inputTokens: 0,
                outputTokens: 0,
                operationCount: 0,
              }
            }

            // Calculate costs with dynamic pricing (includes markup)
            const queryCostCents = await calculateDynamicCost(
              modelId,
              response.inputTokens,
              response.outputTokens
            )
            
            const evalCostCents = await calculateDynamicCost(
              evaluationModel,
              evalResult.inputTokens,
              evalResult.outputTokens
            )
            
            costCents += queryCostCents + evalCostCents
            inputTokens += response.inputTokens + evalResult.inputTokens
            outputTokens += response.outputTokens + evalResult.outputTokens

            // Validate metrics
            const metrics: ScanMetrics = {
              visibility_score: evalResult.metrics.visibility_score,
              sentiment_score: evalResult.metrics.visibility_score > 0 
                ? evalResult.metrics.sentiment_score 
                : null,
              ranking_score: evalResult.metrics.ranking_score,
              recommendation_score: evalResult.metrics.visibility_score > 0 
                ? evalResult.metrics.recommendation_score 
                : 0,
            }

            // Save initial result
            const { data: initialResult } = await supabase
              .from(TABLES.SCAN_RESULTS)
              .insert({
                scan_id: scanId,
                provider: modelInfo.provider,
                model: modelId,
                query_text: query.query_text,
                ai_response_raw: response.content,
                metrics_json: metrics,
                input_tokens: response.inputTokens + evalResult.inputTokens,
                output_tokens: response.outputTokens + evalResult.outputTokens,
                cost_usd: (queryCostCents + evalCostCents) / 100,
                follow_up_level: 0,
                parent_result_id: null,
                follow_up_query_used: null,
              })
              .select()
              .single()

            // ========================================
            // FOLLOW-UP QUERIES (if enabled)
            // ========================================
            if (followUpEnabled && followUpDepth > 0 && initialResult) {
              // Build conversation history
              const conversationHistory: Array<{ role: 'user' | 'assistant', content: string }> = [
                { role: 'user', content: query.query_text },
                { role: 'assistant', content: response.content },
              ]
              
              let parentResultId = initialResult.id
              
              for (let level = 1; level <= followUpDepth; level++) {
                // Get follow-up question
                const followUpQuestion = getFollowUpQuestion(
                  query.query_type as QueryType,
                  level as 1 | 2 | 3,
                  project.language || 'en'
                )
                
                // Call LLM with conversation history
                const followUpResponse = await callGEOQuery(
                  modelId,
                  followUpQuestion,
                  project.language || 'en',
                  conversationHistory
                )
                
                operationCount++
                
                if (!followUpResponse.content) {
                  console.log(`[Chunk] Empty follow-up response ${level} from ${modelId}`)
                  continue
                }
                
                // Evaluate follow-up
                const followUpEvalResult = await callEvaluation(
                  evaluationModel,
                  followUpResponse.content,
                  project.brand_variations || [],
                  project.domain
                )
                
                if (!followUpEvalResult.metrics) continue
                
                // Calculate costs
                const followUpQueryCostCents = await calculateDynamicCost(modelId, followUpResponse.inputTokens, followUpResponse.outputTokens)
                const followUpEvalCostCents = await calculateDynamicCost(evaluationModel, followUpEvalResult.inputTokens, followUpEvalResult.outputTokens)
                
                costCents += followUpQueryCostCents + followUpEvalCostCents
                inputTokens += followUpResponse.inputTokens + followUpEvalResult.inputTokens
                outputTokens += followUpResponse.outputTokens + followUpEvalResult.outputTokens
                
                // Save follow-up result
                const { data: followUpResult } = await supabase
                  .from(TABLES.SCAN_RESULTS)
                  .insert({
                    scan_id: scanId,
                    provider: modelInfo.provider,
                    model: modelId,
                    query_text: query.query_text, // Original query for grouping
                    ai_response_raw: followUpResponse.content,
                    metrics_json: followUpEvalResult.metrics,
                    input_tokens: followUpResponse.inputTokens + followUpEvalResult.inputTokens,
                    output_tokens: followUpResponse.outputTokens + followUpEvalResult.outputTokens,
                    cost_usd: (followUpQueryCostCents + followUpEvalCostCents) / 100,
                    follow_up_level: level,
                    parent_result_id: parentResultId,
                    follow_up_query_used: followUpQuestion,
                  })
                  .select()
                  .single()
                
                if (followUpResult) {
                  parentResultId = followUpResult.id
                }
                
                // Add to conversation history
                conversationHistory.push(
                  { role: 'user', content: followUpQuestion },
                  { role: 'assistant', content: followUpResponse.content }
                )
              }
            }

            return {
              queryId: query.id,
              modelId,
              success: true,
              metrics,
              costCents,
              inputTokens,
              outputTokens,
              operationCount,
            }
          } catch (error: any) {
            console.error(`[Chunk] Error for ${modelId}:`, error.message)
            return {
              queryId: query.id,
              modelId,
              success: false,
              error: error.message,
              costCents,
              inputTokens,
              outputTokens,
              operationCount,
            }
          }
        })())
      }
    }

    // Wait for all parallel tasks to complete
    const taskResults = await Promise.all(tasks)

    // Aggregate results
    for (const taskResult of taskResults) {
      totalCostCents += taskResult.costCents
      totalInputTokens += taskResult.inputTokens
      totalOutputTokens += taskResult.outputTokens
      totalOperations += taskResult.operationCount
      
      if (taskResult.success) {
        results.push({
          queryId: taskResult.queryId,
          modelId: taskResult.modelId,
          success: true,
          metrics: taskResult.metrics,
        })
      } else {
        results.push({
          queryId: taskResult.queryId,
          modelId: taskResult.modelId,
          success: false,
          error: taskResult.error,
        })
      }
    }

    // Update scan totals (increment existing values)
    const { data: currentScan } = await supabase
      .from(TABLES.SCANS)
      .select('total_cost_usd, total_input_tokens, total_output_tokens, total_results')
      .eq('id', scanId)
      .single()

    if (currentScan) {
      await supabase
        .from(TABLES.SCANS)
        .update({
          total_cost_usd: (currentScan.total_cost_usd || 0) + (totalCostCents / 100),
          total_input_tokens: (currentScan.total_input_tokens || 0) + totalInputTokens,
          total_output_tokens: (currentScan.total_output_tokens || 0) + totalOutputTokens,
          total_results: (currentScan.total_results || 0) + results.filter(r => r.success).length,
        })
        .eq('id', scanId)
    }

    const duration = Date.now() - startTime
    const completedQueries = queries.length // Number of original queries processed (not including follow-ups)
    
    console.log(`[Chunk] Completed in ${duration}ms: ${completedQueries} queries, ${totalOperations} operations, ${results.filter(r => r.success).length}/${results.length} successful, cost: ${totalCostCents} cents`)

    return NextResponse.json({
      success: true,
      completedQueries,
      totalOperations,
      processed: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      duration,
      results,
      totalCostCents,
      totalCostUsd: totalCostCents / 100,
    })
  } catch (error: any) {
    const duration = Date.now() - startTime
    console.error(`[Chunk] Error after ${duration}ms:`, error)
    return NextResponse.json(
      { error: error.message || 'Failed to process chunk' },
      { status: 500 }
    )
  }
}
