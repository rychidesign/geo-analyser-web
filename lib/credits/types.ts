// =====================================================
// Credit System Types
// =====================================================

export type UserTier = 'free' | 'paid' | 'test' | 'admin'

export type TransactionType = 
  | 'top_up'           // User added credits (via Paddle)
  | 'bonus'            // Bonus credits awarded
  | 'usage'            // Credits spent on scan/query
  | 'refund'           // Refund for failed operation
  | 'admin_adjustment' // Manual adjustment by admin
  | 'expired'          // Credits expired

export type ReservationStatus = 'active' | 'released' | 'consumed'

// =====================================================
// Database Types
// =====================================================

export interface UserProfile {
  id: string
  user_id: string
  tier: UserTier
  credit_balance_cents: number
  paid_credits_cents: number
  bonus_credits_cents: number
  free_scans_used_this_month: number
  free_scans_reset_at: string
  test_simulate_no_credits: boolean
  created_at: string
  updated_at: string
}

export interface CreditTransaction {
  id: string
  user_id: string
  type: TransactionType
  amount_cents: number
  balance_after_cents: number
  reference_type: string | null
  reference_id: string | null
  description: string | null
  metadata: Record<string, any>
  created_by: string | null
  created_at: string
}

export interface CreditReservation {
  id: string
  user_id: string
  amount_cents: number
  scan_id: string | null
  status: ReservationStatus
  created_at: string
  expires_at: string
  resolved_at: string | null
}

export interface PricingConfig {
  id: string
  provider: string
  model: string
  base_input_cost_cents: number
  base_output_cost_cents: number
  markup_percentage: number
  final_input_cost_cents: number
  final_output_cost_cents: number
  available_free_tier: boolean
  is_active: boolean
  prices_updated_at: string
  created_at: string
  updated_at: string
}

export interface TierLimits {
  tier: UserTier
  max_projects: number | null
  max_queries_per_project: number | null
  max_scans_per_month: number | null
  can_use_all_models: boolean
  can_schedule_scans: boolean
  description: string
}

// =====================================================
// Frontend Display Types
// =====================================================

export interface UserCreditInfo {
  tier: UserTier
  balanceUsd: number           // Combined balance for display
  balanceCents: number
  canUsePaidFeatures: boolean  // Has credits OR is test/admin
  isFreeTier: boolean
  freeScansRemaining: number
  freeScansLimit: number
}

export interface TierInfo {
  tier: UserTier
  label: string
  color: string
  limits: TierLimits
}

// =====================================================
// Constants
// =====================================================

export const TIER_DISPLAY: Record<UserTier, { label: string; color: string; bgColor: string }> = {
  free: { label: 'Free', color: 'text-zinc-400', bgColor: 'bg-zinc-800' },
  paid: { label: 'Pro', color: 'text-emerald-400', bgColor: 'bg-emerald-900/50' },
  test: { label: 'Test', color: 'text-amber-400', bgColor: 'bg-amber-900/50' },
  admin: { label: 'Admin', color: 'text-purple-400', bgColor: 'bg-purple-900/50' },
}

// Credit top-up options (in USD)
export const TOP_UP_OPTIONS = [
  { amount: 20, bonus: 0 },
  { amount: 50, bonus: 0 },
  { amount: 100, bonus: 10 },   // 10% bonus
  { amount: 200, bonus: 20 },   // 10% bonus
  { amount: 500, bonus: 75 },   // 15% bonus
] as const

// Default free tier limits
export const FREE_TIER_DEFAULTS = {
  maxProjects: 3,
  maxQueriesPerProject: 5,
  maxScansPerMonth: 3,
} as const

// =====================================================
// Helper Functions
// =====================================================

/**
 * Convert cents to USD for display
 */
export function centsToUsd(cents: number): number {
  return cents / 100
}

/**
 * Convert USD to cents for storage
 */
export function usdToCents(usd: number): number {
  return Math.round(usd * 100)
}

/**
 * Format USD for display
 */
export function formatUsd(cents: number): string {
  const usd = centsToUsd(cents)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(usd)
}

/**
 * Format USD with more precision (for costs)
 */
export function formatUsdPrecise(cents: number): string {
  const usd = centsToUsd(cents)
  if (usd < 0.01) {
    return `$${usd.toFixed(4)}`
  }
  return formatUsd(cents)
}

/**
 * Calculate estimated scan cost based on pricing config
 */
export function estimateScanCost(
  pricing: PricingConfig[],
  models: string[],
  queryCount: number,
  avgInputTokens: number = 500,
  avgOutputTokens: number = 1000
): number {
  let totalCents = 0

  for (const modelId of models) {
    const config = pricing.find(p => p.model === modelId)
    if (!config) continue

    // Cost per query for this model
    const inputCost = (avgInputTokens / 1_000_000) * config.final_input_cost_cents
    const outputCost = (avgOutputTokens / 1_000_000) * config.final_output_cost_cents
    const queryCost = inputCost + outputCost

    totalCents += queryCost * queryCount
  }

  // Add ~50% buffer for evaluation costs
  return Math.ceil(totalCents * 1.5)
}

/**
 * Check if user can perform an action based on tier
 */
export function canUserPerformAction(
  profile: UserProfile,
  limits: TierLimits,
  action: 'create_project' | 'add_query' | 'run_scan' | 'schedule_scan',
  currentCounts?: { projects?: number; queries?: number }
): { allowed: boolean; reason?: string } {
  const { tier } = profile

  // Admin and test (without simulate) can do anything
  if (tier === 'admin') {
    return { allowed: true }
  }

  if (tier === 'test' && !profile.test_simulate_no_credits) {
    return { allowed: true }
  }

  // Check tier-specific limits
  switch (action) {
    case 'create_project':
      if (limits.max_projects !== null && currentCounts?.projects !== undefined) {
        if (currentCounts.projects >= limits.max_projects) {
          return { 
            allowed: false, 
            reason: `Free tier is limited to ${limits.max_projects} project${limits.max_projects > 1 ? 's' : ''}. Upgrade to Pro for unlimited projects.`
          }
        }
      }
      break

    case 'add_query':
      if (limits.max_queries_per_project !== null && currentCounts?.queries !== undefined) {
        if (currentCounts.queries >= limits.max_queries_per_project) {
          return { 
            allowed: false, 
            reason: `Free tier is limited to ${limits.max_queries_per_project} queries per project. Upgrade to Pro for unlimited queries.`
          }
        }
      }
      break

    case 'run_scan':
      // Free tier: check monthly limit
      if (tier === 'free') {
        if (limits.max_scans_per_month !== null && profile.free_scans_used_this_month >= limits.max_scans_per_month) {
          return { 
            allowed: false, 
            reason: `You've used all ${limits.max_scans_per_month} free scans this month. Add credits to continue scanning.`
          }
        }
      } else {
        // Paid/test with simulate: check credits
        if (tier === 'paid' || (tier === 'test' && profile.test_simulate_no_credits)) {
          if (profile.credit_balance_cents <= 0) {
            return { 
              allowed: false, 
              reason: 'Insufficient credits. Please add credits to continue.'
            }
          }
        }
      }
      break

    case 'schedule_scan':
      if (!limits.can_schedule_scans) {
        return { 
          allowed: false, 
          reason: 'Scheduled scans are only available for Pro users.'
        }
      }
      break
  }

  return { allowed: true }
}

/**
 * Get available models for user's tier
 */
export function getAvailableModels(
  pricing: PricingConfig[],
  tier: UserTier
): PricingConfig[] {
  // Admin and paid can use all models
  if (tier === 'admin' || tier === 'paid' || tier === 'test') {
    return pricing.filter(p => p.is_active)
  }

  // Free tier: only models marked as available for free
  return pricing.filter(p => p.is_active && p.available_free_tier)
}

/**
 * Calculate bonus for top-up amount
 */
export function calculateTopUpBonus(amountUsd: number): number {
  const option = TOP_UP_OPTIONS.find(o => o.amount === amountUsd)
  if (option) {
    return option.bonus
  }

  // Custom amount: calculate based on thresholds
  if (amountUsd >= 500) return Math.floor(amountUsd * 0.15)
  if (amountUsd >= 100) return Math.floor(amountUsd * 0.10)
  return 0
}
