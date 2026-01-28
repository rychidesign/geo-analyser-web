import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserApiKeys } from '@/lib/db/settings'
import { callLLM, GEO_SYSTEM_PROMPT, calculateCost } from '@/lib/llm'
import { AVAILABLE_MODELS, type LLMModel } from '@/lib/llm/types'
import { TABLES, type ScanMetrics } from '@/lib/db/schema'

export const runtime = 'edge'
export const maxDuration = 25 // Edge runtime allows up to 30s on Hobby plan

// Helper: Extract sentences containing brand/domain mentions for context-aware sentiment
function extractBrandContext(response: string, brandVariations: string[], domain: string): string {
  const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 0)
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

// Helper: Analyze response using regex patterns
function analyzeResponseRegex(content: string, brandVariations: string[], domain: string): ScanMetrics {
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

  // Sentiment Score (0-100 or null): Only calculated if visibility > 0
  let sentimentScore: number | null = null
  if (visibilityScore > 0) {
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
    sentimentRaw = Math.max(-5, Math.min(5, sentimentRaw))
    sentimentScore = Math.round(50 + (sentimentRaw * 10))
  }

  // Ranking Score (0-100): Position in list (1st = 100, 2nd = 80, etc.)
  let rankingScore = 0
  const positionScores = [100, 80, 60, 40, 20]
  
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
    
    // Pattern 2: Parenthetical lists (Brand1, Brand2, Brand3)
    if (rankingScore < 100) {
      const parenListRegex = /\(([^)]+)\)/g
      let match
      while ((match = parenListRegex.exec(content)) !== null) {
        const listContent = match[1]
        if (listContent.includes(',')) {
          const items = listContent.split(/[,;]/).map(s => s.trim()).filter(s => s.length > 0)
          for (let i = 0; i < Math.min(items.length, 5); i++) {
            if (new RegExp(escapedBrand, 'i').test(items[i])) {
              rankingScore = Math.max(rankingScore, positionScores[i])
              break
            }
          }
        }
      }
    }
    
    // Pattern 3: Comma-separated lists after keywords (jako, jsou, include, etc.)
    if (rankingScore < 100) {
      const listKeywords = [
        'jako', 'jsou', 'například', 'např\\.', 'patří', 'nabízejí', 'nabízí',
        'doporučuji', 'doporučujeme', 'zkuste', 'vyzkoušejte', 'třeba',
        ':', 'are', 'include', 'includes', 'like', 'such as', 'e\\.g\\.',
        'recommend', 'try', 'check out', 'visit', 'consider', 'offers'
      ]
      const keywordPattern = listKeywords.join('|')
      const listRegex = new RegExp(`(?:${keywordPattern})\\s*([^.!?\\n]+)`, 'gi')
      
      let match
      while ((match = listRegex.exec(content)) !== null) {
        const listContent = match[1]
        const items = listContent.split(/[,;]/).map(s => s.trim()).filter(s => s.length > 0)
        
        for (let i = 0; i < Math.min(items.length, 5); i++) {
          if (new RegExp(escapedBrand, 'i').test(items[i])) {
            rankingScore = Math.max(rankingScore, positionScores[i])
            break
          }
        }
      }
    }
    
    if (rankingScore === 100) break
  }

  // Recommendation Score (0-100): Weighted combination
  let recommendationScore = 0
  if (brandMentioned && sentimentScore !== null) {
    recommendationScore += visibilityScore * 0.35
    recommendationScore += (sentimentScore - 50) * 0.35
    recommendationScore += rankingScore * 0.3
    recommendationScore = Math.min(100, Math.max(0, Math.round(recommendationScore + 30)))
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
