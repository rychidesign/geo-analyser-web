// =====================================================
// AI Module - Main Entry Point
// Using Vercel AI SDK with Gateway
// =====================================================

import { generateText } from 'ai'
import { 
  getProviderClient,
  getModelInfo, 
  calculateBaseCost,
  resolveModelId,
  AVAILABLE_MODELS,
  type AIProvider,
  type ModelInfo,
} from './providers'

export * from './providers'

// =====================================================
// Types
// =====================================================

export interface AICallConfig {
  model: string
  systemPrompt?: string
  userPrompt: string
  maxOutputTokens?: number
  temperature?: number
}

export interface AICallResult {
  content: string
  model: string
  provider: AIProvider
  inputTokens: number
  outputTokens: number
  totalTokens: number
  baseCostUsd: number      // Cost before markup
  finishReason: string
  durationMs: number
}

export interface AICallError {
  error: string
  code?: string
  provider?: AIProvider
  model?: string
}

// =====================================================
// Main AI Call Function
// =====================================================

/**
 * Call an AI model using Vercel AI Gateway or direct API
 * https://vercel.com/docs/ai-gateway
 */
export async function callAI(config: AICallConfig): Promise<AICallResult> {
  const startTime = Date.now()
  
  // Resolve model alias to actual model ID
  const resolvedModelId = resolveModelId(config.model)
  
  const modelInfo = getModelInfo(resolvedModelId)
  if (!modelInfo) {
    throw new Error(`Unknown model: ${config.model} (resolved: ${resolvedModelId})`)
  }
  
  if (!modelInfo.isActive) {
    throw new Error(`Model is not active: ${resolvedModelId}`)
  }
  
  // Get provider client and formatted model ID
  const { client, modelId: formattedModelId } = getProviderClient(resolvedModelId)
  
  // Log if alias was used
  if (config.model !== resolvedModelId) {
    console.log(`[AI] Model alias resolved: ${config.model} -> ${resolvedModelId}`)
  }
  
  console.log(`[AI] Calling: ${formattedModelId}`)
  
  try {
    const result = await generateText({
      model: client(formattedModelId),
      system: config.systemPrompt,
      prompt: config.userPrompt,
      maxOutputTokens: config.maxOutputTokens || 4096,
      temperature: config.temperature ?? 0.7,
    })
    
    const durationMs = Date.now() - startTime
    
    // Extract token usage
    const inputTokens = result.usage?.inputTokens || 0
    const outputTokens = result.usage?.outputTokens || 0
    const totalTokens = inputTokens + outputTokens
    
    // Calculate base cost (before markup)
    const baseCostUsd = calculateBaseCost(resolvedModelId, inputTokens, outputTokens)
    
    console.log(`[AI] ${formattedModelId}: ${inputTokens}+${outputTokens} tokens, $${baseCostUsd.toFixed(6)}, ${durationMs}ms`)
    
    return {
      content: result.text,
      model: resolvedModelId,  // Return our internal model ID
      provider: modelInfo.provider,
      inputTokens,
      outputTokens,
      totalTokens,
      baseCostUsd,
      finishReason: result.finishReason || 'unknown',
      durationMs,
    }
  } catch (error: any) {
    console.error(`[AI] Error calling ${formattedModelId}:`, error.message)
    
    // Re-throw with more context
    const enhancedError = new Error(`AI call failed: ${error.message}`) as Error & { 
      code?: string
      provider?: AIProvider
      model?: string 
    }
    enhancedError.code = error.code || 'AI_CALL_FAILED'
    enhancedError.provider = modelInfo.provider
    enhancedError.model = resolvedModelId
    
    throw enhancedError
  }
}

// =====================================================
// GEO Analysis Functions
// =====================================================

/**
 * System prompt for GEO analysis queries (base, without language instruction)
 */
export const GEO_SYSTEM_PROMPT_BASE = `You are an AI assistant helping to analyze how other AI systems discuss and recommend brands and products. 
Your task is to provide natural, informative responses as if you were a helpful AI assistant being asked about products or services.
Be honest and balanced in your assessments. Include specific details when relevant.

IMPORTANT: Keep your response concise (2-4 paragraphs maximum). Focus on the most important information and always complete your thoughts. Do not leave sentences unfinished.`

/**
 * Get system prompt for GEO analysis with optional language instruction
 */
export function getGEOSystemPrompt(language?: string): string {
  // If no language or English, use base prompt
  if (!language || language.toLowerCase() === 'en' || language.toLowerCase().startsWith('en')) {
    return GEO_SYSTEM_PROMPT_BASE
  }
  
  // Map language codes to full names
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

/**
 * System prompt for AI evaluation
 */
export const EVALUATION_SYSTEM_PROMPT = `You are an expert evaluator for GEO (Generative Engine Optimization). 
Your task is to analyze AI responses and evaluate how well they mention and recommend specific brands.
Always respond with valid JSON only, no explanations or markdown.`

/**
 * Call AI for a GEO query (simulating how AI responds to user questions)
 * @param model - Model ID to use
 * @param query - User query
 * @param language - Optional language code (e.g., 'cs', 'en', 'de') for response language
 */
export async function callGEOQuery(
  model: string,
  query: string,
  language?: string
): Promise<AICallResult> {
  // GPT-5 Nano and other chain-of-thought models need higher token limits
  // because they use tokens for internal "thinking" that doesn't count as visible output
  const isChainOfThoughtModel = ['gpt-5-nano'].includes(model)
  const maxOutputTokens = isChainOfThoughtModel ? 8192 : 4096
  
  return callAI({
    model,
    systemPrompt: getGEOSystemPrompt(language),
    userPrompt: query,
    maxOutputTokens,
    temperature: 0.7,
  })
}

/**
 * Call AI for evaluation (analyzing a response for brand mentions)
 */
export async function callEvaluation(
  model: string,
  content: string,
  brandVariations: string[],
  domain: string
): Promise<AICallResult & { metrics?: EvaluationMetrics }> {
  // Pre-check: Do a case-insensitive string check for brand/domain presence
  const contentLower = content.toLowerCase()
  const hasBrandMention = brandVariations.some(brand => 
    contentLower.includes(brand.toLowerCase())
  )
  const hasDomainMention = contentLower.includes(domain.toLowerCase())
  
  // If neither brand nor domain is mentioned (string check), return 0 visibility immediately
  // This prevents AI hallucination giving false positives
  if (!hasBrandMention && !hasDomainMention) {
    const modelInfo = getModelInfo(model)
    return {
      content: '{"visibility_score":0,"sentiment_score":null,"ranking_score":0,"recommendation_score":0}',
      model,
      provider: modelInfo?.provider || 'openai',
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      baseCostUsd: 0,
      finishReason: 'pre_check',
      durationMs: 0,
      metrics: {
        visibility_score: 0,
        sentiment_score: null,
        ranking_score: 0,
        recommendation_score: 0,
      }
    }
  }

  const evaluationPrompt = `Analyze the following AI response and evaluate how well it mentions and recommends the brand.

BRAND NAMES TO LOOK FOR (exact matches only): ${brandVariations.join(', ')}
DOMAIN TO LOOK FOR: ${domain}

IMPORTANT: Only count EXACT brand name matches. Generic phrases that happen to contain similar words do NOT count.
For example, if the brand is "Vkontextu", the Czech phrase "v kontextu" (meaning "in context") does NOT count as a brand mention.

AI Response to analyze:
"""
${content}
"""

Evaluate the response on these metrics (return scores 0-100):

1. **Visibility Score** (0-100): Combined brand + domain presence
   - EXACT brand name mentioned = 50 points
   - Domain (${domain}) mentioned = 50 points
   - Both = 100, one = 50, neither = 0
   - Generic phrases that are NOT the brand name = 0 points

2. **Sentiment Score** (0-100 or null): What's the sentiment toward the brand?
   - If visibility_score is 0 (neither brand nor domain mentioned), return null
   - Otherwise, analyze ONLY sentences where brand or domain is mentioned
   - 10 = very negative, 50 = neutral, 90 = very positive

3. **Ranking Score** (0-100): If mentioned in a list, what position?
   - 100 = first/top position
   - 80 = second position
   - 60 = third position
   - 40 = fourth or lower
   - 0 = not in a list or not mentioned

4. **Recommendation Score** (0-100): Overall, how strongly is the brand recommended?
   - If brand NOT mentioned, return 0
   - If brand IS mentioned, consider: visibility, sentiment, ranking, prominence

Return ONLY a JSON object with this exact structure (no explanation):
{
  "visibility_score": <number>,
  "sentiment_score": <number or null>,
  "ranking_score": <number>,
  "recommendation_score": <number>
}`

  // Use higher token limit for chain-of-thought models
  const isChainOfThoughtModel = ['gpt-5-nano'].includes(model)
  const maxOutputTokens = isChainOfThoughtModel ? 4096 : 1024
  
  const result = await callAI({
    model,
    systemPrompt: EVALUATION_SYSTEM_PROMPT,
    userPrompt: evaluationPrompt,
    maxOutputTokens,
    temperature: 0.1, // Low temperature for consistent evaluation
  })
  
  // Try to parse metrics from response
  let metrics: EvaluationMetrics | undefined
  
  try {
    let jsonContent = result.content.trim()
    
    // Remove markdown code blocks if present
    if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }
    
    const parsed = JSON.parse(jsonContent)
    
    // Validate and clamp scores
    const visibilityScore = Math.min(100, Math.max(0, parsed.visibility_score || 0))
    const sentimentScore = visibilityScore > 0 && parsed.sentiment_score !== null
      ? Math.min(100, Math.max(0, parsed.sentiment_score))
      : null
    const rankingScore = Math.min(100, Math.max(0, parsed.ranking_score || 0))
    const recommendationScore = visibilityScore > 0 
      ? Math.min(100, Math.max(0, parsed.recommendation_score || 0))
      : 0
    
    metrics = {
      visibility_score: visibilityScore,
      sentiment_score: sentimentScore,
      ranking_score: rankingScore,
      recommendation_score: recommendationScore,
    }
  } catch (parseError) {
    console.error('[AI Evaluation] Failed to parse metrics:', parseError)
  }
  
  return {
    ...result,
    metrics,
  }
}

// =====================================================
// Types for Evaluation
// =====================================================

export interface EvaluationMetrics {
  visibility_score: number
  sentiment_score: number | null
  ranking_score: number
  recommendation_score: number
}

// =====================================================
// Utility Functions
// =====================================================

/**
 * Get all available models (optionally filtered)
 */
export function getAvailableModels(options?: {
  provider?: AIProvider
  freeTierOnly?: boolean
  activeOnly?: boolean
}): ModelInfo[] {
  let models = [...AVAILABLE_MODELS]
  
  if (options?.activeOnly !== false) {
    models = models.filter(m => m.isActive)
  }
  
  if (options?.provider) {
    models = models.filter(m => m.provider === options.provider)
  }
  
  if (options?.freeTierOnly) {
    models = models.filter(m => m.availableFreeTier)
  }
  
  return models
}

/**
 * Check if a model ID is valid (resolves aliases)
 */
export function isValidModel(modelId: string): boolean {
  const resolvedId = resolveModelId(modelId)
  return AVAILABLE_MODELS.some(m => m.id === resolvedId && m.isActive)
}

/**
 * Get cheapest model for evaluation (to minimize costs)
 * Excludes chain-of-thought models like gpt-5-nano which are unreliable for structured JSON output
 */
export function getCheapestEvaluationModel(): string {
  // Models that use chain-of-thought and are unreliable for evaluation
  const unreliableForEvaluation = ['gpt-5-nano']
  
  const sorted = [...AVAILABLE_MODELS]
    .filter(m => m.isActive && !unreliableForEvaluation.includes(m.id))
    .sort((a, b) => {
      // Sort by total cost (input + output)
      const costA = a.pricing.input + a.pricing.output
      const costB = b.pricing.input + b.pricing.output
      return costA - costB
    })
  
  return sorted[0]?.id || 'gpt-5-mini'
}
