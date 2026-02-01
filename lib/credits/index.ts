// =====================================================
// Credit System - Main Module
// =====================================================

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { 
  UserProfile, 
  UserCreditInfo, 
  CreditTransaction,
  CreditReservation,
  PricingConfig,
  TierLimits,
  TransactionType,
  UserTier,
  centsToUsd,
  usdToCents,
  calculateTopUpBonus,
  FREE_TIER_DEFAULTS,
} from './types'

export * from './types'

// =====================================================
// User Profile Operations
// =====================================================

/**
 * Get user profile, creating one if it doesn't exist
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .single()
  
  if (error && error.code !== 'PGRST116') { // PGRST116 = not found
    console.error('Error fetching user profile:', error)
    return null
  }
  
  // If no profile exists, create one (shouldn't happen with trigger, but just in case)
  if (!data) {
    const { data: newProfile, error: createError } = await supabase
      .from('user_profiles')
      .insert({ user_id: userId, tier: 'free' })
      .select()
      .single()
    
    if (createError) {
      console.error('Error creating user profile:', createError)
      return null
    }
    
    return newProfile
  }
  
  return data
}

/**
 * Get user credit info for display
 */
export async function getUserCreditInfo(userId: string): Promise<UserCreditInfo | null> {
  const profile = await getUserProfile(userId)
  if (!profile) return null
  
  const limits = await getTierLimits(profile.tier)
  const maxScans = limits?.max_scans_per_month ?? FREE_TIER_DEFAULTS.maxScansPerMonth
  
  return {
    tier: profile.tier,
    balanceUsd: centsToUsd(profile.credit_balance_cents),
    balanceCents: profile.credit_balance_cents,
    canUsePaidFeatures: profile.tier !== 'free' || profile.credit_balance_cents > 0,
    isFreeTier: profile.tier === 'free',
    freeScansRemaining: Math.max(0, maxScans - profile.free_scans_used_this_month),
    freeScansLimit: maxScans,
  }
}

/**
 * Get tier limits with fallback defaults
 */
export async function getTierLimits(tier: UserTier): Promise<TierLimits> {
  // Default tier limits as fallback
  const defaultLimits: TierLimits = {
    tier,
    max_projects: tier === 'admin' ? 99999 : tier === 'free' ? 3 : 100,
    max_queries_per_project: tier === 'admin' ? 99999 : tier === 'free' ? 20 : 100,
    max_scans_per_month: tier === 'admin' ? 99999 : tier === 'free' ? 10 : 1000,
    can_use_all_models: tier !== 'free',
    can_schedule_scans: tier !== 'free',
    description: `${tier} tier`,
  }
  
  try {
    const supabase = await createClient()
    
    const { data, error } = await supabase
      .from('tier_limits')
      .select('*')
      .eq('tier', tier)
      .single()
    
    if (error || !data) {
      console.warn(`Using default tier limits for ${tier}:`, error?.message)
      return defaultLimits
    }
    
    // Map database columns to expected interface (handle possible column name differences)
    return {
      tier: data.tier || tier,
      max_projects: data.max_projects ?? defaultLimits.max_projects,
      max_queries_per_project: data.max_queries_per_project ?? data.max_queries_p ?? defaultLimits.max_queries_per_project,
      max_scans_per_month: data.max_scans_per_month ?? data.max_scans_per ?? defaultLimits.max_scans_per_month,
      can_use_all_models: data.can_use_all_models ?? (tier !== 'free'),
      can_schedule_scans: data.can_schedule_scans ?? (tier !== 'free'),
      description: data.description ?? defaultLimits.description,
    }
  } catch (err) {
    console.error('Error fetching tier limits:', err)
    return defaultLimits
  }
}

/**
 * Update user tier (admin only - uses service role to bypass RLS)
 */
export async function updateUserTier(userId: string, newTier: UserTier): Promise<boolean> {
  const adminClient = createAdminClient()
  
  const { error } = await adminClient
    .from('user_profiles')
    .update({ tier: newTier })
    .eq('user_id', userId)
  
  if (error) {
    console.error('Error updating user tier:', error)
    return false
  }
  
  return true
}

/**
 * Toggle test account credit simulation (admin only - uses service role)
 */
export async function toggleTestCreditSimulation(userId: string, simulate: boolean): Promise<boolean> {
  const adminClient = createAdminClient()
  
  const { error } = await adminClient
    .from('user_profiles')
    .update({ test_simulate_no_credits: simulate })
    .eq('user_id', userId)
  
  if (error) {
    console.error('Error toggling test simulation:', error)
    return false
  }
  
  return true
}

// =====================================================
// Credit Balance Operations
// =====================================================

/**
 * Add credits (top-up or bonus)
 * Uses admin client for admin_adjustment to bypass RLS
 */
export async function addCredits(
  userId: string,
  amountCents: number,
  type: 'top_up' | 'bonus' | 'admin_adjustment',
  options?: {
    description?: string
    referenceType?: string
    referenceId?: string
    createdBy?: string
    metadata?: Record<string, any>
  }
): Promise<{ success: boolean; newBalance?: number; transactionId?: string; error?: string }> {
  // Use admin client for admin operations to bypass RLS
  const supabase = type === 'admin_adjustment' 
    ? createAdminClient() 
    : await createClient()
  
  // Get current profile (use same client for consistency)
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .single()
  
  if (profileError || !profile) {
    return { success: false, error: 'User profile not found' }
  }
  
  const newBalanceCents = profile.credit_balance_cents + amountCents
  
  // Update balance based on type
  const updateData: Partial<UserProfile> = {
    credit_balance_cents: newBalanceCents,
  }
  
  if (type === 'top_up') {
    updateData.paid_credits_cents = profile.paid_credits_cents + amountCents
  } else if (type === 'bonus') {
    updateData.bonus_credits_cents = profile.bonus_credits_cents + amountCents
  }
  
  // Start transaction-like operations
  const { error: updateError } = await supabase
    .from('user_profiles')
    .update(updateData)
    .eq('user_id', userId)
  
  if (updateError) {
    return { success: false, error: updateError.message }
  }
  
  // Record transaction
  const { data: transaction, error: txError } = await supabase
    .from('credit_transactions')
    .insert({
      user_id: userId,
      type,
      amount_cents: amountCents,
      balance_after_cents: newBalanceCents,
      description: options?.description || `Added ${centsToUsd(amountCents).toFixed(2)} USD`,
      reference_type: options?.referenceType,
      reference_id: options?.referenceId,
      created_by: options?.createdBy,
      metadata: options?.metadata || {},
    })
    .select('id')
    .single()
  
  if (txError) {
    console.error('Error recording transaction:', txError)
    // Balance was updated, but transaction wasn't recorded - log this
  }
  
  return { 
    success: true, 
    newBalance: newBalanceCents, 
    transactionId: transaction?.id 
  }
}

/**
 * Process top-up with bonus calculation
 */
export async function processTopUp(
  userId: string,
  amountUsd: number,
  paymentReference: string,
  metadata?: Record<string, any>
): Promise<{ success: boolean; totalCredited?: number; bonus?: number; error?: string }> {
  const amountCents = usdToCents(amountUsd)
  const bonusUsd = calculateTopUpBonus(amountUsd)
  const bonusCents = usdToCents(bonusUsd)
  
  // Add main amount
  const mainResult = await addCredits(userId, amountCents, 'top_up', {
    description: `Top-up: $${amountUsd}`,
    referenceType: 'paddle_payment',
    referenceId: paymentReference,
    metadata,
  })
  
  if (!mainResult.success) {
    return { success: false, error: mainResult.error }
  }
  
  // Add bonus if applicable
  if (bonusCents > 0) {
    await addCredits(userId, bonusCents, 'bonus', {
      description: `Bonus for $${amountUsd} top-up: $${bonusUsd}`,
      referenceType: 'top_up_bonus',
      referenceId: mainResult.transactionId,
    })
  }
  
  return {
    success: true,
    totalCredited: amountCents + bonusCents,
    bonus: bonusCents,
  }
}

/**
 * Deduct credits for usage
 */
export async function deductCredits(
  userId: string,
  amountCents: number,
  options: {
    description: string
    referenceType: string
    referenceId: string
    metadata?: Record<string, any>
  }
): Promise<{ success: boolean; newBalance?: number; error?: string }> {
  const supabase = await createClient()
  
  const profile = await getUserProfile(userId)
  if (!profile) {
    return { success: false, error: 'User profile not found' }
  }
  
  // Check sufficient balance
  if (profile.credit_balance_cents < amountCents) {
    return { success: false, error: 'Insufficient credits' }
  }
  
  const newBalanceCents = profile.credit_balance_cents - amountCents
  
  // Update balance
  const { error: updateError } = await supabase
    .from('user_profiles')
    .update({ credit_balance_cents: newBalanceCents })
    .eq('user_id', userId)
  
  if (updateError) {
    return { success: false, error: updateError.message }
  }
  
  // Record transaction (negative amount)
  await supabase
    .from('credit_transactions')
    .insert({
      user_id: userId,
      type: 'usage',
      amount_cents: -amountCents,
      balance_after_cents: newBalanceCents,
      description: options.description,
      reference_type: options.referenceType,
      reference_id: options.referenceId,
      metadata: options.metadata || {},
    })
  
  return { success: true, newBalance: newBalanceCents }
}

/**
 * Refund credits (for failed operations)
 */
export async function refundCredits(
  userId: string,
  amountCents: number,
  referenceType: string,
  referenceId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  return addCredits(userId, amountCents, 'admin_adjustment', {
    description: `Refund: ${reason}`,
    referenceType: `refund_${referenceType}`,
    referenceId,
    metadata: { refund_reason: reason },
  })
}

// =====================================================
// Credit Reservations (for running scans)
// =====================================================

/**
 * Create a credit reservation before starting a scan
 * Note: scanId is optional because we create reservation before scan record
 */
export async function createReservation(
  userId: string,
  amountCents: number,
  projectId: string
): Promise<{ success: boolean; reservationId?: string; error?: string }> {
  const supabase = await createClient()
  
  const profile = await getUserProfile(userId)
  if (!profile) {
    return { success: false, error: 'User profile not found' }
  }
  
  // Skip reservation for test accounts (unless simulating)
  if (profile.tier === 'test' && !profile.test_simulate_no_credits) {
    return { success: true, reservationId: 'test-account' }
  }
  
  // Skip for admin
  if (profile.tier === 'admin') {
    return { success: true, reservationId: 'admin-account' }
  }
  
  // Free tier: check scan limit instead of credits
  if (profile.tier === 'free') {
    const limits = await getTierLimits('free')
    const maxScans = limits?.max_scans_per_month ?? FREE_TIER_DEFAULTS.maxScansPerMonth
    
    if (profile.free_scans_used_this_month >= maxScans) {
      return { success: false, error: 'Monthly free scan limit reached' }
    }
    
    // Increment free scan counter
    await supabase
      .from('user_profiles')
      .update({ free_scans_used_this_month: profile.free_scans_used_this_month + 1 })
      .eq('user_id', userId)
    
    return { success: true, reservationId: 'free-tier' }
  }
  
  // Paid tier: check and reserve credits
  if (profile.credit_balance_cents < amountCents) {
    return { success: false, error: 'Insufficient credits' }
  }
  
  // Deduct from balance temporarily
  const { error: updateError } = await supabase
    .from('user_profiles')
    .update({ credit_balance_cents: profile.credit_balance_cents - amountCents })
    .eq('user_id', userId)
  
  if (updateError) {
    return { success: false, error: updateError.message }
  }
  
  // Create reservation record (scan_id will be set later)
  const { data: reservation, error: reserveError } = await supabase
    .from('credit_reservations')
    .insert({
      user_id: userId,
      amount_cents: amountCents,
      scan_id: null, // Will be updated when scan is created
      status: 'active',
    })
    .select('id')
    .single()
  
  if (reserveError) {
    // Rollback balance deduction
    await supabase
      .from('user_profiles')
      .update({ credit_balance_cents: profile.credit_balance_cents })
      .eq('user_id', userId)
    
    return { success: false, error: reserveError.message }
  }
  
  return { success: true, reservationId: reservation.id }
}

/**
 * Consume reservation after successful scan (charge actual cost)
 */
export async function consumeReservation(
  reservationId: string,
  actualCostCents: number,
  scanId: string
): Promise<{ success: boolean; refunded?: number; error?: string }> {
  const supabase = await createClient()
  
  // Skip for special reservation IDs
  if (reservationId === 'test-account' || reservationId === 'admin-account' || reservationId === 'free-tier') {
    return { success: true, refunded: 0 }
  }
  
  // Get reservation
  const { data: reservation, error: fetchError } = await supabase
    .from('credit_reservations')
    .select('*')
    .eq('id', reservationId)
    .single()
  
  if (fetchError || !reservation) {
    return { success: false, error: 'Reservation not found' }
  }
  
  if (reservation.status !== 'active') {
    return { success: false, error: 'Reservation already processed' }
  }
  
  // Calculate difference (what to refund)
  const refundAmount = reservation.amount_cents - actualCostCents
  
  // Update reservation status
  await supabase
    .from('credit_reservations')
    .update({ status: 'consumed', resolved_at: new Date().toISOString() })
    .eq('id', reservationId)
  
  // If we reserved more than needed, add back the difference
  if (refundAmount > 0) {
    await supabase
      .from('user_profiles')
      .update({ 
        credit_balance_cents: supabase.rpc('increment_balance', { 
          user_id: reservation.user_id, 
          amount: refundAmount 
        })
      })
      .eq('user_id', reservation.user_id)
    
    // Simpler approach: just add back
    const profile = await getUserProfile(reservation.user_id)
    if (profile) {
      await supabase
        .from('user_profiles')
        .update({ credit_balance_cents: profile.credit_balance_cents + refundAmount })
        .eq('user_id', reservation.user_id)
    }
  }
  
  // Record the usage transaction
  const profile = await getUserProfile(reservation.user_id)
  if (profile) {
    await supabase
      .from('credit_transactions')
      .insert({
        user_id: reservation.user_id,
        type: 'usage',
        amount_cents: -actualCostCents,
        balance_after_cents: profile.credit_balance_cents,
        description: `Scan completed`,
        reference_type: 'scan',
        reference_id: scanId,
        metadata: { reservation_id: reservationId, reserved: reservation.amount_cents, actual: actualCostCents },
      })
  }
  
  return { success: true, refunded: refundAmount }
}

/**
 * Release reservation (for failed/cancelled scans)
 */
export async function releaseReservation(
  reservationId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  
  // Skip for special reservation IDs
  if (reservationId === 'test-account' || reservationId === 'admin-account') {
    return { success: true }
  }
  
  // Free tier: decrement scan counter
  if (reservationId === 'free-tier') {
    // We can't easily decrement here without knowing the user
    // The scan counter will reset monthly anyway
    return { success: true }
  }
  
  // Get reservation
  const { data: reservation, error: fetchError } = await supabase
    .from('credit_reservations')
    .select('*')
    .eq('id', reservationId)
    .single()
  
  if (fetchError || !reservation) {
    return { success: false, error: 'Reservation not found' }
  }
  
  if (reservation.status !== 'active') {
    return { success: true } // Already processed
  }
  
  // Return credits to user
  const profile = await getUserProfile(reservation.user_id)
  if (profile) {
    await supabase
      .from('user_profiles')
      .update({ credit_balance_cents: profile.credit_balance_cents + reservation.amount_cents })
      .eq('user_id', reservation.user_id)
  }
  
  // Update reservation status
  await supabase
    .from('credit_reservations')
    .update({ status: 'released', resolved_at: new Date().toISOString() })
    .eq('id', reservationId)
  
  return { success: true }
}

// =====================================================
// Pricing Operations
// =====================================================

/**
 * Get all active pricing configs
 */
export async function getPricingConfigs(): Promise<PricingConfig[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('pricing_config')
    .select('*')
    .eq('is_active', true)
    .order('provider', { ascending: true })
    .order('model', { ascending: true })
  
  if (error) {
    console.error('Error fetching pricing configs:', error)
    return []
  }
  
  // Calculate final costs (base * markup)
  return (data || []).map(p => ({
    ...p,
    final_input_cost_cents: Math.round(p.base_input_cost_cents * (1 + p.markup_percentage / 100)),
    final_output_cost_cents: Math.round(p.base_output_cost_cents * (1 + p.markup_percentage / 100)),
  }))
}

/**
 * Get pricing for a specific model
 */
export async function getModelPricing(model: string): Promise<PricingConfig | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('pricing_config')
    .select('*')
    .eq('model', model)
    .single()
  
  if (error) {
    console.error('Error fetching model pricing:', error)
    return null
  }
  
  if (!data) return null
  
  // Calculate final costs (base * markup)
  return {
    ...data,
    final_input_cost_cents: Math.round(data.base_input_cost_cents * (1 + data.markup_percentage / 100)),
    final_output_cost_cents: Math.round(data.base_output_cost_cents * (1 + data.markup_percentage / 100)),
  }
}

/**
 * Calculate cost for tokens using dynamic pricing
 */
export async function calculateDynamicCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): Promise<number> {
  const pricing = await getModelPricing(model)
  
  if (!pricing) {
    console.warn(`No pricing found for model: ${model}`)
    return 0
  }
  
  // Cost calculation (pricing is per 1M tokens in cents)
  const inputCost = (inputTokens / 1_000_000) * pricing.final_input_cost_cents
  const outputCost = (outputTokens / 1_000_000) * pricing.final_output_cost_cents
  
  return Math.ceil(inputCost + outputCost) // Round up to nearest cent
}

// =====================================================
// Transaction History
// =====================================================

/**
 * Get user's transaction history
 */
export async function getTransactionHistory(
  userId: string,
  limit: number = 50,
  offset: number = 0
): Promise<CreditTransaction[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('credit_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  
  if (error) {
    console.error('Error fetching transactions:', error)
    return []
  }
  
  return data || []
}

// =====================================================
// Free Tier Helpers
// =====================================================

/**
 * Check and reset free tier limits if needed
 */
export async function checkAndResetFreeTierLimits(userId: string): Promise<void> {
  const supabase = await createClient()
  
  const profile = await getUserProfile(userId)
  if (!profile || profile.tier !== 'free') return
  
  const resetAt = new Date(profile.free_scans_reset_at)
  if (resetAt <= new Date()) {
    await supabase
      .from('user_profiles')
      .update({
        free_scans_used_this_month: 0,
        free_scans_reset_at: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString(),
      })
      .eq('user_id', userId)
  }
}
