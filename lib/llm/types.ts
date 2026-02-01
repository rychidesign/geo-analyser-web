// LLM Provider Types

export type LLMProvider = 'openai' | 'anthropic' | 'google' | 'groq' | 'perplexity'

export type LLMModel = 
  // OpenAI
  | 'gpt-5-2'
  | 'gpt-5-mini'
  | 'gpt-5-nano'
  // Anthropic  
  | 'claude-sonnet-4-5'
  | 'claude-opus-4-5'
  | 'claude-haiku-4-5'
  | 'claude-opus-4-1'
  // Google
  | 'gemini-3-flash-preview'
  | 'gemini-2-5-flash'
  | 'gemini-2-5-flash-lite'
  // Groq
  | 'llama-4-scout'
  | 'llama-4-maverick'
  // Perplexity
  | 'sonar-reasoning-pro'

export interface ModelInfo {
  id: LLMModel
  name: string
  provider: LLMProvider
  description: string
  pricing: { input: number; output: number }  // per 1M tokens
}

// All available models
export const AVAILABLE_MODELS: ModelInfo[] = [
  // OpenAI
  {
    id: 'gpt-5-2',
    name: 'GPT-5.2',
    provider: 'openai',
    description: 'Most capable OpenAI model',
    pricing: { input: 1.75, output: 14.00 },
  },
  {
    id: 'gpt-5-mini',
    name: 'GPT-5 Mini',
    provider: 'openai',
    description: 'Balanced performance and cost',
    pricing: { input: 0.25, output: 2.00 },
  },
  {
    id: 'gpt-5-nano',
    name: 'GPT-5 Nano',
    provider: 'openai',
    description: 'Fastest and most affordable',
    pricing: { input: 0.10, output: 0.40 },
  },
  
  // Anthropic
  {
    id: 'claude-opus-4-5',
    name: 'Claude Opus 4.5',
    provider: 'anthropic',
    description: 'Premium model combining maximum intelligence with practical performance',
    pricing: { input: 5.00, output: 25.00 },
  },
  {
    id: 'claude-sonnet-4-5',
    name: 'Claude Sonnet 4.5',
    provider: 'anthropic',
    description: 'Smart model for complex agents and coding',
    pricing: { input: 3.00, output: 15.00 },
  },
  {
    id: 'claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    description: 'Fastest model with near-frontier intelligence',
    pricing: { input: 1.00, output: 5.00 },
  },
  {
    id: 'claude-opus-4-1',
    name: 'Claude Opus 4.1',
    provider: 'anthropic',
    description: 'Previous generation flagship',
    pricing: { input: 12.00, output: 60.00 },
  },
  
  // Google
  {
    id: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash Preview',
    provider: 'google',
    description: 'Most intelligent model built for speed',
    pricing: { input: 0.50, output: 3.00 },
  },
  {
    id: 'gemini-2-5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'google',
    description: 'Production-ready fast model',
    pricing: { input: 0.60, output: 3.50 },
  },
  {
    id: 'gemini-2-5-flash-lite',
    name: 'Gemini 2.5 Flash Lite',
    provider: 'google',
    description: 'Most affordable Google model',
    pricing: { input: 0.30, output: 2.50 },
  },
  
  // Groq (ultra-fast inference)
  {
    id: 'llama-4-scout',
    name: 'Llama 4 Scout',
    provider: 'groq',
    description: 'Meta Llama 4 on Groq - ultra fast',
    pricing: { input: 0.10, output: 0.15 },
  },
  {
    id: 'llama-4-maverick',
    name: 'Llama 4 Maverick',
    provider: 'groq',
    description: 'Most capable open model on Groq',
    pricing: { input: 0.20, output: 0.30 },
  },
  
  // Perplexity (web-connected)
  {
    id: 'sonar-reasoning-pro',
    name: 'Sonar Reasoning Pro',
    provider: 'perplexity',
    description: 'Advanced reasoning with web access',
    pricing: { input: 1.00, output: 4.00 },
  },
]

// Helper to get models by provider
export function getModelsByProvider(provider: LLMProvider): ModelInfo[] {
  return AVAILABLE_MODELS.filter(m => m.provider === provider)
}

// Helper to get model info by ID
export function getModelInfo(modelId: LLMModel): ModelInfo | undefined {
  return AVAILABLE_MODELS.find(m => m.id === modelId)
}

// Helper to get provider for a model ID
export function getProviderForModel(modelId: string): LLMProvider | null {
  const model = AVAILABLE_MODELS.find(m => m.id === modelId)
  return model ? model.provider : null
}

// Legacy pricing map for backward compatibility
export const MODEL_PRICING: Record<string, { input: number; output: number }> = 
  Object.fromEntries(AVAILABLE_MODELS.map(m => [m.id, m.pricing]))

export interface LLMConfig {
  provider: LLMProvider
  apiKey: string
  model: LLMModel
}

// Conversation message for multi-turn conversations
export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface LLMResponse {
  content: string
  inputTokens: number
  outputTokens: number
  model: string
}

export interface LLMCost {
  inputTokens: number
  outputTokens: number
  costUsd: number
  model: string
}

export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model]
  if (!pricing) {
    console.warn(`Unknown model pricing: ${model}, using default`)
    return 0
  }
  
  const inputCost = (inputTokens / 1_000_000) * pricing.input
  const outputCost = (outputTokens / 1_000_000) * pricing.output
  
  return inputCost + outputCost
}

// Default models for each provider (cheapest available)
export const DEFAULT_MODELS: Record<LLMProvider, LLMModel> = {
  openai: 'gpt-5-nano',
  anthropic: 'claude-haiku-4-5',
  google: 'gemini-2-5-flash-lite',
  groq: 'llama-4-scout',
  perplexity: 'sonar-reasoning-pro',
}
