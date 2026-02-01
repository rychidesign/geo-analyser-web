/**
 * Update test users to 'test' tier
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

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

async function updateTestTiers() {
  // Get test user IDs
  const { data: authUsers } = await supabase.auth.admin.listUsers()
  
  const testEmails = ['test1@geoanalyser.local', 'test2@geoanalyser.local', 'test3@geoanalyser.local']
  const testUserIds = authUsers?.users
    .filter(u => testEmails.includes(u.email || ''))
    .map(u => u.id) || []

  console.log(`Found ${testUserIds.length} test users`)

  for (const userId of testUserIds) {
    const { error } = await supabase
      .from('user_profiles')
      .update({ tier: 'test' })
      .eq('user_id', userId)
    
    if (error) {
      console.error(`Failed to update ${userId}:`, error.message)
    } else {
      console.log(`✅ Updated ${userId} to 'test' tier`)
    }
  }
}

updateTestTiers()
