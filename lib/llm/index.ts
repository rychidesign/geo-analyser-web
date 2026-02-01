import { callOpenAI } from './openai'
import { callAnthropic } from './anthropic'
import { callGoogle } from './google'
import { callGroq } from './groq'
import { callPerplexity } from './perplexity'
import { calculateDynamicCost } from '@/lib/credits'
import type { LLMConfig, LLMResponse, LLMCost, LLMProvider, ConversationMessage } from './types'

export * from './types'

export interface LLMResult extends LLMResponse {
  provider: LLMProvider
  costUsd: number
}

/**
 * Call an LLM with optional conversation history for follow-up queries
 * 
 * @param config - LLM configuration (provider, model, API key)
 * @param systemPrompt - System prompt for the LLM
 * @param userPrompt - Current user prompt
 * @param conversationHistory - Optional array of previous messages for context
 */
export async function callLLM(
  config: LLMConfig,
  systemPrompt: string,
  userPrompt: string,
  conversationHistory?: ConversationMessage[]
): Promise<LLMResult> {
  let response: LLMResponse

  switch (config.provider) {
    case 'openai':
      response = await callOpenAI(config, systemPrompt, userPrompt, conversationHistory)
      break
    case 'anthropic':
      response = await callAnthropic(config, systemPrompt, userPrompt, conversationHistory)
      break
    case 'google':
      response = await callGoogle(config, systemPrompt, userPrompt, conversationHistory)
      break
    case 'groq':
      response = await callGroq(config, systemPrompt, userPrompt, conversationHistory)
      break
    case 'perplexity':
      response = await callPerplexity(config, systemPrompt, userPrompt, conversationHistory)
      break
    default:
      throw new Error(`Unknown provider: ${config.provider}`)
  }

  // Use dynamic pricing from database (pricing_config table)
  const costCents = await calculateDynamicCost(response.model, response.inputTokens, response.outputTokens)
  const costUsd = costCents / 100

  return {
    ...response,
    provider: config.provider,
    costUsd,
  }
}

// GEO Analysis prompts - base prompt without language instruction
const GEO_SYSTEM_PROMPT_BASE = `You are an AI assistant helping to analyze how other AI systems discuss and recommend brands and products. 
Your task is to provide natural, informative responses as if you were a helpful AI assistant being asked about products or services.
Be honest and balanced in your assessments. Include specific details when relevant.

IMPORTANT: Keep your response concise (2-4 paragraphs maximum). Focus on the most important information and always complete your thoughts. Do not leave sentences unfinished.`

/**
 * Get GEO system prompt with optional language instruction
 * @param language - Language code (e.g., 'cs', 'en', 'de')
 */
export function getGEOSystemPrompt(language?: string): string {
  // If no language specified or English, return base prompt
  if (!language || language.toLowerCase() === 'en' || language.toLowerCase().startsWith('en')) {
    return GEO_SYSTEM_PROMPT_BASE
  }
  
  // Map language codes to full names for clearer instruction
  const languageNames: Record<string, string> = {
    cs: 'Czech (Čeština)',
    de: 'German (Deutsch)',
    fr: 'French (Français)',
    es: 'Spanish (Español)',
    pl: 'Polish (Polski)',
    sk: 'Slovak (Slovenčina)',
    it: 'Italian (Italiano)',
    pt: 'Portuguese (Português)',
    nl: 'Dutch (Nederlands)',
    ru: 'Russian (Русский)',
  }
  const langName = languageNames[language.toLowerCase()] || language
  
  return `${GEO_SYSTEM_PROMPT_BASE}

IMPORTANT: You MUST respond in ${langName}. All your answers should be written in ${langName}.`
}

// Legacy export for backward compatibility
export const GEO_SYSTEM_PROMPT = GEO_SYSTEM_PROMPT_BASE

export function createQueryPrompt(query: string): string {
  return query
}
