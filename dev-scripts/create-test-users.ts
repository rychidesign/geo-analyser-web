/**
 * DEV-ONLY SCRIPT: Create test users without email verification.
 * 
 * Run with: npx tsx dev-scripts/create-test-users.ts
 * 
 * Safety: Refuses to run in production.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

if (process.env.NODE_ENV === 'production') {
  console.error('This script is for development only.')
  process.exit(1)
}

// Parse .env.local manually
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
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const testUsers = [
  { email: 'test1@geoanalyser.local', password: 'TestUser123!' },
  { email: 'test2@geoanalyser.local', password: 'TestUser123!' },
  { email: 'test3@geoanalyser.local', password: 'TestUser123!' },
]

async function createTestUsers() {
  console.log('Creating test users...\n')

  for (const user of testUsers) {
    try {
      // Create user with email already confirmed
      const { data, error } = await supabase.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true, // Skip email verification
      })

      if (error) {
        if (error.message.includes('already been registered')) {
          console.log(`⚠️  ${user.email} - already exists`)
        } else {
          console.error(`❌ ${user.email} - Error: ${error.message}`)
        }
      } else {
        console.log(`✅ ${user.email} - Created successfully`)
        
        // Update user profile to 'test' tier
        const { error: profileError } = await supabase
          .from('user_profiles')
          .update({ tier: 'test' })
          .eq('user_id', data.user.id)
        
        if (profileError) {
          console.log(`   ⚠️  Profile update failed: ${profileError.message}`)
        } else {
          console.log(`   ✅ Profile updated to 'test' tier`)
        }
      }
    } catch (err) {
      console.error(`❌ ${user.email} - Exception:`, err)
    }
  }

  console.log('\n--- Login credentials ---')
  for (const user of testUsers) {
    console.log(`Email: ${user.email}`)
    console.log(`Password: ${user.password}`)
    console.log('')
  }
}

createTestUsers()
