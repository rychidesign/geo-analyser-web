import { describe, it, expect } from 'vitest'
import {
  calculateCost,
  getModelInfo,
  getModelsByProvider,
  getProviderForModel,
  AVAILABLE_MODELS,
  MODEL_PRICING,
  DEFAULT_MODELS,
  type LLMModel,
  type LLMProvider,
} from '@/lib/ai'

describe('LLM Model Definitions', () => {
  describe('AVAILABLE_MODELS', () => {
    it('contains models for all major providers', () => {
      const providers = [...new Set(AVAILABLE_MODELS.map(m => m.provider))]
      
      expect(providers).toContain('openai')
      expect(providers).toContain('anthropic')
      expect(providers).toContain('google')
      expect(providers).toContain('groq')
      expect(providers).toContain('perplexity')
    })

    it('has valid pricing for all models', () => {
      AVAILABLE_MODELS.forEach(model => {
        expect(model.pricing).toBeDefined()
        expect(model.pricing.input).toBeGreaterThanOrEqual(0)
        expect(model.pricing.output).toBeGreaterThan(0)
      })
    })

    it('has unique IDs for all models', () => {
      const ids = AVAILABLE_MODELS.map(m => m.id)
      const uniqueIds = [...new Set(ids)]
      
      expect(ids.length).toBe(uniqueIds.length)
    })
  })

  describe('MODEL_PRICING', () => {
    it('contains pricing for all available models', () => {
      AVAILABLE_MODELS.forEach(model => {
        expect(MODEL_PRICING[model.id]).toBeDefined()
        expect(MODEL_PRICING[model.id].input).toBe(model.pricing.input)
        expect(MODEL_PRICING[model.id].output).toBe(model.pricing.output)
      })
    })
  })

  describe('DEFAULT_MODELS', () => {
    it('has a default for each provider', () => {
      const providers: LLMProvider[] = ['openai', 'anthropic', 'google', 'groq', 'perplexity']
      
      providers.forEach(provider => {
        expect(DEFAULT_MODELS[provider]).toBeDefined()
        // Verify default model exists in available models
        const modelExists = AVAILABLE_MODELS.some(m => m.id === DEFAULT_MODELS[provider])
        expect(modelExists).toBe(true)
      })
    })
  })
})

describe('Cost Calculation', () => {
  describe('calculateCost', () => {
    it('calculates cost correctly for known model', () => {
      // GPT-5 Mini: input $0.25/1M, output $2.00/1M
      const cost = calculateCost('gpt-5-mini', 1000, 1000)
      
      // Expected: (1000/1M * 0.25) + (1000/1M * 2.00) = 0.00025 + 0.002 = 0.00225
      expect(cost).toBeCloseTo(0.00225, 5)
    })

    it('calculates cost for larger token counts', () => {
      // GPT-5 Mini with 1M tokens each
      const cost = calculateCost('gpt-5-mini', 1_000_000, 1_000_000)
      
      // Expected: 0.25 + 2.00 = 2.25
      expect(cost).toBeCloseTo(2.25, 2)
    })

    it('returns 0 for unknown model', () => {
      const cost = calculateCost('unknown-model', 1000, 1000)
      
      expect(cost).toBe(0)
    })

    it('handles zero tokens', () => {
      const cost = calculateCost('gpt-5-mini', 0, 0)
      
      expect(cost).toBe(0)
    })

    it('calculates correctly for expensive models', () => {
      // Claude Opus 4.1: input $12.00/1M, output $60.00/1M
      const cost = calculateCost('claude-opus-4-1', 1_000_000, 1_000_000)
      
      expect(cost).toBeCloseTo(72, 2)
    })

    it('calculates correctly for cheap models', () => {
      // Llama 4 Scout: input $0.10/1M, output $0.15/1M
      const cost = calculateCost('llama-4-scout', 1_000_000, 1_000_000)
      
      expect(cost).toBeCloseTo(0.25, 2)
    })
  })
})

describe('Model Helper Functions', () => {
  describe('getModelInfo', () => {
    it('returns model info for valid model ID', () => {
      const info = getModelInfo('gpt-5-mini')
      
      expect(info).toBeDefined()
      expect(info?.name).toBe('GPT-5 Mini')
      expect(info?.provider).toBe('openai')
    })

    it('returns undefined for invalid model ID', () => {
      const info = getModelInfo('nonexistent' as LLMModel)
      
      expect(info).toBeUndefined()
    })
  })

  describe('getModelsByProvider', () => {
    it('returns only OpenAI models for openai provider', () => {
      const models = getModelsByProvider('openai')
      
      expect(models.length).toBeGreaterThan(0)
      models.forEach(model => {
        expect(model.provider).toBe('openai')
      })
    })

    it('returns only Anthropic models for anthropic provider', () => {
      const models = getModelsByProvider('anthropic')
      
      expect(models.length).toBeGreaterThan(0)
      models.forEach(model => {
        expect(model.provider).toBe('anthropic')
      })
    })

    it('returns correct number of models per provider', () => {
      const openaiCount = AVAILABLE_MODELS.filter(m => m.provider === 'openai').length
      const anthropicCount = AVAILABLE_MODELS.filter(m => m.provider === 'anthropic').length
      
      expect(getModelsByProvider('openai').length).toBe(openaiCount)
      expect(getModelsByProvider('anthropic').length).toBe(anthropicCount)
    })
  })

  describe('getProviderForModel', () => {
    it('returns correct provider for model ID', () => {
      expect(getProviderForModel('gpt-5-mini')).toBe('openai')
      expect(getProviderForModel('claude-sonnet-4-5')).toBe('anthropic')
      expect(getProviderForModel('gemini-2-5-flash')).toBe('google')
      expect(getProviderForModel('llama-4-scout')).toBe('groq')
      expect(getProviderForModel('sonar-reasoning-pro')).toBe('perplexity')
    })

    it('returns null for unknown model', () => {
      expect(getProviderForModel('unknown-model')).toBeNull()
    })
  })
})

describe('Model Configuration Integrity', () => {
  it('all models have required fields', () => {
    AVAILABLE_MODELS.forEach(model => {
      expect(model.id).toBeTruthy()
      expect(model.name).toBeTruthy()
      expect(model.provider).toBeTruthy()
      expect(model.description).toBeTruthy()
      expect(model.pricing).toBeDefined()
    })
  })

  it('model IDs follow naming convention (lowercase with hyphens)', () => {
    AVAILABLE_MODELS.forEach(model => {
      expect(model.id).toMatch(/^[a-z0-9-]+$/)
    })
  })

  it('pricing values are reasonable', () => {
    AVAILABLE_MODELS.forEach(model => {
      // Input should be cheaper than or equal to output
      expect(model.pricing.input).toBeLessThanOrEqual(model.pricing.output)
      
      // Prices should be within reasonable range (per 1M tokens)
      expect(model.pricing.input).toBeLessThan(100)
      expect(model.pricing.output).toBeLessThan(200)
    })
  })
})
