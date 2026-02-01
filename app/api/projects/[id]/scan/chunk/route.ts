import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callGEOQuery, callEvaluation, getModelInfo, getCheapestEvaluationModel, type EvaluationMetrics } from '@/lib/ai'
import { calculateDynamicCost } from '@/lib/credits'
import { TABLES, type ScanMetrics } from '@/lib/db/schema'

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

    // Process each query × model combination
    const results = []
    let totalCostCents = 0
    let totalInputTokens = 0
    let totalOutputTokens = 0

    // Process all query-model combinations in parallel
    const tasks = []
    for (const query of queries) {
      for (const modelId of modelIds) {
        const modelInfo = getModelInfo(modelId)
        if (!modelInfo || !modelInfo.isActive) {
          console.warn(`[Chunk] Model ${modelId} not found or inactive`)
          continue
        }

        // Create a promise for this query-model combination
        tasks.push((async () => {
          try {
            // Call LLM for query using new AI module
            const response = await callGEOQuery(modelId, query.query_text)

            // Analyze response with AI evaluation
            const evalResult = await callEvaluation(
              evaluationModel,
              response.content,
              project.brand_variations,
              project.domain
            )

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
            
            const totalCost = queryCostCents + evalCostCents

            // Validate metrics
            const metrics: ScanMetrics = evalResult.metrics ? {
              visibility_score: evalResult.metrics.visibility_score,
              sentiment_score: evalResult.metrics.visibility_score > 0 
                ? evalResult.metrics.sentiment_score 
                : null,
              ranking_score: evalResult.metrics.ranking_score,
              recommendation_score: evalResult.metrics.visibility_score > 0 
                ? evalResult.metrics.recommendation_score 
                : 0,
            } : {
              visibility_score: 0,
              sentiment_score: null,
              ranking_score: 0,
              recommendation_score: 0,
            }

            // Save result
            const { data: result } = await supabase
              .from(TABLES.SCAN_RESULTS)
              .insert({
                scan_id: scanId,
                provider: modelInfo.provider,
                model: modelId,
                query_text: query.query_text,
                ai_response_raw: response.content,
                metrics_json: metrics,
                input_tokens: response.inputTokens,
                output_tokens: response.outputTokens,
                cost_usd: totalCost / 100, // Store as USD for backward compatibility
              })
              .select()
              .single()

            return {
              queryId: query.id,
              modelId,
              success: true,
              metrics,
              costCents: totalCost,
              inputTokens: response.inputTokens + evalResult.inputTokens,
              outputTokens: response.outputTokens + evalResult.outputTokens,
              result,
            }
          } catch (error: any) {
            console.error(`[Chunk] Error for ${modelId}:`, error.message)
            return {
              queryId: query.id,
              modelId,
              success: false,
              error: error.message,
              costCents: 0,
              inputTokens: 0,
              outputTokens: 0,
            }
          }
        })())
      }
    }

    // Wait for all parallel tasks to complete
    const taskResults = await Promise.all(tasks)

    // Aggregate results
    for (const taskResult of taskResults) {
      if (taskResult.success) {
        totalCostCents += taskResult.costCents
        totalInputTokens += taskResult.inputTokens
        totalOutputTokens += taskResult.outputTokens
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
    console.log(`[Chunk] Completed in ${duration}ms: ${results.filter(r => r.success).length}/${results.length} successful, cost: ${totalCostCents} cents`)

    return NextResponse.json({
      success: true,
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
