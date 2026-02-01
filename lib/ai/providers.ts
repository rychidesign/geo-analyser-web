// =====================================================
// AI Providers Configuration
// Supports both Vercel AI Gateway and direct API calls
// https://vercel.com/docs/ai-gateway
// =====================================================

import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'

// Gateway configuration
const GATEWAY_URL = 'https://ai-gateway.vercel.sh/v1'
const GATEWAY_API_KEY = process.env.VERCEL_AI_GATEWAY_SECRET_KEY || process.env.AI_GATEWAY_API_KEY

// Direct API keys (fallback when Gateway is not configured)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const GOOGLE_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY
const GROQ_API_KEY = process.env.GROQ_API_KEY
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY

// Determine which mode to use
const USE_GATEWAY = !!GATEWAY_API_KEY

if (USE_GATEWAY) {
  console.log(`[AI] Using Vercel AI Gateway`)
} else {
  console.log(`[AI] Using direct API keys (no Gateway configured)`)
}

// =====================================================
// Provider Types
// =====================================================

export type AIProvider = 'openai' | 'anthropic' | 'google' | 'groq' | 'perplexity'

export interface ModelInfo {
  id: string
  name: string
  provider: AIProvider
  description: string
  contextWindow: number
  // Pricing per 1M tokens (in USD, will be converted to cents)
  pricing: {
    input: number
    output: number
  }
  // Is this model available for free tier users?
  availableFreeTier: boolean
  // Is this model active/available?
  isActive: boolean
}

// =====================================================
// Available Models (Current as of January 2026)
// =====================================================

export const AVAILABLE_MODELS: ModelInfo[] = [
  // OpenAI
  {
    id: 'gpt-5-2',
    name: 'GPT-5.2',
    provider: 'openai',
    description: 'Most capable OpenAI model',
    contextWindow: 256000,
    pricing: { input: 1.75, output: 14.00 },
    availableFreeTier: false,
    isActive: true,
  },
  {
    id: 'gpt-5-mini',
    name: 'GPT-5 Mini',
    provider: 'openai',
    description: 'Balanced performance and cost',
    contextWindow: 256000,
    pricing: { input: 0.25, output: 2.00 },
    availableFreeTier: true,
    isActive: true,
  },
  {
    id: 'gpt-5-nano',
    name: 'GPT-5 Nano',
    provider: 'openai',
    description: 'Fastest and most affordable OpenAI model',
    contextWindow: 128000,
    pricing: { input: 0.10, output: 0.40 },
    availableFreeTier: true,
    isActive: true,
  },
  
  // Anthropic
  {
    id: 'claude-opus-4-5',
    name: 'Claude Opus 4.5',
    provider: 'anthropic',
    description: 'Premium model combining maximum intelligence with practical performance',
    contextWindow: 200000,
    pricing: { input: 5.00, output: 25.00 },
    availableFreeTier: false,
    isActive: true,
  },
  {
    id: 'claude-sonnet-4-5',
    name: 'Claude Sonnet 4.5',
    provider: 'anthropic',
    description: 'Smart model for complex agents and coding',
    contextWindow: 200000,
    pricing: { input: 3.00, output: 15.00 },
    availableFreeTier: false,
    isActive: true,
  },
  {
    id: 'claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    description: 'Fastest model with near-frontier intelligence',
    contextWindow: 200000,
    pricing: { input: 1.00, output: 5.00 },
    availableFreeTier: true,
    isActive: true,
  },
  {
    id: 'claude-opus-4-1',
    name: 'Claude Opus 4.1',
    provider: 'anthropic',
    description: 'Previous generation flagship',
    contextWindow: 200000,
    pricing: { input: 12.00, output: 60.00 },
    availableFreeTier: false,
    isActive: true,
  },
  
  // Google
  {
    id: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash Preview',
    provider: 'google',
    description: 'Most intelligent model built for speed',
    contextWindow: 2000000,
    pricing: { input: 0.50, output: 3.00 },
    availableFreeTier: false,
    isActive: true,
  },
  {
    id: 'gemini-2-5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'google',
    description: 'Production-ready fast model',
    contextWindow: 1000000,
    pricing: { input: 0.60, output: 3.50 },
    availableFreeTier: true,
    isActive: true,
  },
  {
    id: 'gemini-2-5-flash-lite',
    name: 'Gemini 2.5 Flash Lite',
    provider: 'google',
    description: 'Most affordable Google model',
    contextWindow: 1000000,
    pricing: { input: 0.30, output: 2.50 },
    availableFreeTier: true,
    isActive: true,
  },
  
  // Groq (ultra-fast inference)
  {
    id: 'llama-4-scout',
    name: 'Llama 4 Scout',
    provider: 'groq',
    description: 'Meta Llama 4 on Groq - ultra fast',
    contextWindow: 256000,
    pricing: { input: 0.10, output: 0.15 },
    availableFreeTier: true,
    isActive: true,
  },
  {
    id: 'llama-4-maverick',
    name: 'Llama 4 Maverick',
    provider: 'groq',
    description: 'Most capable open model on Groq',
    contextWindow: 256000,
    pricing: { input: 0.20, output: 0.60 },
    availableFreeTier: true,
    isActive: true,
  },
  
  // Perplexity (web-connected)
  {
    id: 'sonar-reasoning-pro',
    name: 'Sonar Reasoning Pro',
    provider: 'perplexity',
    description: 'Advanced reasoning with web access',
    contextWindow: 128000,
    pricing: { input: 2.00, output: 8.00 },
    availableFreeTier: false,
    isActive: true,
  },
]

// =====================================================
// Provider Clients
// Supports both Gateway mode and direct API mode
// =====================================================

/**
 * Get the appropriate client and model ID for a given model
 * Returns { client, modelId } where client is the SDK instance
 */
export function getProviderClient(modelId: string): { client: ReturnType<typeof createOpenAI>, modelId: string } {
  const model = AVAILABLE_MODELS.find(m => m.id === modelId)
  if (!model) {
    throw new Error(`Unknown model: ${modelId}`)
  }
  
  // Gateway mode - single client for all providers
  if (USE_GATEWAY) {
    const gatewayClient = createOpenAI({
      apiKey: GATEWAY_API_KEY!,
      baseURL: GATEWAY_URL,
    })
    
    // Map to Gateway model format (provider/model)
    const gatewayModelMap: Record<string, string> = {
      // OpenAI
      'gpt-5-2': 'openai/gpt-5.2',
      'gpt-5-mini': 'openai/gpt-5-mini',
      'gpt-5-nano': 'openai/gpt-5-nano',
      // Anthropic
      'claude-opus-4-5': 'anthropic/claude-opus-4-5',
      'claude-sonnet-4-5': 'anthropic/claude-sonnet-4-5',
      'claude-haiku-4-5': 'anthropic/claude-haiku-4-5',
      'claude-opus-4-1': 'anthropic/claude-opus-4-1',
      // Google
      'gemini-3-flash-preview': 'google/gemini-3-flash-preview',
      'gemini-2-5-flash': 'google/gemini-2.5-flash',
      'gemini-2-5-flash-lite': 'google/gemini-2.5-flash-lite',
      // Groq / Meta
      'llama-4-scout': 'groq/llama-4-scout',
      'llama-4-maverick': 'meta/llama-4-maverick',
      // Perplexity
      'sonar-reasoning-pro': 'perplexity/sonar-reasoning-pro',
    }
    
    return {
      client: gatewayClient,
      modelId: gatewayModelMap[modelId] || `${model.provider}/${modelId}`,
    }
  }
  
  // Direct API mode - create provider-specific clients
  switch (model.provider) {
    case 'openai':
      if (!OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is not configured')
      }
      return {
        client: createOpenAI({ apiKey: OPENAI_API_KEY }),
        modelId: modelId,
      }
      
    case 'anthropic':
      if (!ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY is not configured')
      }
      // Anthropic SDK returns different type, but we cast for simplicity
      return {
        client: createAnthropic({ apiKey: ANTHROPIC_API_KEY }) as unknown as ReturnType<typeof createOpenAI>,
        modelId: modelId,
      }
      
    case 'google':
      if (!GOOGLE_API_KEY) {
        throw new Error('GOOGLE_GENERATIVE_AI_API_KEY is not configured')
      }
      return {
        client: createGoogleGenerativeAI({ apiKey: GOOGLE_API_KEY }) as unknown as ReturnType<typeof createOpenAI>,
        modelId: modelId,
      }
      
    case 'groq':
      if (!GROQ_API_KEY) {
        throw new Error('GROQ_API_KEY is not configured. Groq requires Gateway or direct API key.')
      }
      // Groq is OpenAI-compatible
      return {
        client: createOpenAI({ 
          apiKey: GROQ_API_KEY,
          baseURL: 'https://api.groq.com/openai/v1',
        }),
        modelId: modelId,
      }
      
    case 'perplexity':
      if (!PERPLEXITY_API_KEY) {
        throw new Error('PERPLEXITY_API_KEY is not configured. Perplexity requires Gateway or direct API key.')
      }
      // Perplexity is OpenAI-compatible
      return {
        client: createOpenAI({
          apiKey: PERPLEXITY_API_KEY,
          baseURL: 'https://api.perplexity.ai',
        }),
        modelId: modelId,
      }
      
    default:
      throw new Error(`Unsupported provider: ${model.provider}`)
  }
}

// Legacy exports for backward compatibility
export function getGatewayClient() {
  if (!GATEWAY_API_KEY) {
    throw new Error('AI_GATEWAY_API_KEY is not configured')
  }
  return createOpenAI({
    apiKey: GATEWAY_API_KEY,
    baseURL: GATEWAY_URL,
  })
}

export function getGatewayModelId(modelId: string): string {
  const model = AVAILABLE_MODELS.find(m => m.id === modelId)
  if (!model) {
    throw new Error(`Unknown model: ${modelId}`)
  }
  const gatewayModelMap: Record<string, string> = {
    'gpt-5-2': 'openai/gpt-5.2',
    'gpt-5-mini': 'openai/gpt-5-mini',
    'gpt-5-nano': 'openai/gpt-5-nano',
    'claude-opus-4-5': 'anthropic/claude-opus-4-5',
    'claude-sonnet-4-5': 'anthropic/claude-sonnet-4-5',
    'claude-haiku-4-5': 'anthropic/claude-haiku-4-5',
    'claude-opus-4-1': 'anthropic/claude-opus-4-1',
    'gemini-3-flash-preview': 'google/gemini-3-flash-preview',
    'gemini-2-5-flash': 'google/gemini-2.5-flash',
    'gemini-2-5-flash-lite': 'google/gemini-2.5-flash-lite',
    'llama-4-scout': 'groq/llama-4-scout',
    'llama-4-maverick': 'meta/llama-4-maverick',
    'sonar-reasoning-pro': 'perplexity/sonar-reasoning-pro',
  }
  return gatewayModelMap[modelId] || `${model.provider}/${modelId}`
}

// =====================================================
// Model Aliases (backward compatibility)
// Maps old/deprecated model IDs to current ones
// =====================================================

const MODEL_ALIASES: Record<string, string> = {
  // Very old legacy models (if any projects still use them)
  'gpt-4o': 'gpt-5-mini',
  'gpt-4o-mini': 'gpt-5-mini',
  'gpt-4-turbo': 'gpt-5-2',
  'claude-3-5-sonnet-latest': 'claude-sonnet-4-5',
  'claude-3-5-haiku-latest': 'claude-haiku-4-5',
  'claude-3-opus-latest': 'claude-opus-4-5',
  'gemini-2.0-flash': 'gemini-2-5-flash',
  'gemini-1.5-flash': 'gemini-2-5-flash-lite',
  'gemini-1.5-pro': 'gemini-3-flash-preview',
}

/**
 * Resolve model ID from alias if needed
 */
export function resolveModelId(modelId: string): string {
  return MODEL_ALIASES[modelId] || modelId
}

// =====================================================
// Helper Functions
// =====================================================

/**
 * Get provider instance for a model
 * With Gateway, we always return the Gateway client
 */
export function getProviderForModel(modelId: string) {
  const resolvedId = resolveModelId(modelId)
  const model = AVAILABLE_MODELS.find(m => m.id === resolvedId)
  if (!model) {
    throw new Error(`Unknown model: ${modelId} (resolved: ${resolvedId})`)
  }
  
  // Always use Gateway client - it routes to correct provider
  return getGatewayClient()
}

/**
 * Get model info by ID (resolves aliases)
 */
export function getModelInfo(modelId: string): ModelInfo | undefined {
  const resolvedId = resolveModelId(modelId)
  return AVAILABLE_MODELS.find(m => m.id === resolvedId)
}

/**
 * Get models by provider
 */
export function getModelsByProvider(provider: AIProvider): ModelInfo[] {
  return AVAILABLE_MODELS.filter(m => m.provider === provider && m.isActive)
}

/**
 * Get provider name from model ID (resolves aliases)
 */
export function getProviderFromModelId(modelId: string): AIProvider | null {
  const resolvedId = resolveModelId(modelId)
  const model = AVAILABLE_MODELS.find(m => m.id === resolvedId)
  return model?.provider ?? null
}

/**
 * Get free tier models
 */
export function getFreeTierModels(): ModelInfo[] {
  return AVAILABLE_MODELS.filter(m => m.availableFreeTier && m.isActive)
}

/**
 * Calculate cost for a model (base cost, before markup)
 */
export function calculateBaseCost(
  modelId: string, 
  inputTokens: number, 
  outputTokens: number
): number {
  const resolvedId = resolveModelId(modelId)
  const model = getModelInfo(resolvedId)
  if (!model) return 0
  
  const inputCost = (inputTokens / 1_000_000) * model.pricing.input
  const outputCost = (outputTokens / 1_000_000) * model.pricing.output
  
  return inputCost + outputCost
}
