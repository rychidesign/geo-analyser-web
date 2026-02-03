import Anthropic from '@anthropic-ai/sdk'
import type { LLMConfig, LLMResponse, ConversationMessage } from '@/lib/ai'

// Map our model IDs to actual Anthropic API model names
// Using aliases that automatically point to the latest model versions
const MODEL_MAP: Record<string, string> = {
  'claude-opus-4-5': 'claude-opus-4-5',     // Claude Opus 4.5 (alias)
  'claude-sonnet-4-5': 'claude-sonnet-4-5', // Claude Sonnet 4.5 (alias)
  'claude-haiku-4-5': 'claude-haiku-4-5',   // Claude Haiku 4.5 (alias)
  'claude-opus-4-1': 'claude-opus-4-1',     // Claude Opus 4.1 (alias)
  // Support legacy names with dots (from old DB entries)
  'claude-opus-4.5': 'claude-opus-4-5',     
  'claude-sonnet-4.5': 'claude-sonnet-4-5', 
  'claude-haiku-4.5': 'claude-haiku-4-5',   
  'claude-opus-4.1': 'claude-opus-4-1',     
}

// Timeout for API calls (Vercel Hobby has 25s limit for Edge)
const API_TIMEOUT_MS = 22000

export async function callAnthropic(
  config: LLMConfig,
  systemPrompt: string,
  userPrompt: string,
  conversationHistory?: ConversationMessage[]
): Promise<LLMResponse> {
  const client = new Anthropic({
    apiKey: config.apiKey,
    timeout: API_TIMEOUT_MS,
    maxRetries: 0,
  })

  // Map to actual API model name
  const apiModel = MODEL_MAP[config.model] || config.model

  // Build messages array with optional conversation history
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = []
  
  // Add conversation history if provided
  if (conversationHistory && conversationHistory.length > 0) {
    messages.push(...conversationHistory)
  }
  
  // Add the current user prompt
  messages.push({ role: 'user', content: userPrompt })

  const response = await client.messages.create({
    model: apiModel,
    max_tokens: 1500, // Limit response size to speed up
    system: systemPrompt,
    messages,
  })

  const content = response.content[0]?.type === 'text' 
    ? response.content[0].text 
    : ''

  return {
    content,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    model: config.model, // Return our model ID for consistency
  }
}
