/**
 * Test Admin API endpoints for user management
 * Run with: npx tsx scripts/test-admin-api.ts
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

function usdToCents(usd: number): number {
  return Math.round(usd * 100)
}

type UserTier = 'free' | 'paid' | 'test' | 'admin'

interface TestResult {
  test: string
  passed: boolean
  message: string
}

const results: TestResult[] = []

function logTest(name: string, passed: boolean, message: string) {
  const icon = passed ? '✅' : '❌'
  console.log(`${icon} ${name}: ${message}`)
  results.push({ test: name, passed, message })
}

async function main() {
  console.log('═'.repeat(70))
  console.log('  🔐 Admin API Tests - User Account Management')
  console.log('═'.repeat(70))
  
  // Get existing users
  const { data: authData } = await supabase.auth.admin.listUsers()
  const authUsers = authData?.users || []
  
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
  
  if (!profiles || profiles.length === 0) {
    console.log('  No users to test')
    return
  }
  
  // Find test user
  const testProfile = profiles.find(p => emailMap.get(p.user_id)?.includes('test1'))
  
  if (!testProfile) {
    console.log('  ❌ No test user found (test1@geoanalyser.local)')
    return
  }
  
  const userId = testProfile.user_id
  const userEmail = emailMap.get(userId) || 'Unknown'
  
  console.log(`\n  Testing on: ${userEmail}`)
  console.log(`  Current tier: ${testProfile.tier}`)
  console.log(`  Current balance: $${centsToUsd(testProfile.credit_balance_cents).toFixed(2)}`)
  console.log('')
  
  // Store original values
  const originalTier = testProfile.tier
  const originalBalance = testProfile.credit_balance_cents
  
  // =====================================================
  // TEST 1: Update Tier (free -> paid -> test -> admin -> free)
  // =====================================================
  console.log('─'.repeat(70))
  console.log('  📝 TEST 1: Tier Changes via Admin Operations')
  console.log('─'.repeat(70))
  
  const tiers: UserTier[] = ['paid', 'test', 'admin', 'free']
  
  for (const tier of tiers) {
    const { error } = await supabase
      .from('user_profiles')
      .update({ tier })
      .eq('user_id', userId)
    
    if (error) {
      logTest(`Update tier to ${tier}`, false, error.message)
    } else {
      const { data: verify } = await supabase
        .from('user_profiles')
        .select('tier')
        .eq('user_id', userId)
        .single()
      
      if (verify?.tier === tier) {
        logTest(`Update tier to ${tier}`, true, `Successfully changed to ${tier}`)
      } else {
        logTest(`Update tier to ${tier}`, false, `Expected ${tier}, got ${verify?.tier}`)
      }
    }
  }
  
  // Restore original tier
  await supabase.from('user_profiles').update({ tier: originalTier }).eq('user_id', userId)
  
  // =====================================================
  // TEST 2: Add Credits (Admin Adjustment)
  // =====================================================
  console.log('\n' + '─'.repeat(70))
  console.log('  💰 TEST 2: Add Credits via Admin Adjustment')
  console.log('─'.repeat(70))
  
  const addAmounts = [5, 10, 25] // USD amounts to add
  
  for (const amountUsd of addAmounts) {
    const { data: before } = await supabase
      .from('user_profiles')
      .select('credit_balance_cents')
      .eq('user_id', userId)
      .single()
    
    const amountCents = usdToCents(amountUsd)
    const newBalance = (before?.credit_balance_cents || 0) + amountCents
    
    // Update balance
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ credit_balance_cents: newBalance })
      .eq('user_id', userId)
    
    if (updateError) {
      logTest(`Add $${amountUsd}`, false, updateError.message)
      continue
    }
    
    // Record transaction
    const { error: txError } = await supabase
      .from('credit_transactions')
      .insert({
        user_id: userId,
        type: 'admin_adjustment',
        amount_cents: amountCents,
        balance_after_cents: newBalance,
        description: `Admin test: Added $${amountUsd}`,
      })
    
    if (txError) {
      logTest(`Add $${amountUsd}`, false, `Balance updated but transaction failed: ${txError.message}`)
    } else {
      const { data: after } = await supabase
        .from('user_profiles')
        .select('credit_balance_cents')
        .eq('user_id', userId)
        .single()
      
      logTest(`Add $${amountUsd}`, true, `Balance: $${centsToUsd(after?.credit_balance_cents || 0).toFixed(2)}`)
    }
  }
  
  // =====================================================
  // TEST 3: Deduct Credits (Simulate Usage)
  // =====================================================
  console.log('\n' + '─'.repeat(70))
  console.log('  💸 TEST 3: Deduct Credits (Simulate Usage)')
  console.log('─'.repeat(70))
  
  const deductAmounts = [2.5, 5, 10] // USD amounts to deduct
  
  for (const amountUsd of deductAmounts) {
    const { data: before } = await supabase
      .from('user_profiles')
      .select('credit_balance_cents')
      .eq('user_id', userId)
      .single()
    
    const balanceBefore = before?.credit_balance_cents || 0
    const amountCents = usdToCents(amountUsd)
    
    if (balanceBefore < amountCents) {
      logTest(`Deduct $${amountUsd}`, false, 'Insufficient balance')
      continue
    }
    
    const newBalance = balanceBefore - amountCents
    
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ credit_balance_cents: newBalance })
      .eq('user_id', userId)
    
    if (updateError) {
      logTest(`Deduct $${amountUsd}`, false, updateError.message)
      continue
    }
    
    // Record usage transaction
    await supabase
      .from('credit_transactions')
      .insert({
        user_id: userId,
        type: 'usage',
        amount_cents: -amountCents,
        balance_after_cents: newBalance,
        description: `Simulated scan usage: $${amountUsd}`,
        reference_type: 'scan',
        reference_id: `test-scan-${Date.now()}`,
      })
    
    const { data: after } = await supabase
      .from('user_profiles')
      .select('credit_balance_cents')
      .eq('user_id', userId)
      .single()
    
    logTest(`Deduct $${amountUsd}`, true, `Balance: $${centsToUsd(after?.credit_balance_cents || 0).toFixed(2)}`)
  }
  
  // =====================================================
  // TEST 4: Test Account Simulation Toggle
  // =====================================================
  console.log('\n' + '─'.repeat(70))
  console.log('  🧪 TEST 4: Test Account Credit Simulation')
  console.log('─'.repeat(70))
  
  // First set user to test tier
  await supabase.from('user_profiles').update({ tier: 'test' }).eq('user_id', userId)
  
  // Enable simulation
  const { error: enableError } = await supabase
    .from('user_profiles')
    .update({ test_simulate_no_credits: true })
    .eq('user_id', userId)
  
  if (enableError) {
    logTest('Enable credit simulation', false, enableError.message)
  } else {
    const { data: verify } = await supabase
      .from('user_profiles')
      .select('test_simulate_no_credits')
      .eq('user_id', userId)
      .single()
    
    logTest('Enable credit simulation', verify?.test_simulate_no_credits === true, 
      verify?.test_simulate_no_credits ? 'Simulation enabled' : 'Failed to enable')
  }
  
  // Disable simulation
  const { error: disableError } = await supabase
    .from('user_profiles')
    .update({ test_simulate_no_credits: false })
    .eq('user_id', userId)
  
  if (disableError) {
    logTest('Disable credit simulation', false, disableError.message)
  } else {
    const { data: verify } = await supabase
      .from('user_profiles')
      .select('test_simulate_no_credits')
      .eq('user_id', userId)
      .single()
    
    logTest('Disable credit simulation', verify?.test_simulate_no_credits === false,
      !verify?.test_simulate_no_credits ? 'Simulation disabled' : 'Failed to disable')
  }
  
  // =====================================================
  // RESTORE: Reset to original state
  // =====================================================
  console.log('\n' + '─'.repeat(70))
  console.log('  🔄 Restoring original state')
  console.log('─'.repeat(70))
  
  await supabase
    .from('user_profiles')
    .update({ 
      tier: originalTier,
      credit_balance_cents: originalBalance,
      test_simulate_no_credits: false
    })
    .eq('user_id', userId)
  
  // Delete test transactions
  await supabase
    .from('credit_transactions')
    .delete()
    .eq('user_id', userId)
    .like('description', '%Admin test%')
  
  await supabase
    .from('credit_transactions')
    .delete()
    .eq('user_id', userId)
    .like('description', '%Simulated scan%')
  
  const { data: final } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .single()
  
  console.log(`  Tier restored: ${final?.tier}`)
  console.log(`  Balance restored: $${centsToUsd(final?.credit_balance_cents || 0).toFixed(2)}`)
  
  // =====================================================
  // SUMMARY
  // =====================================================
  console.log('\n' + '═'.repeat(70))
  console.log('  📊 TEST SUMMARY')
  console.log('═'.repeat(70))
  
  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length
  
  console.log(`  ✅ Passed: ${passed}`)
  console.log(`  ❌ Failed: ${failed}`)
  console.log(`  📝 Total:  ${results.length}`)
  
  if (failed > 0) {
    console.log('\n  Failed tests:')
    for (const r of results.filter(r => !r.passed)) {
      console.log(`    ❌ ${r.test}: ${r.message}`)
    }
  }
  
  console.log('═'.repeat(70))
  
  // Show all users final state
  console.log('\n  📋 Final User States:')
  console.log('─'.repeat(70))
  
  const { data: allProfiles } = await supabase
    .from('user_profiles')
    .select('*')
    .order('created_at', { ascending: true })
  
  for (const p of allProfiles || []) {
    const email = emailMap.get(p.user_id) || 'Unknown'
    console.log(`  ${email.padEnd(35)} | ${p.tier.padEnd(6)} | $${centsToUsd(p.credit_balance_cents).toFixed(2)}`)
  }
  
  console.log('═'.repeat(70) + '\n')
}

main()
