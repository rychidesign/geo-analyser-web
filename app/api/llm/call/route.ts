import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserApiKeys } from '@/lib/db/settings'
import { callLLM, GEO_SYSTEM_PROMPT } from '@/lib/llm'
import type { LLMModel } from '@/lib/llm/types'

export const runtime = 'edge'
export const maxDuration = 60  // Increased timeout for LLM calls

/**
 * Thin proxy endpoint for LLM calls
 * Frontend calls this with model + query, gets back LLM response
 * This keeps the API route fast - actual LLM call happens here but we have 25s
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { model, query } = await request.json()

    if (!model || !query) {
      return NextResponse.json({ error: 'Missing model or query' }, { status: 400 })
    }

    // Get user's API keys
    const userApiKeys = await getUserApiKeys(user.id)
    if (!userApiKeys) {
      return NextResponse.json({ error: 'No API keys configured' }, { status: 400 })
    }

    // Import model info dynamically to avoid loading all models
    const { AVAILABLE_MODELS } = await import('@/lib/llm/types')
    const modelInfo = AVAILABLE_MODELS.find(m => m.id === model)
    
    if (!modelInfo) {
      return NextResponse.json({ error: `Unknown model: ${model}` }, { status: 400 })
    }

    const apiKeyField = `${modelInfo.provider}_api_key` as keyof typeof userApiKeys
    const apiKey = userApiKeys[apiKeyField]

    if (!apiKey) {
      return NextResponse.json({ error: `No API key for ${model}` }, { status: 400 })
    }

    // Call LLM
    console.log(`[LLM Proxy] Calling ${model} for user ${user.id}`)
    const response = await callLLM(
      {
        provider: modelInfo.provider,
        apiKey: apiKey as string,
        model: model as LLMModel,
      },
      GEO_SYSTEM_PROMPT,
      query
    )

    const duration = Date.now() - startTime
    console.log(`[LLM Proxy] ${model} responded in ${duration}ms`)

    return NextResponse.json({
      content: response.content,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      duration,
    })
  } catch (error: any) {
    const duration = Date.now() - startTime
    console.error(`[LLM Proxy] Error after ${duration}ms:`, error.message || error)
    
    // Provide more specific error messages
    let errorMessage = error.message || 'LLM call failed'
    let status = 500
    
    if (error.message?.includes('timeout') || error.message?.includes('Timeout') || error.message?.includes('timed out')) {
      errorMessage = 'Request timed out. The model took too long to respond. Try a faster model like gpt-5-mini or claude-haiku.'
      status = 504
    } else if (error.message?.includes('model') || error.message?.includes('Model')) {
      errorMessage = `Invalid model or model not available: ${error.message}`
      status = 400
    } else if (error.message?.includes('API key') || error.message?.includes('authentication') || error.message?.includes('401')) {
      errorMessage = 'Invalid API key or authentication failed'
      status = 401
    } else if (error.message?.includes('rate') || error.message?.includes('429')) {
      errorMessage = 'Rate limit exceeded. Please try again later.'
      status = 429
    }
    
    return NextResponse.json(
      { error: errorMessage, duration, timedOut: status === 504 },
      { status }
    )
  }
}
