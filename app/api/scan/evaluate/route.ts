import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserApiKeys } from '@/lib/db/settings'
import { callLLM, calculateCost } from '@/lib/llm'
import type { LLMModel, LLMProvider } from '@/lib/llm/types'

export const runtime = 'edge'
export const maxDuration = 60

const AI_EVALUATION_PROMPT = `Analyze the following AI response and evaluate how well it mentions and recommends the brand.

Brand names: {brandVariations}
Domain: {domain}

AI Response to analyze:
"""
{content}
"""

Evaluate the response on these metrics (return scores 0-100):

1. **Visibility Score** (0-100): Is the brand mentioned at all? 
   - 100 if mentioned, 0 if not mentioned

2. **Sentiment Score** (0-100): What's the sentiment toward the brand?
   - 0 = very negative
   - 50 = neutral (just mentioned, no opinion)
   - 100 = very positive (highly recommended, praised)

3. **Citation Score** (0-100): Is the domain/URL cited?
   - 100 if domain is mentioned, 0 if not

4. **Ranking Score** (0-100): If mentioned in a list, what position?
   - 100 = first/top position
   - 80 = second position
   - 60 = third position
   - 40 = fourth position
   - 20 = fifth or lower
   - 0 = not in a list or not mentioned

5. **Recommendation Score** (0-100): Overall, how strongly is the brand recommended?
   - Consider: visibility, sentiment, ranking, prominence
   - This is a weighted overall score

Return ONLY a JSON object with this exact structure (no explanation):
{
  "visibility_score": <number>,
  "sentiment_score": <number>,
  "citation_score": <number>,
  "ranking_score": <number>,
  "recommendation_score": <number>
}`

// Helper to get provider from model name
function getProviderFromModel(model: string): LLMProvider {
  if (model.startsWith('gpt')) return 'openai'
  if (model.startsWith('claude')) return 'anthropic'
  if (model.startsWith('gemini')) return 'google'
  return 'openai'
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { content, brandVariations, domain, evaluationModel } = await request.json()

    if (!content || !brandVariations || !domain) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Get user's API keys
    const userApiKeys = await getUserApiKeys(user.id)
    if (!userApiKeys) {
      return NextResponse.json({ error: 'No API keys configured' }, { status: 400 })
    }

    // Determine which model to use for evaluation
    // Priority: 1) Specified evaluationModel, 2) User's helper model, 3) Default cheap model
    let modelToUse = evaluationModel
    
    if (!modelToUse) {
      // Try to get user's configured evaluation model from helpers settings
      const { data: helperSettings } = await supabase
        .from('user_settings')
        .select('encrypted_api_key')
        .eq('user_id', user.id)
        .eq('provider', '_helpers')
        .single()
      
      modelToUse = helperSettings?.encrypted_api_key || 'gpt-5-mini' // Default to cheapest available
    }

    const provider = getProviderFromModel(modelToUse)
    const apiKeyField = `${provider}_api_key` as keyof typeof userApiKeys
    const apiKey = userApiKeys[apiKeyField]

    if (!apiKey) {
      return NextResponse.json({ 
        error: `No API key for evaluation model provider: ${provider}` 
      }, { status: 400 })
    }

    // Build the prompt
    const prompt = AI_EVALUATION_PROMPT
      .replace('{brandVariations}', brandVariations.join(', '))
      .replace('{domain}', domain)
      .replace('{content}', content)

    // Call LLM for evaluation
    console.log(`[AI Evaluate] Using ${modelToUse} for evaluation`)
    
    const response = await callLLM(
      { provider, model: modelToUse as LLMModel, apiKey: apiKey as string },
      'You are an expert evaluator for GEO (Generative Engine Optimization). Respond only with valid JSON.',
      prompt
    )

    // Parse JSON response
    let jsonContent = response.content.trim()
    
    // Remove markdown code blocks if present
    if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }
    
    let metrics
    try {
      metrics = JSON.parse(jsonContent)
    } catch (parseError) {
      console.error('[AI Evaluate] Failed to parse response:', jsonContent)
      return NextResponse.json({ 
        error: 'Failed to parse AI evaluation response',
        rawResponse: jsonContent 
      }, { status: 500 })
    }

    // Validate and clamp scores
    const validatedMetrics = {
      visibility_score: Math.min(100, Math.max(0, metrics.visibility_score || 0)),
      sentiment_score: Math.min(100, Math.max(0, metrics.sentiment_score || 50)),
      citation_score: Math.min(100, Math.max(0, metrics.citation_score || 0)),
      ranking_score: Math.min(100, Math.max(0, metrics.ranking_score || 0)),
      recommendation_score: Math.min(100, Math.max(0, metrics.recommendation_score || 0)),
    }

    const duration = Date.now() - startTime
    console.log(`[AI Evaluate] Completed in ${duration}ms, cost: $${response.costUsd.toFixed(6)}`)

    return NextResponse.json({
      metrics: validatedMetrics,
      evaluation: {
        model: modelToUse,
        provider,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        costUsd: response.costUsd,
      },
      duration,
    })
  } catch (error: any) {
    console.error('[AI Evaluate] Error:', error)
    return NextResponse.json(
      { error: error.message || 'AI evaluation failed' },
      { status: 500 }
    )
  }
}
