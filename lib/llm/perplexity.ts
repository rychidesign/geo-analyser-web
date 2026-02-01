import type { LLMConfig, LLMResponse, ConversationMessage } from './types'

// Map our model IDs to actual Perplexity API model names
const MODEL_MAP: Record<string, string> = {
  'sonar-reasoning-pro': 'sonar-reasoning-pro',
  // Legacy names
  'sonar-small-online': 'sonar-small-online',
  'sonar-large-online': 'sonar-large-online',
}

// Timeout for API calls (Perplexity can be slow due to web search)
const API_TIMEOUT_MS = 30000

export async function callPerplexity(
  config: LLMConfig,
  systemPrompt: string,
  userPrompt: string,
  conversationHistory?: ConversationMessage[]
): Promise<LLMResponse> {
  // Map to actual API model name
  const apiModel = MODEL_MAP[config.model] || config.model

  // Build messages array with optional conversation history
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
  ]
  
  // Add conversation history if provided
  if (conversationHistory && conversationHistory.length > 0) {
    messages.push(...conversationHistory)
  }
  
  // Add the current user prompt
  messages.push({ role: 'user', content: userPrompt })

  // Perplexity uses OpenAI-compatible API
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: apiModel,
      messages,
      max_tokens: 2000,
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Perplexity API error: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content || ''

  if (!content) {
    console.warn(`[Perplexity] Empty response from ${apiModel}`)
  }

  return {
    content,
    inputTokens: data.usage?.prompt_tokens || 0,
    outputTokens: data.usage?.completion_tokens || 0,
    model: config.model,
  }
}
