import { describe, it, expect } from 'vitest'
import { AVAILABLE_MODELS } from '@/lib/ai/providers'
import { AVAILABLE_MODELS as AVAILABLE_MODELS_FROM_INDEX } from '@/lib/ai'

/**
 * Test: Model Centralization
 * 
 * This test ensures that model definitions are centralized in lib/ai/providers.ts
 * and properly exported through lib/ai/index.ts.
 * 
 * When you add/remove a model in AVAILABLE_MODELS, these tests verify that:
 * 1. The model is accessible from both lib/ai/providers and lib/ai
 * 2. Model pricing is consistent across all exports
 * 3. No duplicate definitions exist
 */

describe('Model Centralization', () => {
  it('should have identical AVAILABLE_MODELS in providers and index', () => {
    // Both should reference the same array
    expect(AVAILABLE_MODELS_FROM_INDEX).toBe(AVAILABLE_MODELS)
  })

  it('should have consistent model count across exports', () => {
    expect(AVAILABLE_MODELS_FROM_INDEX.length).toBe(AVAILABLE_MODELS.length)
    expect(AVAILABLE_MODELS.length).toBeGreaterThan(0)
  })

  it('should have identical model IDs in both exports', () => {
    const idsFromProviders = AVAILABLE_MODELS.map(m => m.id).sort()
    const idsFromIndex = AVAILABLE_MODELS_FROM_INDEX.map(m => m.id).sort()
    
    expect(idsFromIndex).toEqual(idsFromProviders)
  })

  it('should have identical pricing for each model', () => {
    AVAILABLE_MODELS.forEach(model => {
      const modelFromIndex = AVAILABLE_MODELS_FROM_INDEX.find(m => m.id === model.id)
      
      expect(modelFromIndex).toBeDefined()
      expect(modelFromIndex?.pricing.input).toBe(model.pricing.input)
      expect(modelFromIndex?.pricing.output).toBe(model.pricing.output)
    })
  })

  it('should have all required fields for each model', () => {
    AVAILABLE_MODELS.forEach(model => {
      expect(model.id).toBeTruthy()
      expect(model.name).toBeTruthy()
      expect(model.provider).toBeTruthy()
      expect(model.description).toBeTruthy()
      expect(model.contextWindow).toBeGreaterThan(0)
      expect(model.pricing).toBeDefined()
      expect(model.pricing.input).toBeGreaterThanOrEqual(0)
      expect(model.pricing.output).toBeGreaterThan(0)
      expect(typeof model.availableFreeTier).toBe('boolean')
      expect(typeof model.isActive).toBe('boolean')
    })
  })

  it('should match database pricing expectations', () => {
    // These are the expected prices from migration 014_centralized_pricing_2026.sql
    const expectedPricing: Record<string, { input: number; output: number }> = {
      'gpt-5-2': { input: 1.75, output: 14.00 },
      'gpt-5-mini': { input: 0.25, output: 2.00 },
      'gpt-5-nano': { input: 0.10, output: 0.40 },
      'claude-opus-4-5': { input: 5.00, output: 25.00 },
      'claude-sonnet-4-5': { input: 3.00, output: 15.00 },
      'claude-haiku-4-5': { input: 1.00, output: 5.00 },
      'claude-opus-4-1': { input: 12.00, output: 60.00 },
      'gemini-3-flash-preview': { input: 0.50, output: 3.00 },
      'gemini-2-5-flash': { input: 0.60, output: 3.50 },
      'gemini-2-5-flash-lite': { input: 0.30, output: 2.50 },
      'llama-4-scout': { input: 0.10, output: 0.15 },
      'llama-4-maverick': { input: 0.20, output: 0.60 },  // ✅ Fixed from 0.30
      'sonar-reasoning-pro': { input: 2.00, output: 8.00 },  // ✅ Fixed from 1.00/4.00
    }

    Object.entries(expectedPricing).forEach(([modelId, expectedPrice]) => {
      const model = AVAILABLE_MODELS.find(m => m.id === modelId)
      
      expect(model).toBeDefined()
      expect(model?.pricing.input).toBe(expectedPrice.input)
      expect(model?.pricing.output).toBe(expectedPrice.output)
    })
  })

  it('should have unique model IDs', () => {
    const ids = AVAILABLE_MODELS.map(m => m.id)
    const uniqueIds = [...new Set(ids)]
    
    expect(ids.length).toBe(uniqueIds.length)
  })

  it('should export MODEL_PRICING derived from AVAILABLE_MODELS', async () => {
    const { MODEL_PRICING } = await import('@/lib/ai')
    
    AVAILABLE_MODELS.forEach(model => {
      expect(MODEL_PRICING[model.id]).toBeDefined()
      expect(MODEL_PRICING[model.id].input).toBe(model.pricing.input)
      expect(MODEL_PRICING[model.id].output).toBe(model.pricing.output)
    })
  })

  it('should export LLMModel type union matching AVAILABLE_MODELS', async () => {
    // This is a compile-time check, but we can verify at runtime too
    const { AVAILABLE_MODELS: models } = await import('@/lib/ai')
    
    const expectedModelIds = [
      'gpt-5-2', 'gpt-5-mini', 'gpt-5-nano',
      'claude-sonnet-4-5', 'claude-opus-4-5', 'claude-haiku-4-5', 'claude-opus-4-1',
      'gemini-3-flash-preview', 'gemini-2-5-flash', 'gemini-2-5-flash-lite',
      'llama-4-scout', 'llama-4-maverick',
      'sonar-reasoning-pro',
    ]
    
    const actualModelIds = models.map((m: any) => m.id).sort()
    expectedModelIds.sort()
    
    expect(actualModelIds).toEqual(expectedModelIds)
  })
})

describe('Model Addition/Removal Detection', () => {
  it('should fail if model count changes unexpectedly', () => {
    // Current count as of 2026-02-02
    const EXPECTED_MODEL_COUNT = 13
    
    if (AVAILABLE_MODELS.length !== EXPECTED_MODEL_COUNT) {
      console.warn(`
⚠️  MODEL COUNT CHANGED!
Expected: ${EXPECTED_MODEL_COUNT}
Actual: ${AVAILABLE_MODELS.length}

If you added/removed a model:
1. ✅ Update EXPECTED_MODEL_COUNT in this test
2. ✅ Update LLMModel type union in lib/ai/index.ts
3. ✅ Update database migration if pricing changed
4. ✅ Update DEFAULT_MODELS if needed
5. ✅ Run all tests to ensure consistency
      `)
    }
    
    // This will fail if count changes, forcing developer to update the test
    expect(AVAILABLE_MODELS.length).toBe(EXPECTED_MODEL_COUNT)
  })

  it('should have all providers represented', () => {
    const providers = [...new Set(AVAILABLE_MODELS.map(m => m.provider))]
    
    expect(providers).toContain('openai')
    expect(providers).toContain('anthropic')
    expect(providers).toContain('google')
    expect(providers).toContain('groq')
    expect(providers).toContain('perplexity')
  })

  it('should have at least one free tier model per major provider', () => {
    const freeModels = AVAILABLE_MODELS.filter(m => m.availableFreeTier)
    const freeProviders = [...new Set(freeModels.map(m => m.provider))]
    
    // At least OpenAI, Anthropic, Google, and Groq should have free tier models
    expect(freeProviders).toContain('openai')
    expect(freeProviders).toContain('anthropic')
    expect(freeProviders).toContain('google')
    expect(freeProviders).toContain('groq')
  })
})
