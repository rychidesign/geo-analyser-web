import { createClient } from '@/lib/supabase/server'
import type { UserSettings, InsertUserSettings, MonthlyUsage } from './schema'
import { TABLES } from './schema'
import { decrypt, looksEncrypted } from '@/lib/crypto'

// ============================================
// USER SETTINGS (API Keys)
// ============================================

export async function getUserSettings(userId: string): Promise<UserSettings[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from(TABLES.USER_SETTINGS)
    .select('*')
    .eq('user_id', userId)
    .order('provider')

  if (error) throw error
  return data || []
}

export async function getUserSettingByProvider(
  userId: string, 
  provider: string
): Promise<UserSettings | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from(TABLES.USER_SETTINGS)
    .select('*')
    .eq('user_id', userId)
    .eq('provider', provider)
    .single()

  if (error && error.code !== 'PGRST116') throw error
  return data
}

export async function upsertUserSetting(setting: InsertUserSettings): Promise<UserSettings> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from(TABLES.USER_SETTINGS)
    .upsert(setting, { 
      onConflict: 'user_id,provider',
      ignoreDuplicates: false 
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteUserSetting(userId: string, provider: string): Promise<void> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from(TABLES.USER_SETTINGS)
    .delete()
    .eq('user_id', userId)
    .eq('provider', provider)

  if (error) throw error
}

export interface UserApiKeys {
  openai_api_key: string | null
  anthropic_api_key: string | null
  google_api_key: string | null
  groq_api_key: string | null
  perplexity_api_key: string | null
}

/**
 * Decrypt a stored API key.
 * Handles both encrypted keys (new) and plain-text keys (legacy).
 */
function decryptApiKey(storedKey: string): string {
  // If it looks encrypted (valid base64 with correct length), decrypt it
  if (looksEncrypted(storedKey)) {
    try {
      return decrypt(storedKey)
    } catch (err) {
      console.error('[Settings] Failed to decrypt API key, treating as plain text:', err)
      // Fallback: return as-is (legacy unencrypted key)
      return storedKey
    }
  }
  
  // Legacy: plain-text key (not yet encrypted)
  return storedKey
}

export async function getUserApiKeys(userId: string): Promise<UserApiKeys> {
  const settings = await getUserSettings(userId)
  
  const keys: UserApiKeys = {
    openai_api_key: null,
    anthropic_api_key: null,
    google_api_key: null,
    groq_api_key: null,
    perplexity_api_key: null,
  }
  
  for (const setting of settings) {
    const keyField = `${setting.provider}_api_key` as keyof UserApiKeys
    if (keyField in keys && setting.encrypted_api_key) {
      keys[keyField] = decryptApiKey(setting.encrypted_api_key)
    }
  }
  
  return keys
}

// ============================================
// MONTHLY USAGE
// ============================================

export async function getMonthlyUsage(
  userId: string, 
  month?: string
): Promise<MonthlyUsage[]> {
  const supabase = await createClient()
  
  const currentMonth = month || new Date().toISOString().slice(0, 7)
  
  const { data, error } = await supabase
    .from(TABLES.MONTHLY_USAGE)
    .select('*')
    .eq('user_id', userId)
    .eq('month', currentMonth)

  if (error) throw error
  return data || []
}

export async function getUsageHistory(
  userId: string, 
  months: number = 6
): Promise<MonthlyUsage[]> {
  const supabase = await createClient()
  
  // Calculate start month
  const startDate = new Date()
  startDate.setMonth(startDate.getMonth() - months)
  const startMonth = startDate.toISOString().slice(0, 7)
  
  const { data, error } = await supabase
    .from(TABLES.MONTHLY_USAGE)
    .select('*')
    .eq('user_id', userId)
    .gte('month', startMonth)
    .order('month', { ascending: false })

  if (error) throw error
  return data || []
}

export async function getTotalCostThisMonth(userId: string): Promise<number> {
  const usage = await getMonthlyUsage(userId)
  return usage.reduce((sum, u) => sum + u.total_cost_usd, 0)
}

export async function getCostsByProvider(userId: string, month?: string) {
  const usage = await getMonthlyUsage(userId, month)
  
  const byProvider: Record<string, { cost: number; tokens: number }> = {}
  
  for (const u of usage) {
    if (!byProvider[u.provider]) {
      byProvider[u.provider] = { cost: 0, tokens: 0 }
    }
    byProvider[u.provider].cost += u.total_cost_usd
    byProvider[u.provider].tokens += u.total_input_tokens + u.total_output_tokens
  }
  
  const total = Object.values(byProvider).reduce((sum, p) => sum + p.cost, 0)
  
  return Object.entries(byProvider).map(([provider, data]) => ({
    provider,
    cost: data.cost,
    tokens: data.tokens,
    percentage: total > 0 ? Math.round((data.cost / total) * 100) : 0,
  }))
}

// ============================================
// COSTS BY USAGE TYPE
// ============================================

export async function getCostsByType(userId: string, month?: string) {
  const usage = await getMonthlyUsage(userId, month)
  
  const byType: Record<string, { cost: number; tokens: number; count: number }> = {
    scan: { cost: 0, tokens: 0, count: 0 },
    generation: { cost: 0, tokens: 0, count: 0 },
    evaluation: { cost: 0, tokens: 0, count: 0 },
  }
  
  for (const u of usage) {
    const type = u.usage_type || 'scan'
    if (!byType[type]) {
      byType[type] = { cost: 0, tokens: 0, count: 0 }
    }
    byType[type].cost += u.total_cost_usd
    byType[type].tokens += u.total_input_tokens + u.total_output_tokens
    byType[type].count += u.scan_count
  }
  
  const total = Object.values(byType).reduce((sum, p) => sum + p.cost, 0)
  
  return Object.entries(byType).map(([type, data]) => ({
    type,
    cost: data.cost,
    tokens: data.tokens,
    count: data.count,
    percentage: total > 0 ? Math.round((data.cost / total) * 100) : 0,
  }))
}

// ============================================
// USER PROFILE (Timezone, etc.)
// ============================================

export async function getUserTimezone(userId: string): Promise<string> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from(TABLES.USER_SETTINGS)
    .select('config')
    .eq('user_id', userId)
    .eq('provider', '_profile')
    .single()
  
  if (error || !data) {
    return 'Europe/Prague' // Default timezone
  }
  
  return (data.config as any)?.timezone || 'Europe/Prague'
}

export async function setUserTimezone(userId: string, timezone: string): Promise<void> {
  const supabase = await createClient()
  
  await supabase
    .from(TABLES.USER_SETTINGS)
    .upsert({
      user_id: userId,
      provider: '_profile',
      config: { timezone }
    }, {
      onConflict: 'user_id,provider',
      ignoreDuplicates: false
    })
}
