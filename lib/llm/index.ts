import { callOpenAI } from './openai'
import { callAnthropic } from './anthropic'
import { callGoogle } from './google'
import { calculateCost } from './types'
import type { LLMConfig, LLMResponse, LLMCost, LLMProvider } from './types'

export * from './types'

export interface LLMResult extends LLMResponse {
  provider: LLMProvider
  costUsd: number
}

export async function callLLM(
  config: LLMConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<LLMResult> {
  let response: LLMResponse

  switch (config.provider) {
    case 'openai':
      response = await callOpenAI(config, systemPrompt, userPrompt)
      break
    case 'anthropic':
      response = await callAnthropic(config, systemPrompt, userPrompt)
      break
    case 'google':
      response = await callGoogle(config, systemPrompt, userPrompt)
      break
    default:
      throw new Error(`Unknown provider: ${config.provider}`)
  }

  const costUsd = calculateCost(response.model, response.inputTokens, response.outputTokens)

  return {
    ...response,
    provider: config.provider,
    costUsd,
  }
}

// GEO Analysis prompts
export const GEO_SYSTEM_PROMPT = `You are an AI assistant helping to analyze how other AI systems discuss and recommend brands and products. 
Your task is to provide natural, informative responses as if you were a helpful AI assistant being asked about products or services.
Be honest and balanced in your assessments. Include specific details when relevant.`

export function createQueryPrompt(query: string): string {
  return query
}
