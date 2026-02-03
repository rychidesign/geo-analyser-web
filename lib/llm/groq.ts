import Groq from 'groq-sdk'
import type { LLMConfig, LLMResponse, ConversationMessage } from '@/lib/ai'

// Map our model IDs to actual Groq API model names
const MODEL_MAP: Record<string, string> = {
  'llama-4-scout': 'llama-4-scout-17b-16e-instruct',
  'llama-4-maverick': 'llama-4-maverick-17b-128e-instruct',
  // Legacy names
  'llama-3.3-70b': 'llama-3.3-70b-versatile',
  'llama-3.1-8b': 'llama-3.1-8b-instant',
}

// Timeout for API calls
const API_TIMEOUT_MS = 22000

export async function callGroq(
  config: LLMConfig,
  systemPrompt: string,
  userPrompt: string,
  conversationHistory?: ConversationMessage[]
): Promise<LLMResponse> {
  const client = new Groq({
    apiKey: config.apiKey,
    timeout: API_TIMEOUT_MS,
    maxRetries: 0,
  })

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

  const response = await client.chat.completions.create({
    model: apiModel,
    messages,
    max_tokens: 2000,
    temperature: 0.7,
  })

  const content = response.choices[0]?.message?.content || ''

  if (!content) {
    console.warn(`[Groq] Empty response from ${apiModel}`)
  }

  return {
    content,
    inputTokens: response.usage?.prompt_tokens || 0,
    outputTokens: response.usage?.completion_tokens || 0,
    model: config.model,
  }
}
