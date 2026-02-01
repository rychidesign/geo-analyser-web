import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callEvaluation, getCheapestEvaluationModel, getModelInfo, type EvaluationMetrics } from '@/lib/ai'
import { calculateDynamicCost } from '@/lib/credits'

export const runtime = 'edge'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  console.log('[AI Evaluate] Request received')

  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      console.log('[AI Evaluate] Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { content, brandVariations, domain, evaluationModel } = body
    
    console.log(`[AI Evaluate] Content length: ${content?.length || 0}, domain: ${domain}`)

    if (!content || !brandVariations || !domain) {
      console.log('[AI Evaluate] Missing fields - content:', !!content, 'brandVariations:', !!brandVariations, 'domain:', !!domain)
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Determine which model to use for evaluation
    // Priority: 1) Specified evaluationModel, 2) User's helper model, 3) Cheapest model
    let modelToUse = evaluationModel
    
    if (!modelToUse) {
      // Try to get user's configured evaluation model
      const { data: helperSettings } = await supabase
        .from('user_settings')
        .select('encrypted_api_key')
        .eq('user_id', user.id)
        .eq('provider', '_helpers')
        .single()
      
      modelToUse = helperSettings?.encrypted_api_key || getCheapestEvaluationModel()
    }

    // Validate model
    const modelInfo = getModelInfo(modelToUse)
    if (!modelInfo) {
      console.warn(`[AI Evaluate] Unknown model ${modelToUse}, using default`)
      modelToUse = getCheapestEvaluationModel()
    }

    // Call AI for evaluation using new AI module with retry
    console.log(`[AI Evaluate] Using ${modelToUse} for evaluation`)
    
    let result
    let lastError
    const MAX_RETRIES = 2
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        result = await callEvaluation(
          modelToUse,
          content,
          brandVariations,
          domain
        )
        
        // If we got valid metrics, break out of retry loop
        if (result.metrics) {
          break
        }
        
        console.warn(`[AI Evaluate] Attempt ${attempt}: No valid metrics, ${attempt < MAX_RETRIES ? 'retrying...' : 'giving up'}`)
        lastError = 'Failed to parse metrics'
        
      } catch (err: any) {
        lastError = err.message
        console.warn(`[AI Evaluate] Attempt ${attempt} failed: ${err.message}`)
        
        if (attempt < MAX_RETRIES) {
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
        }
      }
    }
    
    if (!result) {
      return NextResponse.json({ 
        error: lastError || 'Evaluation failed after retries'
      }, { status: 500 })
    }

    // Calculate cost with markup
    const costCents = await calculateDynamicCost(
      modelToUse,
      result.inputTokens,
      result.outputTokens
    )

    const duration = Date.now() - startTime
    console.log(`[AI Evaluate] Completed in ${duration}ms, cost: ${costCents} cents`)

    // Use parsed metrics if available, otherwise return fallback metrics
    // This ensures we always return something usable
    if (!result.metrics) {
      console.warn('[AI Evaluate] Using fallback metrics (evaluation parsing failed)')
      
      // Provide fallback metrics so the scan result can still be saved
      const fallbackMetrics: EvaluationMetrics = {
        visibility_score: 0,
        sentiment_score: null,
        ranking_score: 0,
        recommendation_score: 0,
      }
      
      return NextResponse.json({
        metrics: fallbackMetrics,
        evaluation: {
          model: modelToUse,
          provider: result.provider,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          costUsd: 0, // Don't charge for failed evaluation
          costCents: 0,
          baseCostUsd: 0,
        },
        duration: Date.now() - startTime,
        warning: 'Evaluation parsing failed, using fallback metrics',
      })
    }

    // Validate visibility = 0 case: ensure sentiment is null
    const validatedMetrics: EvaluationMetrics = {
      visibility_score: result.metrics.visibility_score,
      sentiment_score: result.metrics.visibility_score > 0 
        ? result.metrics.sentiment_score 
        : null,
      ranking_score: result.metrics.ranking_score,
      recommendation_score: result.metrics.visibility_score > 0 
        ? result.metrics.recommendation_score 
        : 0,
    }

    return NextResponse.json({
      metrics: validatedMetrics,
      evaluation: {
        model: modelToUse,
        provider: result.provider,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: costCents / 100,
        costCents,
        baseCostUsd: result.baseCostUsd,
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
