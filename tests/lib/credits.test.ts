import { describe, it, expect } from 'vitest'
import {
  centsToUsd,
  usdToCents,
  formatUsd,
  formatUsdPrecise,
  calculateTopUpBonus,
  estimateScanCost,
  canUserPerformAction,
  getAvailableModels,
  type UserProfile,
  type TierLimits,
  type PricingConfig,
} from '@/lib/credits/types'

describe('Credit Conversion Functions', () => {
  describe('centsToUsd', () => {
    it('converts cents to USD correctly', () => {
      expect(centsToUsd(100)).toBe(1)
      expect(centsToUsd(550)).toBe(5.5)
      expect(centsToUsd(1)).toBe(0.01)
      expect(centsToUsd(0)).toBe(0)
    })
  })

  describe('usdToCents', () => {
    it('converts USD to cents correctly', () => {
      expect(usdToCents(1)).toBe(100)
      expect(usdToCents(5.5)).toBe(550)
      expect(usdToCents(0.01)).toBe(1)
      expect(usdToCents(0)).toBe(0)
    })

    it('rounds to nearest cent', () => {
      expect(usdToCents(1.234)).toBe(123)
      expect(usdToCents(1.235)).toBe(124)
      expect(usdToCents(1.999)).toBe(200)
    })
  })

  describe('formatUsd', () => {
    it('formats cents as USD string', () => {
      expect(formatUsd(100)).toBe('$1.00')
      expect(formatUsd(550)).toBe('$5.50')
      expect(formatUsd(1000)).toBe('$10.00')
      expect(formatUsd(0)).toBe('$0.00')
    })
  })

  describe('formatUsdPrecise', () => {
    it('formats small amounts with more precision', () => {
      expect(formatUsdPrecise(1)).toBe('$0.01')
      // 0 cents = $0.00 which is < $0.01, so uses 4 decimal places
      expect(formatUsdPrecise(0)).toBe('$0.0000')
    })

    it('uses standard format for larger amounts', () => {
      expect(formatUsdPrecise(100)).toBe('$1.00')
      expect(formatUsdPrecise(550)).toBe('$5.50')
    })
  })
})

describe('Top-up Bonus Calculation', () => {
  describe('calculateTopUpBonus', () => {
    it('returns correct bonus for predefined amounts', () => {
      expect(calculateTopUpBonus(20)).toBe(0)
      expect(calculateTopUpBonus(50)).toBe(0)
      expect(calculateTopUpBonus(100)).toBe(10)
      expect(calculateTopUpBonus(200)).toBe(20)
      expect(calculateTopUpBonus(500)).toBe(75)
    })

    it('calculates bonus for custom amounts', () => {
      // Under 100: no bonus
      expect(calculateTopUpBonus(75)).toBe(0)
      
      // 100-499: 10% bonus
      expect(calculateTopUpBonus(150)).toBe(15)
      expect(calculateTopUpBonus(300)).toBe(30)
      
      // 500+: 15% bonus
      expect(calculateTopUpBonus(600)).toBe(90)
      expect(calculateTopUpBonus(1000)).toBe(150)
    })
  })
})

describe('Scan Cost Estimation', () => {
  const mockPricing: PricingConfig[] = [
    {
      id: '1',
      provider: 'openai',
      model: 'gpt-5-mini',
      base_input_cost_cents: 25,
      base_output_cost_cents: 200,
      markup_percentage: 0,
      final_input_cost_cents: 25,
      final_output_cost_cents: 200,
      available_free_tier: true,
      is_active: true,
      prices_updated_at: '',
      created_at: '',
      updated_at: '',
    },
    {
      id: '2',
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
      base_input_cost_cents: 100,
      base_output_cost_cents: 500,
      markup_percentage: 0,
      final_input_cost_cents: 100,
      final_output_cost_cents: 500,
      available_free_tier: true,
      is_active: true,
      prices_updated_at: '',
      created_at: '',
      updated_at: '',
    },
  ]

  describe('estimateScanCost', () => {
    it('calculates cost for single model', () => {
      const cost = estimateScanCost(mockPricing, ['gpt-5-mini'], 10)
      // Cost = (500/1M * 25 + 1000/1M * 200) * 10 * 1.5 buffer
      expect(cost).toBeGreaterThan(0)
    })

    it('calculates cost for multiple models', () => {
      const singleModelCost = estimateScanCost(mockPricing, ['gpt-5-mini'], 10)
      const multiModelCost = estimateScanCost(mockPricing, ['gpt-5-mini', 'claude-haiku-4-5'], 10)
      
      expect(multiModelCost).toBeGreaterThan(singleModelCost)
    })

    it('returns 0 for unknown models', () => {
      const cost = estimateScanCost(mockPricing, ['unknown-model'], 10)
      expect(cost).toBe(0)
    })

    it('handles empty model list', () => {
      const cost = estimateScanCost(mockPricing, [], 10)
      expect(cost).toBe(0)
    })
  })
})

describe('User Permission Checks', () => {
  const createMockProfile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
    id: 'test-id',
    user_id: 'user-1',
    tier: 'free',
    credit_balance_cents: 0,
    paid_credits_cents: 0,
    bonus_credits_cents: 0,
    free_scans_used_this_month: 0,
    free_scans_reset_at: new Date().toISOString(),
    test_simulate_no_credits: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  })

  const createMockLimits = (overrides: Partial<TierLimits> = {}): TierLimits => ({
    tier: 'free',
    max_projects: 1,
    max_queries_per_project: 5,
    max_scans_per_month: 2,
    can_use_all_models: false,
    can_schedule_scans: false,
    description: 'Free tier',
    ...overrides,
  })

  describe('canUserPerformAction', () => {
    it('allows admin to do anything', () => {
      const profile = createMockProfile({ tier: 'admin' })
      const limits = createMockLimits()

      expect(canUserPerformAction(profile, limits, 'create_project').allowed).toBe(true)
      expect(canUserPerformAction(profile, limits, 'run_scan').allowed).toBe(true)
      expect(canUserPerformAction(profile, limits, 'schedule_scan').allowed).toBe(true)
    })

    it('allows test tier without simulation to do anything', () => {
      const profile = createMockProfile({ tier: 'test', test_simulate_no_credits: false })
      const limits = createMockLimits()

      expect(canUserPerformAction(profile, limits, 'create_project').allowed).toBe(true)
      expect(canUserPerformAction(profile, limits, 'run_scan').allowed).toBe(true)
    })

    it('blocks free tier from creating too many projects', () => {
      const profile = createMockProfile({ tier: 'free' })
      const limits = createMockLimits({ max_projects: 1 })

      const result = canUserPerformAction(profile, limits, 'create_project', { projects: 1 })
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('limited to 1 project')
    })

    it('blocks free tier from exceeding scan limit', () => {
      const profile = createMockProfile({ tier: 'free', free_scans_used_this_month: 2 })
      const limits = createMockLimits({ max_scans_per_month: 2 })

      const result = canUserPerformAction(profile, limits, 'run_scan')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('free scans')
    })

    it('blocks paid tier with no credits from running scans', () => {
      const profile = createMockProfile({ tier: 'paid', credit_balance_cents: 0 })
      const limits = createMockLimits({ tier: 'paid' })

      const result = canUserPerformAction(profile, limits, 'run_scan')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('Insufficient credits')
    })

    it('allows paid tier with credits to run scans', () => {
      const profile = createMockProfile({ tier: 'paid', credit_balance_cents: 1000 })
      const limits = createMockLimits({ tier: 'paid' })

      const result = canUserPerformAction(profile, limits, 'run_scan')
      expect(result.allowed).toBe(true)
    })

    it('blocks free tier from scheduling scans', () => {
      const profile = createMockProfile({ tier: 'free' })
      const limits = createMockLimits({ can_schedule_scans: false })

      const result = canUserPerformAction(profile, limits, 'schedule_scan')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('Pro users')
    })
  })
})

describe('Model Availability', () => {
  const mockPricing: PricingConfig[] = [
    {
      id: '1',
      provider: 'openai',
      model: 'gpt-5-mini',
      base_input_cost_cents: 25,
      base_output_cost_cents: 200,
      markup_percentage: 0,
      final_input_cost_cents: 25,
      final_output_cost_cents: 200,
      available_free_tier: true,
      is_active: true,
      prices_updated_at: '',
      created_at: '',
      updated_at: '',
    },
    {
      id: '2',
      provider: 'openai',
      model: 'gpt-5-2',
      base_input_cost_cents: 175,
      base_output_cost_cents: 1400,
      markup_percentage: 0,
      final_input_cost_cents: 175,
      final_output_cost_cents: 1400,
      available_free_tier: false,
      is_active: true,
      prices_updated_at: '',
      created_at: '',
      updated_at: '',
    },
    {
      id: '3',
      provider: 'openai',
      model: 'deprecated-model',
      base_input_cost_cents: 100,
      base_output_cost_cents: 500,
      markup_percentage: 0,
      final_input_cost_cents: 100,
      final_output_cost_cents: 500,
      available_free_tier: true,
      is_active: false,
      prices_updated_at: '',
      created_at: '',
      updated_at: '',
    },
  ]

  describe('getAvailableModels', () => {
    it('returns only free tier models for free users', () => {
      const models = getAvailableModels(mockPricing, 'free')
      
      expect(models).toHaveLength(1)
      expect(models[0].model).toBe('gpt-5-mini')
    })

    it('returns all active models for paid users', () => {
      const models = getAvailableModels(mockPricing, 'paid')
      
      expect(models).toHaveLength(2)
      expect(models.map(m => m.model)).toContain('gpt-5-mini')
      expect(models.map(m => m.model)).toContain('gpt-5-2')
    })

    it('returns all active models for admin users', () => {
      const models = getAvailableModels(mockPricing, 'admin')
      
      expect(models).toHaveLength(2)
    })

    it('excludes inactive models', () => {
      const models = getAvailableModels(mockPricing, 'admin')
      
      expect(models.map(m => m.model)).not.toContain('deprecated-model')
    })
  })
})
