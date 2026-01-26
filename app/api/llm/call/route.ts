import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserApiKeys } from '@/lib/db/settings'
import { callLLM, GEO_SYSTEM_PROMPT } from '@/lib/llm'
import type { LLMModel } from '@/lib/llm/types'

export const runtime = 'edge'
export const maxDuration = 25

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
    console.error('[LLM Proxy] Error:', error)
    return NextResponse.json(
      { error: error.message || 'LLM call failed' },
      { status: 500 }
    )
  }
}
