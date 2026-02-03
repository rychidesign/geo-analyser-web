/**
 * Test existing users - verify system state and test operations
 * Run with: npx tsx scripts/test-existing-users.ts
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

// Load env
function loadEnv() {
  const envPath = join(process.cwd(), '.env.local')
  const envContent = readFileSync(envPath, 'utf-8')
  const vars: Record<string, string> = {}
  
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex > 0) {
      const key = trimmed.slice(0, eqIndex).trim()
      const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, '')
      vars[key] = value
    }
  }
  return vars
}

const env = loadEnv()
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

function centsToUsd(cents: number): number {
  return cents / 100
}

async function listAllUsers() {
  console.log('═'.repeat(70))
  console.log('  📋 Existing Users in System')
  console.log('═'.repeat(70))
  
  // Get auth users
  const { data: authData } = await supabase.auth.admin.listUsers()
  const authUsers = authData?.users || []
  
  console.log(`\n  Found ${authUsers.length} auth users\n`)
  
  // Get profiles
  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('*')
    .order('created_at', { ascending: false })
  
  // Create email map
  const emailMap = new Map<string, string>()
  for (const u of authUsers) {
    emailMap.set(u.id, u.email || 'Unknown')
  }
  
  console.log('─'.repeat(70))
  console.log(`  ${'Email'.padEnd(35)} | ${'Tier'.padEnd(8)} | ${'Balance'.padEnd(12)} | Scans`)
  console.log('─'.repeat(70))
  
  for (const profile of (profiles || [])) {
    const email = emailMap.get(profile.user_id) || 'Unknown'
    const tier = profile.tier.toUpperCase()
    const balance = `$${centsToUsd(profile.credit_balance_cents).toFixed(2)}`
    const scans = profile.free_scans_used_this_month
    
    console.log(`  ${email.padEnd(35)} | ${tier.padEnd(8)} | ${balance.padEnd(12)} | ${scans}`)
  }
  
  console.log('─'.repeat(70))
  
  return profiles
}

async function testOperationsOnExistingUser(userId: string, email: string) {
  console.log(`\n🔧 Testing operations on: ${email}`)
  console.log('─'.repeat(50))
  
  // Get current state
  const { data: profileBefore } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .single()
  
  if (!profileBefore) {
    console.log('  ❌ Profile not found')
    return
  }
  
  console.log(`  Current tier: ${profileBefore.tier}`)
  console.log(`  Current balance: $${centsToUsd(profileBefore.credit_balance_cents).toFixed(2)}`)
  
  // Test: Add $1 credit
  const testAmount = 100 // 100 cents = $1
  const newBalance = profileBefore.credit_balance_cents + testAmount
  
  const { error: addError } = await supabase
    .from('user_profiles')
    .update({ credit_balance_cents: newBalance })
    .eq('user_id', userId)
  
  if (addError) {
    console.log(`  ❌ Failed to add credit: ${addError.message}`)
  } else {
    console.log(`  ✅ Added $1.00 to balance`)
    
    // Record transaction
    await supabase
      .from('credit_transactions')
      .insert({
        user_id: userId,
        type: 'admin_adjustment',
        amount_cents: testAmount,
        balance_after_cents: newBalance,
        description: 'Test: Admin added $1',
      })
    
    console.log(`  ✅ Transaction recorded`)
  }
  
  // Test: Remove $1 credit (revert)
  const revertBalance = profileBefore.credit_balance_cents
  
  const { error: revertError } = await supabase
    .from('user_profiles')
    .update({ credit_balance_cents: revertBalance })
    .eq('user_id', userId)
  
  if (revertError) {
    console.log(`  ❌ Failed to revert: ${revertError.message}`)
  } else {
    console.log(`  ✅ Reverted balance to original: $${centsToUsd(revertBalance).toFixed(2)}`)
    
    // Record reverting transaction
    await supabase
      .from('credit_transactions')
      .insert({
        user_id: userId,
        type: 'admin_adjustment',
        amount_cents: -testAmount,
        balance_after_cents: revertBalance,
        description: 'Test: Admin reverted $1',
      })
  }
  
  // Verify final state
  const { data: profileAfter } = await supabase
    .from('user_profiles')
    .select('credit_balance_cents')
    .eq('user_id', userId)
    .single()
  
  if (profileAfter?.credit_balance_cents === profileBefore.credit_balance_cents) {
    console.log(`  ✅ Final balance verified: $${centsToUsd(profileAfter.credit_balance_cents).toFixed(2)}`)
  } else {
    console.log(`  ⚠️ Balance mismatch: expected $${centsToUsd(profileBefore.credit_balance_cents).toFixed(2)}, got $${centsToUsd(profileAfter?.credit_balance_cents || 0).toFixed(2)}`)
  }
}

async function showTransactionHistory(userId: string, email: string, limit: number = 10) {
  console.log(`\n📜 Recent transactions for: ${email}`)
  console.log('─'.repeat(60))
  
  const { data: transactions } = await supabase
    .from('credit_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  
  if (!transactions || transactions.length === 0) {
    console.log('  No transactions found')
    return
  }
  
  for (const tx of transactions) {
    const date = new Date(tx.created_at).toLocaleDateString('cs-CZ')
    const sign = tx.amount_cents >= 0 ? '+' : ''
    const amount = `${sign}$${centsToUsd(tx.amount_cents).toFixed(2)}`
    console.log(`  ${date} | ${tx.type.padEnd(16)} | ${amount.padStart(10)} | ${tx.description || '-'}`)
  }
}

async function main() {
  console.log('\n')
  
  const profiles = await listAllUsers()
  
  if (!profiles || profiles.length === 0) {
    console.log('\n  No users found in the system')
    return
  }
  
  // Get auth users for email lookup
  const { data: authData } = await supabase.auth.admin.listUsers()
  const emailMap = new Map<string, string>()
  for (const u of authData?.users || []) {
    emailMap.set(u.id, u.email || 'Unknown')
  }
  
  // Test on first user (or test user if exists)
  const testUser = profiles.find(p => emailMap.get(p.user_id)?.includes('test')) || profiles[0]
  const testEmail = emailMap.get(testUser.user_id) || 'Unknown'
  
  await testOperationsOnExistingUser(testUser.user_id, testEmail)
  await showTransactionHistory(testUser.user_id, testEmail)
  
  console.log('\n' + '═'.repeat(70))
  console.log('  ✅ All existing user tests completed')
  console.log('═'.repeat(70) + '\n')
}

main()
