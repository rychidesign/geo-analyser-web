import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserApiKeys } from '@/lib/db/settings'
import { callLLM, GEO_SYSTEM_PROMPT, calculateCost } from '@/lib/llm'
import { AVAILABLE_MODELS, type LLMModel } from '@/lib/llm/types'
import { TABLES, type ScanMetrics } from '@/lib/db/schema'

export const runtime = 'edge'
export const maxDuration = 25 // Edge runtime allows up to 30s on Hobby plan

// Helper: Analyze response (regex or AI)
function analyzeResponseRegex(response: string, brandVariations: string[], domain: string): ScanMetrics {
  const lowerResponse = response.toLowerCase()
  
  // Check if brand is mentioned
  const brandMentioned = brandVariations.some(brand => 
    lowerResponse.includes(brand.toLowerCase())
  )
  
  // Check if domain is mentioned
  const domainMentioned = lowerResponse.includes(domain.toLowerCase())
  
  // Combined visibility score: brand + domain presence
  // 100 = both mentioned, 70 = brand only, 30 = domain only, 0 = neither
  let visibilityScore = 0
  if (brandMentioned && domainMentioned) {
    visibilityScore = 100
  } else if (brandMentioned) {
    visibilityScore = 70
  } else if (domainMentioned) {
    visibilityScore = 30
  }
  
  // Only calculate sentiment if brand is mentioned
  let sentimentScore = 0
  let rankingScore = 0
  let recommendationScore = 0
  
  if (brandMentioned) {
    // Simple sentiment analysis (presence of positive/negative words)
    const positiveWords = ['recommend', 'best', 'excellent', 'great', 'top', 'leading', 'premier']
    const negativeWords = ['avoid', 'worst', 'poor', 'bad', 'disappointing']
    
    const positiveCount = positiveWords.filter(word => lowerResponse.includes(word)).length
    const negativeCount = negativeWords.filter(word => lowerResponse.includes(word)).length
    
    sentimentScore = positiveCount > 0 ? 
      (negativeCount > 0 ? 50 : 75) : 
      (negativeCount > 0 ? 25 : 50)
    
    rankingScore = positiveCount > 0 ? 90 : 50
    
    // Recommendation based on all factors
    recommendationScore = Math.round(
      visibilityScore * 0.35 +
      ((sentimentScore - 50) * 2) * 0.35 +
      rankingScore * 0.3
    )
    recommendationScore = Math.min(100, Math.max(0, recommendationScore))
  }
  
  return {
    visibility_score: visibilityScore,
    sentiment_score: sentimentScore,
    ranking_score: rankingScore,
    recommendation_score: recommendationScore,
  }
}

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

    // Get API keys
    const userApiKeys = await getUserApiKeys(user.id)
    if (!userApiKeys) {
      return NextResponse.json({ error: 'No API keys configured' }, { status: 400 })
    }

    // Process each query × model combination
    const results = []
    let totalCost = 0
    let totalInputTokens = 0
    let totalOutputTokens = 0

    // Process all query-model combinations in parallel
    const tasks = []
    for (const query of queries) {
      for (const modelId of modelIds) {
        const modelInfo = AVAILABLE_MODELS.find(m => m.id === modelId)
        if (!modelInfo) continue

        const apiKeyField = `${modelInfo.provider}_api_key` as keyof typeof userApiKeys
        const apiKey = userApiKeys[apiKeyField]
        
        if (!apiKey) {
          console.warn(`[Chunk] No API key for ${modelId}`)
          continue
        }

        // Create a promise for this query-model combination
        tasks.push((async () => {
          try {
            // Call LLM
            const response = await callLLM(
              {
                provider: modelInfo.provider,
                apiKey: apiKey as string,
                model: modelId as LLMModel,
              },
              GEO_SYSTEM_PROMPT,
              query.query_text
            )

            // Analyze response
            const metrics = analyzeResponseRegex(
              response.content,
              project.brand_variations,
              project.domain
            )

            // Calculate cost
            const cost = calculateCost(
              modelId,
              response.inputTokens,
              response.outputTokens
            )

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
                cost_usd: cost,
              })
              .select()
              .single()

            return {
              queryId: query.id,
              modelId,
              success: true,
              metrics,
              cost,
              inputTokens: response.inputTokens,
              outputTokens: response.outputTokens,
              result,
            }
          } catch (error: any) {
            console.error(`[Chunk] LLM error for ${modelId}:`, error.message)
            return {
              queryId: query.id,
              modelId,
              success: false,
              error: error.message,
              cost: 0,
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
        totalCost += taskResult.cost
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
          total_cost_usd: (currentScan.total_cost_usd || 0) + totalCost,
          total_input_tokens: (currentScan.total_input_tokens || 0) + totalInputTokens,
          total_output_tokens: (currentScan.total_output_tokens || 0) + totalOutputTokens,
          total_results: (currentScan.total_results || 0) + results.filter(r => r.success).length,
        })
        .eq('id', scanId)
    }

    const duration = Date.now() - startTime
    console.log(`[Chunk] Completed in ${duration}ms: ${results.filter(r => r.success).length}/${results.length} successful`)

    return NextResponse.json({
      success: true,
      processed: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      duration,
      results,
      totalCost,
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
