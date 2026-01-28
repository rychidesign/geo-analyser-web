import { createClient } from '@/lib/supabase/server'
import { callLLM, GEO_SYSTEM_PROMPT, calculateCost } from '@/lib/llm'
import type { LLMProvider, LLMModel, LLMConfig } from '@/lib/llm/types'
import type { Project, ProjectQuery, Scan, ScanResult, ScanMetrics } from '@/lib/db/schema'
import { TABLES } from '@/lib/db/schema'

export interface ModelConfig {
  model: LLMModel
  provider: LLMProvider
  apiKey: string
}

export interface ScanConfig {
  projectId: string
  userId: string
  queries: ProjectQuery[]
  models: ModelConfig[]
  project: Project
  queueId?: string  // Optional queue ID for progress tracking
}

export interface ScanProgress {
  total: number
  completed: number
  currentQuery: string
  currentModel: string
}

// Helper: Check if scan should pause or stop
async function checkQueueStatus(queueId: string | undefined): Promise<'continue' | 'paused' | 'cancelled'> {
  if (!queueId) return 'continue'
  
  const supabase = await createClient()
  const { data: queueItem } = await supabase
    .from('scan_queue')
    .select('status')
    .eq('id', queueId)
    .single()
  
  if (!queueItem) return 'continue'
  
  if (queueItem.status === 'cancelled') return 'cancelled'
  if (queueItem.status === 'paused') return 'paused'
  
  return 'continue'
}

// Helper: Update queue progress
async function updateQueueProgress(
  queueId: string | undefined,
  current: number,
  total: number,
  message: string
): Promise<void> {
  if (!queueId) return
  
  const supabase = await createClient()
  await supabase
    .from('scan_queue')
    .update({
      progress_current: current,
      progress_total: total,
      progress_message: message,
      updated_at: new Date().toISOString(), // ✅ Explicitly update timestamp
    })
    .eq('id', queueId)
}

export async function runScan(config: ScanConfig): Promise<Scan> {
  const supabase = await createClient()
  
  const totalOperations = config.queries.length * config.models.length
  
  // Create scan record
  const { data: scan, error: scanError } = await supabase
    .from(TABLES.SCANS)
    .insert({
      project_id: config.projectId,
      user_id: config.userId,
      status: 'running',
      evaluation_method: 'ai',
      total_cost_usd: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_queries: config.queries.length,
      total_results: 0,
    })
    .select()
    .single()

  if (scanError || !scan) {
    throw new Error(`Failed to create scan: ${scanError?.message}`)
  }

  // Get AI evaluation settings
  let evaluationModel: string | null = null
  let evaluationApiKey: string | null = null
  
  const { data: helperSettings } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', config.userId)
    .eq('provider', '_helpers')
    .single()
  
  evaluationModel = helperSettings?.encrypted_api_key || null // evaluation_model stored here
  
  if (evaluationModel) {
    // Get API key for evaluation model's provider
    const getProviderFromModel = (model: string): LLMProvider => {
      if (model.startsWith('gpt')) return 'openai'
      if (model.startsWith('claude')) return 'anthropic'
      if (model.startsWith('gemini')) return 'google'
      return 'openai'
    }
    
    const evalProvider = getProviderFromModel(evaluationModel)
    const { data: providerSettings } = await supabase
      .from('user_settings')
      .select('encrypted_api_key')
      .eq('user_id', config.userId)
      .eq('provider', evalProvider)
      .single()
    
    evaluationApiKey = providerSettings?.encrypted_api_key || null
    
    if (!evaluationApiKey) {
      throw new Error(`No API key configured for evaluation model provider: ${evalProvider}`)
    }
  } else {
    throw new Error('No evaluation model configured. Please set an evaluation model in Settings.')
  }

  let totalCost = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0
  const results: ScanResult[] = []
  const evaluationCosts: Array<{ provider: LLMProvider; model: string; inputTokens: number; outputTokens: number; costUsd: number }> = []

  try {
    // Run each query against each model
    let completedOperations = 0
    
    for (const query of config.queries) {
      for (const modelConfig of config.models) {
        // Check if scan should pause or stop
        let queueStatus = await checkQueueStatus(config.queueId)
        
        if (queueStatus === 'cancelled') {
          throw new Error('Scan cancelled by user')
        }
        
        // If paused, wait and check again
        while (queueStatus === 'paused') {
          await new Promise(resolve => setTimeout(resolve, 5000)) // Check every 5 seconds
          queueStatus = await checkQueueStatus(config.queueId)
          if (queueStatus === 'cancelled') {
            throw new Error('Scan cancelled by user')
          }
        }
        
        // Update progress
        await updateQueueProgress(
          config.queueId,
          completedOperations,
          totalOperations,
          `Processing: ${query.query_text.substring(0, 50)}... with ${modelConfig.model}`
        )
        
        try {
          const llmConfig: LLMConfig = {
            provider: modelConfig.provider,
            apiKey: modelConfig.apiKey,
            model: modelConfig.model,
          }

          const response = await callLLM(
            llmConfig,
            GEO_SYSTEM_PROMPT,
            query.query_text
          )

          // Analyze the response using AI evaluation
          const evalResult = await analyzeResponseWithAI(
            response.content,
            config.project.brand_variations,
            config.project.domain,
            evaluationModel!,
            evaluationApiKey!
          )
          const metrics = evalResult.metrics
          const evaluationCost = evalResult.cost
          
          // Track evaluation costs
          if (evaluationCost.costUsd > 0) {
            evaluationCosts.push(evaluationCost)
          }

          // Save result
          const { data: result } = await supabase
            .from(TABLES.SCAN_RESULTS)
            .insert({
              scan_id: scan.id,
              provider: modelConfig.provider,
              model: modelConfig.model,
              query_text: query.query_text,
              ai_response_raw: response.content,
              metrics_json: metrics,
              input_tokens: response.inputTokens,
              output_tokens: response.outputTokens,
              cost_usd: response.costUsd,
            })
            .select()
            .single()

          if (result) {
            results.push(result)
          }

          totalCost += response.costUsd
          totalInputTokens += response.inputTokens
          totalOutputTokens += response.outputTokens

        } catch (error: any) {
          console.error(`Error calling ${modelConfig.provider}/${modelConfig.model}:`, error?.message || error)
          
          // Save failed result for visibility
          await supabase
            .from(TABLES.SCAN_RESULTS)
            .insert({
              scan_id: scan.id,
              provider: modelConfig.provider,
              model: modelConfig.model,
              query_text: query.query_text,
              ai_response_raw: `ERROR: ${error?.message || 'Unknown error'}`,
              metrics_json: null,
              input_tokens: 0,
              output_tokens: 0,
              cost_usd: 0,
            })
          
          // Continue with other models even if one fails
        }
        
        // Increment completed operations counter
        completedOperations++
      }
    }

    // Calculate aggregated metrics
    const aggregatedMetrics = calculateAggregatedMetrics(results)

    // Update scan with final stats
    const { data: updatedScan } = await supabase
      .from(TABLES.SCANS)
      .update({
        status: 'completed',
        overall_score: aggregatedMetrics.overall,
        avg_visibility: aggregatedMetrics.visibility,
        avg_sentiment: aggregatedMetrics.sentiment,
        avg_citation: 0, // Deprecated - visibility now includes domain
        avg_ranking: aggregatedMetrics.ranking,
        total_cost_usd: totalCost,
        total_input_tokens: totalInputTokens,
        total_output_tokens: totalOutputTokens,
        total_results: results.length,
        completed_at: new Date().toISOString(),
      })
      .eq('id', scan.id)
      .select()
      .single()

    // Update monthly usage for scan queries
    await updateMonthlyUsage(config.userId, results, 'scan')
    
    // Update monthly usage for AI evaluation (if used)
    if (evaluationCosts.length > 0) {
      const evaluationResults: ScanResult[] = evaluationCosts.map(cost => ({
        id: '',
        scan_id: scan.id,
        provider: cost.provider,
        model: cost.model,
        query_text: '',
        ai_response_raw: '',
        metrics_json: null,
        input_tokens: cost.inputTokens,
        output_tokens: cost.outputTokens,
        cost_usd: cost.costUsd,
        created_at: new Date().toISOString(),
      }))
      await updateMonthlyUsage(config.userId, evaluationResults, 'evaluation')
    }

    return updatedScan || scan

  } catch (error) {
    // Mark scan as failed
    await supabase
      .from(TABLES.SCANS)
      .update({ status: 'failed' })
      .eq('id', scan.id)

    throw error
  }
}

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

  try {
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
    
    // Sentiment is null when visibility is 0
    const visibilityScore = Math.min(100, Math.max(0, metrics.visibility_score || 0))
    const sentimentScore = visibilityScore > 0 && metrics.sentiment_score !== null
      ? Math.min(100, Math.max(0, metrics.sentiment_score))
      : null
    
    return {
      metrics: {
        visibility_score: visibilityScore,
        sentiment_score: sentimentScore,
        ranking_score: Math.min(100, Math.max(0, metrics.ranking_score || 0)),
        recommendation_score: Math.min(100, Math.max(0, metrics.recommendation_score || 0)),
      },
      cost: {
        provider,
        model: evaluationModel,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        costUsd: response.costUsd,
      }
    }
  } catch (error) {
    console.error('AI evaluation failed:', error)
    throw new Error(`AI evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

interface AggregatedMetrics {
  overall: number
  visibility: number
  sentiment: number | null  // null when no visibility (n/a)
  ranking: number | null    // null when no visibility (n/a)
}

function calculateAggregatedMetrics(results: ScanResult[]): AggregatedMetrics {
  if (results.length === 0) {
    return { overall: 0, visibility: 0, sentiment: null, ranking: null }
  }

  const metricsResults = results.filter(r => r.metrics_json)
  
  if (metricsResults.length === 0) {
    return { overall: 0, visibility: 0, sentiment: null, ranking: null }
  }

  // Calculate averages
  let totalVisibility = 0
  let totalSentiment = 0
  let sentimentCount = 0 // Only count when brand is mentioned (visibility > 0)
  let totalRanking = 0
  let rankingCount = 0   // Only count when brand is mentioned (visibility > 0)
  let totalRecommendation = 0

  for (const result of metricsResults) {
    const metrics = result.metrics_json as ScanMetrics
    totalVisibility += metrics.visibility_score
    totalRecommendation += metrics.recommendation_score
    
    // Only include sentiment and ranking when visibility > 0
    if (metrics.visibility_score > 0) {
      if (metrics.sentiment_score !== null) {
        totalSentiment += metrics.sentiment_score
        sentimentCount++
      }
      totalRanking += metrics.ranking_score
      rankingCount++
    }
  }

  const count = metricsResults.length

  return {
    visibility: Math.round(totalVisibility / count),
    sentiment: sentimentCount > 0 ? Math.round(totalSentiment / sentimentCount) : null,
    ranking: rankingCount > 0 ? Math.round(totalRanking / rankingCount) : null,
    overall: Math.round(totalRecommendation / count),
  }
}

async function updateMonthlyUsage(userId: string, results: ScanResult[], usageType: 'scan' | 'generation' | 'evaluation' = 'scan') {
  const supabase = await createClient()
  const month = new Date().toISOString().slice(0, 7)

  // Group results by provider and model
  const grouped: Record<string, { 
    inputTokens: number
    outputTokens: number
    cost: number 
    count: number
  }> = {}

  for (const result of results) {
    const key = `${result.provider}:${result.model}`
    if (!grouped[key]) {
      grouped[key] = { inputTokens: 0, outputTokens: 0, cost: 0, count: 0 }
    }
    grouped[key].inputTokens += result.input_tokens || 0
    grouped[key].outputTokens += result.output_tokens || 0
    grouped[key].cost += result.cost_usd || 0
    grouped[key].count += 1
  }

  // Upsert monthly usage for each provider/model
  for (const [key, data] of Object.entries(grouped)) {
    const [provider, model] = key.split(':')

    // Try to update existing record
    const { data: existing } = await supabase
      .from(TABLES.MONTHLY_USAGE)
      .select()
      .eq('user_id', userId)
      .eq('month', month)
      .eq('provider', provider)
      .eq('model', model)
      .eq('usage_type', usageType)
      .single()

    if (existing) {
      await supabase
        .from(TABLES.MONTHLY_USAGE)
        .update({
          total_input_tokens: existing.total_input_tokens + data.inputTokens,
          total_output_tokens: existing.total_output_tokens + data.outputTokens,
          total_cost_usd: existing.total_cost_usd + data.cost,
          scan_count: existing.scan_count + 1,
        })
        .eq('id', existing.id)
    } else {
      await supabase
        .from(TABLES.MONTHLY_USAGE)
        .insert({
          user_id: userId,
          month,
          provider,
          model,
          usage_type: usageType,
          total_input_tokens: data.inputTokens,
          total_output_tokens: data.outputTokens,
          total_cost_usd: data.cost,
          scan_count: 1,
        })
    }
  }
}
