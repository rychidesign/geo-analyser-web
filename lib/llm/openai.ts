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

  // GPT-5 models use the Responses API with different parameters
  const response = await client.responses.create({
    model: apiModel,
    input: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_output_tokens: 1000,
  })

  // Extract content - try multiple possible response structures
  let content = ''
  if (response.output_text) {
    content = response.output_text
  } else if (response.output && Array.isArray(response.output)) {
    // Some models return output as array of message objects
    const textOutput = response.output.find((o: any) => o.type === 'message' || o.content)
    if (textOutput?.content) {
      if (Array.isArray(textOutput.content)) {
        content = textOutput.content.map((c: any) => c.text || c).join('')
      } else {
        content = textOutput.content
      }
    }
  }

  // Log for debugging if content is empty
  if (!content) {
    console.warn(`[OpenAI] Empty response from ${apiModel}. Response structure:`, JSON.stringify(response).slice(0, 500))
  }

  return {
    content,
    inputTokens: response.usage?.input_tokens || 0,
    outputTokens: response.usage?.output_tokens || 0,
    model: config.model,
  }
}
