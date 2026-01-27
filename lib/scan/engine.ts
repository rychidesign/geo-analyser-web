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
      evaluation_method: config.project.evaluation_method || 'regex',
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

  // Get evaluation settings if using AI evaluation
  let evaluationModel: string | null = null
  let evaluationApiKey: string | null = null
  
  if (config.project.evaluation_method === 'ai') {
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
        console.warn(`No API key for evaluation model provider ${evalProvider}, falling back to regex`)
        evaluationModel = null
      }
    }
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

          // Analyze the response for brand mentions
          let metrics: ScanMetrics
          let evaluationCost: { provider: LLMProvider; model: string; inputTokens: number; outputTokens: number; costUsd: number } | null = null
          
          if (config.project.evaluation_method === 'ai' && evaluationModel && evaluationApiKey) {
            // Use AI evaluation
            const evalResult = await analyzeResponseWithAI(
              response.content,
              config.project.brand_variations,
              config.project.domain,
              evaluationModel,
              evaluationApiKey
            )
            metrics = evalResult.metrics
            evaluationCost = evalResult.cost
            
            // Track evaluation costs
            if (evaluationCost.costUsd > 0) {
              evaluationCosts.push(evaluationCost)
            }
          } else {
            // Use regex evaluation (default/fallback)
            metrics = analyzeResponse(
              response.content,
              config.project.brand_variations,
              config.project.domain
            )
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

2. **Sentiment Score** (0-100): What's the sentiment toward the brand?
   - ONLY analyze sentences/context where brand or domain is mentioned
   - If brand NOT mentioned at all, return 0.
   - 0 = very negative, 50 = neutral, 100 = very positive
   - Ignore sentiment in parts of the response that don't mention the brand

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
  "sentiment_score": <number>,
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
    
    return {
      metrics: {
        visibility_score: Math.min(100, Math.max(0, metrics.visibility_score || 0)),
        sentiment_score: Math.min(100, Math.max(0, metrics.sentiment_score || 0)),
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
    console.error('AI evaluation failed, falling back to regex:', error)
    // Fall back to regex evaluation if AI fails
    return {
      metrics: analyzeResponse(content, brandVariations, domain),
      cost: {
        provider: 'openai' as LLMProvider,
        model: evaluationModel,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
      }
    }
  }
}

// Helper: Extract sentences containing brand/domain mentions for context-aware sentiment
function extractBrandContext(content: string, brandVariations: string[], domain: string): string {
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0)
  const relevantSentences: string[] = []
  
  for (const sentence of sentences) {
    const lowerSentence = sentence.toLowerCase()
    const hasBrand = brandVariations.some(brand => lowerSentence.includes(brand.toLowerCase()))
    const hasDomain = lowerSentence.includes(domain.toLowerCase())
    
    if (hasBrand || hasDomain) {
      relevantSentences.push(sentence)
    }
  }
  
  return relevantSentences.join(' ').toLowerCase()
}

// Regex-based evaluation (fast & free)
function analyzeResponse(
  content: string,
  brandVariations: string[],
  domain: string
): ScanMetrics {
  const lowerContent = content.toLowerCase()
  
  // Check presence
  const brandMentioned = brandVariations.some(brand => 
    lowerContent.includes(brand.toLowerCase())
  )
  const domainMentioned = lowerContent.includes(domain.toLowerCase())

  // Combined Visibility Score: brand (50) + domain (50) = 100
  let visibilityScore = 0
  if (brandMentioned) visibilityScore += 50
  if (domainMentioned) visibilityScore += 50

  // Sentiment Score (0-100): Only calculated from context around brand/domain mentions
  // 50 = neutral, 0 = negative, 100 = positive
  let sentimentScore = 0
  if (brandMentioned || domainMentioned) {
    // Extract only sentences that mention the brand or domain
    const brandContext = extractBrandContext(content, brandVariations, domain)
    
    const positiveWords = ['best', 'excellent', 'great', 'recommend', 'top', 'leading', 'popular', 'trusted', 'reliable', 'effective', 'amazing', 'outstanding', 'superior', 'innovative']
    const negativeWords = ['worst', 'bad', 'avoid', 'poor', 'unreliable', 'expensive', 'limited', 'lacking', 'disappointing', 'inferior', 'problematic']
    
    let sentimentRaw = 0
    for (const word of positiveWords) {
      if (brandContext.includes(word)) sentimentRaw += 1
    }
    for (const word of negativeWords) {
      if (brandContext.includes(word)) sentimentRaw -= 1
    }
    // Convert to 0-100 scale (clamp between -5 and 5, then scale)
    sentimentRaw = Math.max(-5, Math.min(5, sentimentRaw))
    sentimentScore = Math.round(50 + (sentimentRaw * 10))
  }

  // Ranking Score (0-100): Position in list (1st = 100, 2nd = 80, etc.)
  let rankingScore = 0
  for (const brand of brandVariations) {
    const escapedBrand = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    
    // Pattern 1: Numbered lists (1. Brand, 2) Brand, etc.)
    const numberedPatterns = [
      { regex: new RegExp(`1[.):\\s]+[^\\n]*${escapedBrand}`, 'i'), score: 100 },
      { regex: new RegExp(`2[.):\\s]+[^\\n]*${escapedBrand}`, 'i'), score: 80 },
      { regex: new RegExp(`3[.):\\s]+[^\\n]*${escapedBrand}`, 'i'), score: 60 },
      { regex: new RegExp(`4[.):\\s]+[^\\n]*${escapedBrand}`, 'i'), score: 40 },
      { regex: new RegExp(`5[.):\\s]+[^\\n]*${escapedBrand}`, 'i'), score: 20 },
    ]
    
    for (const { regex, score } of numberedPatterns) {
      if (regex.test(content)) {
        rankingScore = Math.max(rankingScore, score)
        break
      }
    }
    
    // Pattern 1b: Items with colon at start of lines (Brand.cz:, Brand:)
    if (rankingScore === 0) {
      const lines = content.split('\n')
      const brandLines: number[] = []
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()
        // Check if line starts with brand name followed by colon
        const colonPattern = new RegExp(`^[^:]*${escapedBrand}[^:]*:`, 'i')
        if (colonPattern.test(line)) {
          brandLines.push(i)
        }
      }
      
      if (brandLines.length > 0) {
        // Find position among all colon-style items
        const allColonLines: number[] = []
        for (let i = 0; i < lines.length; i++) {
          if (/^[^:]+:/.test(lines[i].trim())) {
            allColonLines.push(i)
          }
        }
        
        const position = allColonLines.indexOf(brandLines[0]) + 1
        if (position > 0) {
          const scores = [100, 80, 60, 40, 20]
          rankingScore = Math.max(rankingScore, scores[Math.min(position - 1, 4)] || 0)
        }
      }
    }
    
    // Pattern 2: Comma/semicolon separated lists (Brand1, Brand2, Brand3)
    // Check if brand appears first in a comma-separated list
    if (rankingScore < 100) {
      // Match patterns like "retailers: Brand, Other, Other" or "Brand, Other, Other"
      const listPatterns = [
        // Brand is first in comma-separated list (possibly after a colon)
        new RegExp(`(?::|jsou|are|include|like|such as|například|např\\.|e\\.g\\.)\\s*${escapedBrand}\\s*[,;]`, 'i'),
        // Brand is first item followed by comma and other items
        new RegExp(`${escapedBrand}\\s*[,;]\\s*[A-Z][a-zA-Z.]+\\s*[,;]`, 'i'),
      ]
      
      for (const regex of listPatterns) {
        if (regex.test(content)) {
          rankingScore = Math.max(rankingScore, 100)
          break
        }
      }
    }
    
    // Pattern 3: Check position in any comma-separated list
    if (rankingScore < 100) {
      // Find all comma-separated lists and check brand position
      const listRegex = /(?::|jsou|are|include|like|such as|například|např\.|e\.g\.)\s*([^.!?\n]+)/gi
      let match
      while ((match = listRegex.exec(content)) !== null) {
        const listContent = match[1]
        const items = listContent.split(/[,;]/).map(s => s.trim()).filter(s => s.length > 0)
        
        for (let i = 0; i < Math.min(items.length, 5); i++) {
          if (new RegExp(escapedBrand, 'i').test(items[i])) {
            const positionScore = [100, 80, 60, 40, 20][i]
            rankingScore = Math.max(rankingScore, positionScore)
            break
          }
        }
      }
    }
    
    if (rankingScore === 100) break
  }

  // Recommendation Score (0-100): Weighted combination
  let recommendationScore = 0
  if (brandMentioned) {
    recommendationScore += visibilityScore * 0.35     // 35% weight (includes domain)
    recommendationScore += (sentimentScore - 50) * 0.35 // 35% weight (centered at 50)
    recommendationScore += rankingScore * 0.3         // 30% weight
    recommendationScore = Math.min(100, Math.max(0, Math.round(recommendationScore + 30))) // Base of 30 if visible
  }

  return {
    visibility_score: visibilityScore,
    sentiment_score: sentimentScore,
    ranking_score: rankingScore,
    recommendation_score: recommendationScore,
  }
}

interface AggregatedMetrics {
  overall: number
  visibility: number
  sentiment: number
  ranking: number
}

function calculateAggregatedMetrics(results: ScanResult[]): AggregatedMetrics {
  if (results.length === 0) {
    return { overall: 0, visibility: 0, sentiment: 0, ranking: 0 }
  }

  const metricsResults = results.filter(r => r.metrics_json)
  
  if (metricsResults.length === 0) {
    return { overall: 0, visibility: 0, sentiment: 0, ranking: 0 }
  }

  // Calculate averages
  let totalVisibility = 0
  let totalSentiment = 0
  let sentimentCount = 0 // Only count sentiment when brand is mentioned
  let totalRanking = 0
  let totalRecommendation = 0

  for (const result of metricsResults) {
    const metrics = result.metrics_json as ScanMetrics
    totalVisibility += metrics.visibility_score
    totalRanking += metrics.ranking_score
    totalRecommendation += metrics.recommendation_score
    
    // Only include sentiment in average if brand was mentioned (visibility > 0)
    if (metrics.visibility_score > 0 && metrics.sentiment_score > 0) {
      totalSentiment += metrics.sentiment_score
      sentimentCount++
    }
  }

  const count = metricsResults.length

  return {
    visibility: Math.round(totalVisibility / count),
    sentiment: sentimentCount > 0 ? Math.round(totalSentiment / sentimentCount) : 0,
    ranking: Math.round(totalRanking / count),
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
