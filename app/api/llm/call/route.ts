import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callGEOQuery, callAI, getModelInfo } from '@/lib/ai'

export const runtime = 'edge'
export const maxDuration = 60  // Increased timeout for LLM calls

// Check if Gateway is configured (check at runtime, not module load)
function isGatewayEnabled(): boolean {
  return !!(process.env.VERCEL_AI_GATEWAY_SECRET_KEY || process.env.AI_GATEWAY_API_KEY)
}

// System prompt for follow-up queries (avoid circular import issues)
function getFollowUpSystemPrompt(language: string = 'en'): string {
  const basePrompt = `You are an AI assistant helping to analyze how other AI systems discuss and recommend brands and products.

When answering questions:
- Be helpful and provide detailed, informative responses
- If recommending products, services, or brands, be specific about names and features
- Mention relevant websites, companies, or e-commerce platforms when appropriate
- Provide balanced perspectives when comparing options
- Be natural and conversational in your responses

Your goal is to provide genuinely helpful information that would assist someone in making decisions about products, services, or brands.`

  // Add language instruction if not English
  if (language && language.toLowerCase() !== 'en' && !language.toLowerCase().startsWith('en')) {
    const languageNames: Record<string, string> = {
      cs: 'Czech (Čeština)',
      de: 'German (Deutsch)',
      fr: 'French (Français)',
      es: 'Spanish (Español)',
      pl: 'Polish (Polski)',
      sk: 'Slovak (Slovenčina)',
    }
    const langName = languageNames[language.toLowerCase()] || language
    return `${basePrompt}

IMPORTANT: You MUST respond in ${langName}. All your answers should be in ${langName}.`
  }
  
  return basePrompt
}

interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * LLM call endpoint
 * Uses Vercel AI Gateway when available, otherwise falls back to database keys
 * Supports optional conversation history for follow-up queries
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { model, query, conversationHistory, language } = await request.json() as {
      model: string
      query: string
      conversationHistory?: ConversationMessage[]
      language?: string
    }

    if (!model || !query) {
      return NextResponse.json({ error: 'Missing model or query' }, { status: 400 })
    }

    // Validate model exists
    const modelInfo = getModelInfo(model)
    if (!modelInfo) {
      return NextResponse.json({ error: `Unknown model: ${model}` }, { status: 400 })
    }

    // Use Gateway mode (centralized API keys via Vercel AI Gateway)
    if (isGatewayEnabled()) {
      const isFollowUp = conversationHistory && conversationHistory.length > 0
      console.log(`[LLM Proxy] Calling ${model} for user ${user.id.substring(0, 8)}...${isFollowUp ? ' (with conversation history)' : ''}`)
      
      let response
      
      if (isFollowUp) {
        // Build prompt with conversation history for follow-up queries
        const historyText = conversationHistory.map(msg => 
          `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
        ).join('\n\n')
        
        const fullPrompt = `Previous conversation:\n${historyText}\n\nUser: ${query}`
        
        response = await callAI({
          model,
          systemPrompt: getFollowUpSystemPrompt(language),
          userPrompt: fullPrompt,
          maxOutputTokens: 4096,
          temperature: 0.7,
        })
      } else {
        // Standard single query (with language instruction if needed)
        response = await callGEOQuery(model, query, language)
      }
      
      const duration = Date.now() - startTime
      const contentLength = response.content?.length || 0
      console.log(`[LLM Proxy] ${model} responded in ${duration}ms (content: ${contentLength} chars)`)
      
      // Warn if response seems truncated or empty
      if (contentLength === 0) {
        console.warn(`[LLM Proxy] WARNING: Empty response from ${model}`)
      } else if (contentLength < 50) {
        console.warn(`[LLM Proxy] WARNING: Very short response from ${model}: ${response.content}`)
      }

      return NextResponse.json({
        content: response.content,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        duration,
      })
    }
    
    // Gateway is required - no fallback mode
    return NextResponse.json({ 
      error: 'AI Gateway is not configured. Please set AI_GATEWAY_API_KEY environment variable.' 
    }, { status: 503 })
  } catch (error: any) {
    const duration = Date.now() - startTime
    console.error(`[LLM Proxy] Error after ${duration}ms:`, error.message || error)
    
    // Map internal errors to safe user-facing messages
    let errorMessage = 'LLM call failed'
    let status = 500
    const msg = error.message || ''
    
    if (msg.includes('timeout') || msg.includes('Timeout') || msg.includes('timed out')) {
      errorMessage = 'Request timed out. The model took too long to respond. Try a faster model like gpt-5-mini or claude-haiku.'
      status = 504
    } else if (msg.includes('model') || msg.includes('Model')) {
      errorMessage = 'Invalid model or model not available'
      status = 400
    } else if (msg.includes('API key') || msg.includes('authentication') || msg.includes('401')) {
      errorMessage = 'Invalid API key or authentication failed'
      status = 401
    } else if (msg.includes('rate') || msg.includes('429')) {
      errorMessage = 'Rate limit exceeded. Please try again later.'
      status = 429
    }
    
    return NextResponse.json(
      { error: errorMessage, duration, timedOut: status === 504 },
      { status }
    )
  }
}
