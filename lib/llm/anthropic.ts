import Anthropic from '@anthropic-ai/sdk'
import type { LLMConfig, LLMResponse } from './types'

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

export async function callAnthropic(
  config: LLMConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<LLMResponse> {
  const client = new Anthropic({
    apiKey: config.apiKey,
  })

  // Map to actual API model name
  const apiModel = MODEL_MAP[config.model] || config.model

  const response = await client.messages.create({
    model: apiModel,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      { role: 'user', content: userPrompt },
    ],
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
