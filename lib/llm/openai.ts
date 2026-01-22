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

export async function callOpenAI(
  config: LLMConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<LLMResponse> {
  const client = new OpenAI({
    apiKey: config.apiKey,
  })

  // Map to actual API model name
  const apiModel = MODEL_MAP[config.model] || config.model

  const response = await client.chat.completions.create({
    model: apiModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
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
