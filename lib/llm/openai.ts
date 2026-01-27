import OpenAI from 'openai'
import type { LLMConfig, LLMResponse, LLMModel } from './types'

// Map our model IDs to actual OpenAI API model names
const MODEL_MAP: Record<string, string> = {
  'gpt-5-2': 'gpt-5.2',           // GPT-5.2 (latest)
  'gpt-5': 'gpt-5',               // GPT-5
  'gpt-5-mini': 'gpt-5-mini',     // GPT-5 Mini
  'gpt-5-nano': 'gpt-5-nano',     // GPT-5 Nano
  // Support legacy names with dots (from old DB entries)
  'gpt-5.2': 'gpt-5.2',
  'gpt-5.mini': 'gpt-5-mini',
  'gpt-5.nano': 'gpt-5-nano',
}

// Timeout for API calls (Vercel Hobby has 25s limit for Edge)
const API_TIMEOUT_MS = 22000

export async function callOpenAI(
  config: LLMConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<LLMResponse> {
  const client = new OpenAI({
    apiKey: config.apiKey,
    timeout: API_TIMEOUT_MS,
    maxRetries: 0, // Don't retry on timeout
  })

  // Map to actual API model name
  const apiModel = MODEL_MAP[config.model] || config.model

  const response = await client.chat.completions.create({
    model: apiModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_completion_tokens: 1000, // Limit response size to speed up (GPT-5 uses this instead of max_tokens)
  })

  const content = response.choices[0]?.message?.content || ''
  const usage = response.usage

  return {
    content,
    inputTokens: usage?.prompt_tokens || 0,
    outputTokens: usage?.completion_tokens || 0,
    model: config.model, // Return our model ID for consistency
  }
}
