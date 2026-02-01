import OpenAI from 'openai'
import type { LLMConfig, LLMResponse, LLMModel, ConversationMessage } from './types'

// Map our model IDs to actual OpenAI API model names
const MODEL_MAP: Record<string, string> = {
  'gpt-5-2': 'gpt-5.2',           // GPT-5.2 (latest)
  'gpt-5-mini': 'gpt-5-mini',     // GPT-5 Mini
  'gpt-5-nano': 'gpt-5-nano',     // GPT-5 Nano (cheapest)
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
  userPrompt: string,
  conversationHistory?: ConversationMessage[]
): Promise<LLMResponse> {
  const client = new OpenAI({
    apiKey: config.apiKey,
    timeout: API_TIMEOUT_MS,
    maxRetries: 0, // Don't retry on timeout
  })

  // Map to actual API model name
  const apiModel = MODEL_MAP[config.model] || config.model

  // GPT-5-nano uses chain-of-thought reasoning internally which consumes
  // many tokens before generating the final answer - needs higher limit
  const maxTokens = apiModel.includes('nano') ? 8000 : 2000

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

  // GPT-5 models use the Responses API with different parameters
  const response = await client.responses.create({
    model: apiModel,
    input: messages,
    max_output_tokens: maxTokens,
  })

  // Extract content - try multiple possible response structures
  let content = ''
  if (response.output_text) {
    content = response.output_text
  } else if (response.output && Array.isArray(response.output)) {
    // Some models return output as array of message objects
    for (const item of response.output) {
      const output = item as any
      if (output.type === 'message' && output.content) {
        if (Array.isArray(output.content)) {
          content = output.content.map((c: any) => c.text || c).join('')
        } else {
          content = output.content
        }
        break
      }
    }
  }

  // Log for debugging if content is empty
  if (!content) {
    console.warn(`[OpenAI] Empty response from ${apiModel}. Response structure:`, JSON.stringify(response).slice(0, 500))
    
    // Check if it's incomplete due to token limit
    const responseAny = response as any
    if (responseAny.status === 'incomplete' && responseAny.incomplete_details?.reason === 'max_output_tokens') {
      console.error(`[OpenAI] ${apiModel} hit token limit (${maxTokens}) - response truncated. Model may need higher limit.`)
    }
  }

  return {
    content,
    inputTokens: response.usage?.input_tokens || 0,
    outputTokens: response.usage?.output_tokens || 0,
    model: config.model,
  }
}
