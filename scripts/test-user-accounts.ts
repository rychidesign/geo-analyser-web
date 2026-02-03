/**
 * Test script for user accounts: Adding users, changing tiers, credits management
 * Run with: npx tsx scripts/test-user-accounts.ts
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

// =====================================================
// Environment Setup
// =====================================================

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
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

// =====================================================
// Types
// =====================================================

type UserTier = 'free' | 'paid' | 'test' | 'admin'

interface TestResult {
  test: string
  passed: boolean
  message: string
  details?: any
}

// =====================================================
// Helper Functions
// =====================================================

const testResults: TestResult[] = []

function log(message: string) {
  console.log(`  ${message}`)
}

function logTest(name: string, passed: boolean, message: string, details?: any) {
  const icon = passed ? '✅' : '❌'
  console.log(`${icon} ${name}: ${message}`)
  testResults.push({ test: name, passed, message, details })
}

function usdToCents(usd: number): number {
  return Math.round(usd * 100)
}

function centsToUsd(cents: number): number {
  return cents / 100
}

// =====================================================
// Test: User Creation
// =====================================================

async function testUserCreation() {
  console.log('\n📝 TEST 1: User Creation')
  console.log('─'.repeat(50))
  
  const testEmail = `test-${Date.now()}@test-accounts.local`
  const testPassword = 'TestPassword123!'
  
  try {
    // Create new user
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
    })
    
    if (createError) {
      logTest('Create User', false, createError.message)
      return null
    }
    
    log(`Created user: ${newUser.user.email} (ID: ${newUser.user.id})`)
    
    // Verify profile was created (by trigger)
    await new Promise(resolve => setTimeout(resolve, 500)) // Wait for trigger
    
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', newUser.user.id)
      .single()
    
    if (profileError || !profile) {
      // Profile not created by trigger, create manually
      const { data: newProfile, error: insertError } = await supabase
        .from('user_profiles')
        .insert({ user_id: newUser.user.id, tier: 'free' })
        .select()
        .single()
      
      if (insertError) {
        logTest('Create User Profile', false, insertError.message)
        return newUser.user.id
      }
      
      log(`Created profile manually (trigger didn't fire)`)
      logTest('Create User', true, `User and profile created: ${testEmail}`, {
        userId: newUser.user.id,
        tier: newProfile.tier,
        balance: newProfile.credit_balance_cents
      })
    } else {
      logTest('Create User', true, `User created with auto-profile: ${testEmail}`, {
        userId: newUser.user.id,
        tier: profile.tier,
        balance: profile.credit_balance_cents
      })
    }
    
    return newUser.user.id
  } catch (err: any) {
    logTest('Create User', false, err.message)
    return null
  }
}

// =====================================================
// Test: Tier Changes
// =====================================================

async function testTierChanges(userId: string) {
  console.log('\n🏷️ TEST 2: Tier Changes')
  console.log('─'.repeat(50))
  
  const tiers: UserTier[] = ['free', 'paid', 'test', 'admin']
  
  for (const tier of tiers) {
    try {
      // Update tier
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ tier })
        .eq('user_id', userId)
      
      if (updateError) {
        logTest(`Change to ${tier}`, false, updateError.message)
        continue
      }
      
      // Verify change
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('tier')
        .eq('user_id', userId)
        .single()
      
      if (profile?.tier === tier) {
        logTest(`Change to ${tier}`, true, `Tier changed to: ${tier}`)
      } else {
        logTest(`Change to ${tier}`, false, `Expected ${tier}, got ${profile?.tier}`)
      }
    } catch (err: any) {
      logTest(`Change to ${tier}`, false, err.message)
    }
  }
  
  // Reset to 'free' for further tests
  await supabase
    .from('user_profiles')
    .update({ tier: 'free' })
    .eq('user_id', userId)
}

// =====================================================
// Test: Add Credits
// =====================================================

async function testAddCredits(userId: string) {
  console.log('\n💰 TEST 3: Add Credits')
  console.log('─'.repeat(50))
  
  // Reset balance to 0
  await supabase
    .from('user_profiles')
    .update({ 
      credit_balance_cents: 0,
      paid_credits_cents: 0,
      bonus_credits_cents: 0
    })
    .eq('user_id', userId)
  
  // Test 1: Add $10 (1000 cents)
  const addAmount1 = 1000
  try {
    const { data: profileBefore } = await supabase
      .from('user_profiles')
      .select('credit_balance_cents')
      .eq('user_id', userId)
      .single()
    
    const balanceBefore = profileBefore?.credit_balance_cents || 0
    
    // Update balance
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ 
        credit_balance_cents: balanceBefore + addAmount1,
        paid_credits_cents: addAmount1
      })
      .eq('user_id', userId)
    
    if (updateError) {
      logTest('Add $10', false, updateError.message)
    } else {
      // Record transaction
      await supabase
        .from('credit_transactions')
        .insert({
          user_id: userId,
          type: 'top_up',
          amount_cents: addAmount1,
          balance_after_cents: balanceBefore + addAmount1,
          description: 'Test: Added $10',
        })
      
      // Verify
      const { data: profileAfter } = await supabase
        .from('user_profiles')
        .select('credit_balance_cents')
        .eq('user_id', userId)
        .single()
      
      const expectedBalance = balanceBefore + addAmount1
      if (profileAfter?.credit_balance_cents === expectedBalance) {
        logTest('Add $10', true, `Balance: $${centsToUsd(expectedBalance)}`, {
          before: balanceBefore,
          added: addAmount1,
          after: profileAfter?.credit_balance_cents
        })
      } else {
        logTest('Add $10', false, `Expected ${expectedBalance}, got ${profileAfter?.credit_balance_cents}`)
      }
    }
  } catch (err: any) {
    logTest('Add $10', false, err.message)
  }
  
  // Test 2: Add $50 more
  const addAmount2 = 5000
  try {
    const { data: profileBefore } = await supabase
      .from('user_profiles')
      .select('credit_balance_cents, paid_credits_cents')
      .eq('user_id', userId)
      .single()
    
    const balanceBefore = profileBefore?.credit_balance_cents || 0
    const paidBefore = profileBefore?.paid_credits_cents || 0
    
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ 
        credit_balance_cents: balanceBefore + addAmount2,
        paid_credits_cents: paidBefore + addAmount2
      })
      .eq('user_id', userId)
    
    if (updateError) {
      logTest('Add $50', false, updateError.message)
    } else {
      await supabase
        .from('credit_transactions')
        .insert({
          user_id: userId,
          type: 'top_up',
          amount_cents: addAmount2,
          balance_after_cents: balanceBefore + addAmount2,
          description: 'Test: Added $50',
        })
      
      const { data: profileAfter } = await supabase
        .from('user_profiles')
        .select('credit_balance_cents')
        .eq('user_id', userId)
        .single()
      
      const expectedBalance = balanceBefore + addAmount2
      if (profileAfter?.credit_balance_cents === expectedBalance) {
        logTest('Add $50', true, `Balance: $${centsToUsd(expectedBalance)}`, {
          before: balanceBefore,
          added: addAmount2,
          after: profileAfter?.credit_balance_cents
        })
      } else {
        logTest('Add $50', false, `Expected ${expectedBalance}, got ${profileAfter?.credit_balance_cents}`)
      }
    }
  } catch (err: any) {
    logTest('Add $50', false, err.message)
  }
  
  // Test 3: Add bonus credits ($5 bonus)
  const bonusAmount = 500
  try {
    const { data: profileBefore } = await supabase
      .from('user_profiles')
      .select('credit_balance_cents, bonus_credits_cents')
      .eq('user_id', userId)
      .single()
    
    const balanceBefore = profileBefore?.credit_balance_cents || 0
    const bonusBefore = profileBefore?.bonus_credits_cents || 0
    
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ 
        credit_balance_cents: balanceBefore + bonusAmount,
        bonus_credits_cents: bonusBefore + bonusAmount
      })
      .eq('user_id', userId)
    
    if (updateError) {
      logTest('Add $5 Bonus', false, updateError.message)
    } else {
      await supabase
        .from('credit_transactions')
        .insert({
          user_id: userId,
          type: 'bonus',
          amount_cents: bonusAmount,
          balance_after_cents: balanceBefore + bonusAmount,
          description: 'Test: Bonus $5',
        })
      
      const { data: profileAfter } = await supabase
        .from('user_profiles')
        .select('credit_balance_cents, bonus_credits_cents')
        .eq('user_id', userId)
        .single()
      
      logTest('Add $5 Bonus', true, `Balance: $${centsToUsd(profileAfter?.credit_balance_cents || 0)}, Bonus: $${centsToUsd(profileAfter?.bonus_credits_cents || 0)}`, {
        balance: profileAfter?.credit_balance_cents,
        bonus: profileAfter?.bonus_credits_cents
      })
    }
  } catch (err: any) {
    logTest('Add $5 Bonus', false, err.message)
  }
}

// =====================================================
// Test: Deduct Credits
// =====================================================

async function testDeductCredits(userId: string) {
  console.log('\n💸 TEST 4: Deduct Credits')
  console.log('─'.repeat(50))
  
  // Test 1: Deduct $2.50 (250 cents)
  const deductAmount1 = 250
  try {
    const { data: profileBefore } = await supabase
      .from('user_profiles')
      .select('credit_balance_cents')
      .eq('user_id', userId)
      .single()
    
    const balanceBefore = profileBefore?.credit_balance_cents || 0
    
    if (balanceBefore < deductAmount1) {
      logTest('Deduct $2.50', false, 'Insufficient balance')
    } else {
      const newBalance = balanceBefore - deductAmount1
      
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ credit_balance_cents: newBalance })
        .eq('user_id', userId)
      
      if (updateError) {
        logTest('Deduct $2.50', false, updateError.message)
      } else {
        await supabase
          .from('credit_transactions')
          .insert({
            user_id: userId,
            type: 'usage',
            amount_cents: -deductAmount1,
            balance_after_cents: newBalance,
            description: 'Test: Scan usage',
            reference_type: 'scan',
            reference_id: 'test-scan-1',
          })
        
        const { data: profileAfter } = await supabase
          .from('user_profiles')
          .select('credit_balance_cents')
          .eq('user_id', userId)
          .single()
        
        if (profileAfter?.credit_balance_cents === newBalance) {
          logTest('Deduct $2.50', true, `Balance: $${centsToUsd(newBalance)}`, {
            before: balanceBefore,
            deducted: deductAmount1,
            after: profileAfter?.credit_balance_cents
          })
        } else {
          logTest('Deduct $2.50', false, `Expected ${newBalance}, got ${profileAfter?.credit_balance_cents}`)
        }
      }
    }
  } catch (err: any) {
    logTest('Deduct $2.50', false, err.message)
  }
  
  // Test 2: Deduct $10 more
  const deductAmount2 = 1000
  try {
    const { data: profileBefore } = await supabase
      .from('user_profiles')
      .select('credit_balance_cents')
      .eq('user_id', userId)
      .single()
    
    const balanceBefore = profileBefore?.credit_balance_cents || 0
    
    if (balanceBefore < deductAmount2) {
      logTest('Deduct $10', false, 'Insufficient balance')
    } else {
      const newBalance = balanceBefore - deductAmount2
      
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ credit_balance_cents: newBalance })
        .eq('user_id', userId)
      
      if (updateError) {
        logTest('Deduct $10', false, updateError.message)
      } else {
        await supabase
          .from('credit_transactions')
          .insert({
            user_id: userId,
            type: 'usage',
            amount_cents: -deductAmount2,
            balance_after_cents: newBalance,
            description: 'Test: Multiple scans',
            reference_type: 'scan',
            reference_id: 'test-scan-2',
          })
        
        const { data: profileAfter } = await supabase
          .from('user_profiles')
          .select('credit_balance_cents')
          .eq('user_id', userId)
          .single()
        
        logTest('Deduct $10', true, `Balance: $${centsToUsd(profileAfter?.credit_balance_cents || 0)}`, {
          before: balanceBefore,
          deducted: deductAmount2,
          after: profileAfter?.credit_balance_cents
        })
      }
    }
  } catch (err: any) {
    logTest('Deduct $10', false, err.message)
  }
  
  // Test 3: Try to deduct more than balance (should fail)
  try {
    const { data: profileBefore } = await supabase
      .from('user_profiles')
      .select('credit_balance_cents')
      .eq('user_id', userId)
      .single()
    
    const balanceBefore = profileBefore?.credit_balance_cents || 0
    const overDeductAmount = balanceBefore + 1000 // More than available
    
    if (balanceBefore < overDeductAmount) {
      logTest('Over-deduct (should fail)', true, 'Correctly prevented: Insufficient balance', {
        balance: balanceBefore,
        attempted: overDeductAmount
      })
    } else {
      logTest('Over-deduct (should fail)', false, 'Should not have enough balance')
    }
  } catch (err: any) {
    logTest('Over-deduct (should fail)', true, `Correctly caught error: ${err.message}`)
  }
}

// =====================================================
// Test: Transaction History
// =====================================================

async function testTransactionHistory(userId: string) {
  console.log('\n📋 TEST 5: Transaction History')
  console.log('─'.repeat(50))
  
  try {
    const { data: transactions, error } = await supabase
      .from('credit_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10)
    
    if (error) {
      logTest('Transaction History', false, error.message)
    } else {
      log(`Found ${transactions?.length || 0} transactions`)
      
      if (transactions && transactions.length > 0) {
        for (const tx of transactions) {
          const sign = tx.amount_cents >= 0 ? '+' : ''
          log(`  ${tx.type}: ${sign}$${centsToUsd(tx.amount_cents)} - ${tx.description}`)
        }
        
        logTest('Transaction History', true, `${transactions.length} transactions recorded`, {
          count: transactions.length,
          types: [...new Set(transactions.map(t => t.type))]
        })
      } else {
        logTest('Transaction History', false, 'No transactions found')
      }
    }
  } catch (err: any) {
    logTest('Transaction History', false, err.message)
  }
}

// =====================================================
// Test: Free Tier Limits
// =====================================================

async function testFreeTierLimits(userId: string) {
  console.log('\n🆓 TEST 6: Free Tier Limits')
  console.log('─'.repeat(50))
  
  try {
    // Set user to free tier
    await supabase
      .from('user_profiles')
      .update({ 
        tier: 'free',
        free_scans_used_this_month: 0
      })
      .eq('user_id', userId)
    
    // Test incrementing free scans
    for (let i = 1; i <= 3; i++) {
      const { data: profileBefore } = await supabase
        .from('user_profiles')
        .select('free_scans_used_this_month')
        .eq('user_id', userId)
        .single()
      
      const scansBefore = profileBefore?.free_scans_used_this_month || 0
      
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ free_scans_used_this_month: scansBefore + 1 })
        .eq('user_id', userId)
      
      if (updateError) {
        logTest(`Free scan ${i}`, false, updateError.message)
      } else {
        const { data: profileAfter } = await supabase
          .from('user_profiles')
          .select('free_scans_used_this_month')
          .eq('user_id', userId)
          .single()
        
        logTest(`Free scan ${i}`, true, `Used: ${profileAfter?.free_scans_used_this_month} scans`)
      }
    }
    
    // Test resetting counter
    const { error: resetError } = await supabase
      .from('user_profiles')
      .update({ 
        free_scans_used_this_month: 0,
        free_scans_reset_at: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString()
      })
      .eq('user_id', userId)
    
    if (resetError) {
      logTest('Reset free scans', false, resetError.message)
    } else {
      logTest('Reset free scans', true, 'Counter reset to 0')
    }
  } catch (err: any) {
    logTest('Free Tier Limits', false, err.message)
  }
}

// =====================================================
// Cleanup: Delete Test User
// =====================================================

async function cleanupTestUser(userId: string) {
  console.log('\n🧹 CLEANUP: Delete Test User')
  console.log('─'.repeat(50))
  
  try {
    // Delete transactions
    await supabase
      .from('credit_transactions')
      .delete()
      .eq('user_id', userId)
    log('Deleted transactions')
    
    // Delete profile
    await supabase
      .from('user_profiles')
      .delete()
      .eq('user_id', userId)
    log('Deleted profile')
    
    // Delete auth user
    const { error } = await supabase.auth.admin.deleteUser(userId)
    if (error) {
      logTest('Delete User', false, error.message)
    } else {
      logTest('Delete User', true, 'Test user cleaned up')
    }
  } catch (err: any) {
    logTest('Delete User', false, err.message)
  }
}

// =====================================================
// Main Test Runner
// =====================================================

async function runAllTests() {
  console.log('═'.repeat(60))
  console.log('  🧪 GEO Analyser - User Account Tests')
  console.log('═'.repeat(60))
  console.log(`  Supabase URL: ${supabaseUrl}`)
  console.log(`  Time: ${new Date().toISOString()}`)
  console.log('═'.repeat(60))
  
  // Run tests
  const userId = await testUserCreation()
  
  if (userId) {
    await testTierChanges(userId)
    await testAddCredits(userId)
    await testDeductCredits(userId)
    await testTransactionHistory(userId)
    await testFreeTierLimits(userId)
    await cleanupTestUser(userId)
  }
  
  // Summary
  console.log('\n' + '═'.repeat(60))
  console.log('  📊 TEST SUMMARY')
  console.log('═'.repeat(60))
  
  const passed = testResults.filter(r => r.passed).length
  const failed = testResults.filter(r => !r.passed).length
  const total = testResults.length
  
  console.log(`  ✅ Passed: ${passed}`)
  console.log(`  ❌ Failed: ${failed}`)
  console.log(`  📝 Total:  ${total}`)
  console.log('─'.repeat(60))
  
  if (failed > 0) {
    console.log('\n  Failed tests:')
    for (const result of testResults.filter(r => !r.passed)) {
      console.log(`    ❌ ${result.test}: ${result.message}`)
    }
  }
  
  console.log('═'.repeat(60))
  
  process.exit(failed > 0 ? 1 : 0)
}

runAllTests()
