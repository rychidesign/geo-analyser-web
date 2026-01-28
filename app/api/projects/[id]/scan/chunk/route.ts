import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserApiKeys } from '@/lib/db/settings'
import { callLLM, GEO_SYSTEM_PROMPT, calculateCost } from '@/lib/llm'
import { AVAILABLE_MODELS, type LLMModel, type LLMProvider } from '@/lib/llm/types'
import { TABLES, type ScanMetrics } from '@/lib/db/schema'

export const runtime = 'edge'
export const maxDuration = 25 // Edge runtime allows up to 30s on Hobby plan

// AI-based evaluation using LLM
async function analyzeResponseWithAI(
  content: string,
  brandVariations: string[],
  domain: string,
  evaluationModel: string,
  apiKey: string
): Promise<{
  metrics: ScanMetrics
  cost: { provider: LLMProvider; model: string; inputTokens: number; outputTokens: number; costUsd: number }
}> {
  const prompt = `Analyze the following AI response and evaluate how well it mentions and recommends the brand.

Brand names: ${brandVariations.join(', ')}
Domain: ${domain}

AI Response to analyze:
"""
${content}
"""

Evaluate the response on these metrics (return scores 0-100):

1. **Visibility Score** (0-100): Combined brand + domain presence
   - Brand mentioned = 50 points
   - Domain mentioned = 50 points
   - Both = 100, one = 50, neither = 0

2. **Sentiment Score** (0-100 or null): What's the sentiment toward the brand?
   - If visibility_score is 0 (neither brand nor domain mentioned), return null
   - Otherwise, analyze ONLY sentences where brand or domain is mentioned
   - 10 = very negative, 50 = neutral, 90 = very positive

3. **Ranking Score** (0-100): If mentioned in a list, what position?
   - 100 = first/top position
   - 80 = second position
   - 60 = third position
   - 40 = fourth or lower
   - 0 = not in a list or not mentioned

4. **Recommendation Score** (0-100): Overall, how strongly is the brand recommended?
   - If brand NOT mentioned, return 0
   - If brand IS mentioned, consider: visibility, sentiment, ranking, prominence

Return ONLY a JSON object with this exact structure (no explanation):
{
  "visibility_score": <number>,
  "sentiment_score": <number or null>,
  "ranking_score": <number>,
  "recommendation_score": <number>
}`

  // Determine provider from model name
  const getProviderFromModel = (model: string): LLMProvider => {
    if (model.startsWith('gpt')) return 'openai'
    if (model.startsWith('claude')) return 'anthropic'
    if (model.startsWith('gemini')) return 'google'
    return 'openai'
  }

  const provider = getProviderFromModel(evaluationModel)
  
  const response = await callLLM(
    { provider, model: evaluationModel as LLMModel, apiKey },
    'You are an expert evaluator for GEO (Generative Engine Optimization).',
    prompt
  )

  // Parse JSON response
  let jsonContent = response.content.trim()
  
  // Remove markdown code blocks if present
  if (jsonContent.startsWith('```')) {
    jsonContent = jsonContent.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  }
  
  const metrics = JSON.parse(jsonContent)
  
  // Enforce consistency: when visibility = 0, sentiment = null and recommendation = 0
  const visibilityScore = Math.min(100, Math.max(0, metrics.visibility_score || 0))
  const sentimentScore = visibilityScore > 0 && metrics.sentiment_score !== null
    ? Math.min(100, Math.max(0, metrics.sentiment_score))
    : null
  // Recommendation is 0 when brand not mentioned (visibility = 0)
  const recommendationScore = visibilityScore > 0 
    ? Math.min(100, Math.max(0, metrics.recommendation_score || 0))
    : 0
  
  return {
    metrics: {
      visibility_score: visibilityScore,
      sentiment_score: sentimentScore,
      ranking_score: Math.min(100, Math.max(0, metrics.ranking_score || 0)),
      recommendation_score: recommendationScore,
    },
    cost: {
      provider,
      model: evaluationModel,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      costUsd: response.costUsd,
    }
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

    // Get evaluation model settings
    const { data: helperSettings } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', '_helpers')
      .single()
    
    const evaluationModel = helperSettings?.encrypted_api_key || null
    
    if (!evaluationModel) {
      return NextResponse.json({ error: 'No evaluation model configured. Please set one in Settings.' }, { status: 400 })
    }

    // Get API key for evaluation model's provider
    const getProviderFromModel = (model: string): LLMProvider => {
      if (model.startsWith('gpt')) return 'openai'
      if (model.startsWith('claude')) return 'anthropic'
      if (model.startsWith('gemini')) return 'google'
      return 'openai'
    }
    
    const evalProvider = getProviderFromModel(evaluationModel)
    const evalApiKeyField = `${evalProvider}_api_key` as keyof typeof userApiKeys
    const evaluationApiKey = userApiKeys[evalApiKeyField] as string
    
    if (!evaluationApiKey) {
      return NextResponse.json({ error: `No API key for evaluation model provider: ${evalProvider}` }, { status: 400 })
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
            // Call LLM for query
            const response = await callLLM(
              {
                provider: modelInfo.provider,
                apiKey: apiKey as string,
                model: modelId as LLMModel,
              },
              GEO_SYSTEM_PROMPT,
              query.query_text
            )

            // Analyze response with AI evaluation
            const evalResult = await analyzeResponseWithAI(
              response.content,
              project.brand_variations,
              project.domain,
              evaluationModel,
              evaluationApiKey
            )

            // Calculate cost (query + evaluation)
            const queryCost = calculateCost(
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
                metrics_json: evalResult.metrics,
                input_tokens: response.inputTokens,
                output_tokens: response.outputTokens,
                cost_usd: queryCost + evalResult.cost.costUsd,
              })
              .select()
              .single()

            return {
              queryId: query.id,
              modelId,
              success: true,
              metrics: evalResult.metrics,
              cost: queryCost + evalResult.cost.costUsd,
              inputTokens: response.inputTokens + evalResult.cost.inputTokens,
              outputTokens: response.outputTokens + evalResult.cost.outputTokens,
              result,
            }
          } catch (error: any) {
            console.error(`[Chunk] Error for ${modelId}:`, error.message)
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
