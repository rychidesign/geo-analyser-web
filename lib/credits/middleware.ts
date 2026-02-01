// =====================================================
// Credit System - Middleware & Access Control
// =====================================================

import { createClient } from '@/lib/supabase/server'
import { getUserProfile, getTierLimits, getPricingConfigs, checkAndResetFreeTierLimits } from './index'
import { canUserPerformAction, getAvailableModels, UserProfile, TierLimits, PricingConfig } from './types'

export interface AccessCheckResult {
  allowed: boolean
  reason?: string
  profile?: UserProfile
  limits?: TierLimits
}

/**
 * Check if user can create a new project
 */
export async function canCreateProject(userId: string): Promise<AccessCheckResult> {
  const supabase = await createClient()
  
  const profile = await getUserProfile(userId)
  if (!profile) {
    return { allowed: false, reason: 'User profile not found' }
  }
  
  const limits = await getTierLimits(profile.tier)
  if (!limits) {
    return { allowed: false, reason: 'Tier limits not found' }
  }
  
  // Count existing projects
  const { count } = await supabase
    .from('projects')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
  
  const result = canUserPerformAction(profile, limits, 'create_project', { projects: count || 0 })
  
  return {
    ...result,
    profile,
    limits,
  }
}

/**
 * Check if user can add a query to a project
 */
export async function canAddQuery(userId: string, projectId: string): Promise<AccessCheckResult> {
  const supabase = await createClient()
  
  const profile = await getUserProfile(userId)
  if (!profile) {
    return { allowed: false, reason: 'User profile not found' }
  }
  
  const limits = await getTierLimits(profile.tier)
  if (!limits) {
    return { allowed: false, reason: 'Tier limits not found' }
  }
  
  // Count existing queries for this project
  const { count } = await supabase
    .from('project_queries')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId)
  
  const result = canUserPerformAction(profile, limits, 'add_query', { queries: count || 0 })
  
  return {
    ...result,
    profile,
    limits,
  }
}

/**
 * Check if user can run a scan
 */
export async function canRunScan(userId: string): Promise<AccessCheckResult> {
  const profile = await getUserProfile(userId)
  if (!profile) {
    return { allowed: false, reason: 'User profile not found' }
  }
  
  // Reset free tier limits if needed
  await checkAndResetFreeTierLimits(userId)
  
  const limits = await getTierLimits(profile.tier)
  if (!limits) {
    return { allowed: false, reason: 'Tier limits not found' }
  }
  
  const result = canUserPerformAction(profile, limits, 'run_scan')
  
  return {
    ...result,
    profile,
    limits,
  }
}

/**
 * Check if user can schedule scans
 */
export async function canScheduleScan(userId: string): Promise<AccessCheckResult> {
  const profile = await getUserProfile(userId)
  if (!profile) {
    return { allowed: false, reason: 'User profile not found' }
  }
  
  const limits = await getTierLimits(profile.tier)
  if (!limits) {
    return { allowed: false, reason: 'Tier limits not found' }
  }
  
  const result = canUserPerformAction(profile, limits, 'schedule_scan')
  
  return {
    ...result,
    profile,
    limits,
  }
}

/**
 * Get models available to user based on their tier
 */
export async function getModelsForUser(userId: string): Promise<{
  models: PricingConfig[]
  allModels: PricingConfig[]
  isLimited: boolean
}> {
  const profile = await getUserProfile(userId)
  const allModels = await getPricingConfigs()
  
  if (!profile) {
    // Default to free tier models
    const freeModels = allModels.filter(m => m.available_free_tier)
    return { models: freeModels, allModels, isLimited: true }
  }
  
  const availableModels = getAvailableModels(allModels, profile.tier)
  
  return {
    models: availableModels,
    allModels,
    isLimited: profile.tier === 'free',
  }
}

/**
 * Validate model selection for user's tier
 */
export async function validateModelSelection(
  userId: string,
  selectedModels: string[]
): Promise<{ valid: boolean; invalidModels?: string[]; reason?: string }> {
  // Get user profile to check tier
  const profile = await getUserProfile(userId)
  
  // Admin, test, and paid users can use all models
  if (profile && (profile.tier === 'admin' || profile.tier === 'test' || profile.tier === 'paid')) {
    return { valid: true }
  }
  
  // For free tier, validate against pricing_config
  const { models } = await getModelsForUser(userId)
  const availableModelIds = models.map(m => m.model)
  
  const invalidModels = selectedModels.filter(m => !availableModelIds.includes(m))
  
  if (invalidModels.length > 0) {
    return {
      valid: false,
      invalidModels,
      reason: `These models are not available for your tier: ${invalidModels.join(', ')}. Upgrade to Pro for full access.`,
    }
  }
  
  return { valid: true }
}

/**
 * Check if user is admin
 */
export async function isAdmin(userId: string): Promise<boolean> {
  const profile = await getUserProfile(userId)
  return profile?.tier === 'admin'
}

/**
 * Require admin access (throws if not admin)
 */
export async function requireAdmin(userId: string): Promise<void> {
  if (!await isAdmin(userId)) {
    throw new Error('Admin access required')
  }
}

/**
 * Get full user context for UI
 */
export async function getUserContext(userId: string): Promise<{
  profile: UserProfile | null
  limits: TierLimits | null
  availableModels: PricingConfig[]
  isAdmin: boolean
  canSchedule: boolean
}> {
  const profile = await getUserProfile(userId)
  
  if (!profile) {
    return {
      profile: null,
      limits: null,
      availableModels: [],
      isAdmin: false,
      canSchedule: false,
    }
  }
  
  const limits = await getTierLimits(profile.tier)
  const { models } = await getModelsForUser(userId)
  
  return {
    profile,
    limits,
    availableModels: models,
    isAdmin: profile.tier === 'admin',
    canSchedule: limits?.can_schedule_scans ?? false,
  }
}
