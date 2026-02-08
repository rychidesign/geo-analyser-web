/**
 * Check scan status in database
 * This script helps diagnose scan progress issues
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// Load environment variables from .env.local
const envPath = path.join(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8')
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      const value = match[2].trim().replace(/^["']|["']$/g, '')
      process.env[key] = value
    }
  })
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing environment variables:')
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', !!supabaseUrl)
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', !!serviceRoleKey)
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function checkScanStatus() {
  console.log('🔍 Checking scan status...\n')

  // 1. Check active scans in scans table
  const { data: activeScans, error: scansError } = await supabase
    .from('scans')
    .select('id, project_id, status, created_at, total_queries, total_results, total_cost_usd')
    .in('status', ['running', 'pending'])
    .order('created_at', { ascending: false })
    .limit(10)

  if (scansError) {
    console.error('❌ Error fetching scans:', scansError)
  } else {
    console.log('📊 Active scans in scans table:')
    if (activeScans && activeScans.length > 0) {
      activeScans.forEach((scan: any) => {
        console.log(`  - Scan ${scan.id.substring(0, 8)}... | Status: ${scan.status} | Project: ${scan.project_id.substring(0, 8)}... | Created: ${new Date(scan.created_at).toLocaleString()}`)
        console.log(`    Results: ${scan.total_results}/${scan.total_queries} | Cost: $${scan.total_cost_usd || 0}`)
      })
    } else {
      console.log('  ✅ No active scans in scans table')
    }
    console.log()
  }

  // 2. Check scan queue
  const { data: queueItems, error: queueError } = await supabase
    .from('scan_queue')
    .select('*')
    .in('status', ['pending', 'running'])
    .order('created_at', { ascending: false })
    .limit(10)

  if (queueError) {
    console.error('❌ Error fetching queue:', queueError)
  } else {
    console.log('📋 Active items in scan_queue:')
    if (queueItems && queueItems.length > 0) {
      queueItems.forEach((item: any) => {
        const elapsed = Date.now() - new Date(item.created_at).getTime()
        const elapsedSec = Math.floor(elapsed / 1000)
        console.log(`  - Queue ${item.id.substring(0, 8)}... | Status: ${item.status} | Project: ${item.project_id.substring(0, 8)}...`)
        console.log(`    Progress: ${item.progress_current || 0}/${item.progress_total || 0} | Message: "${item.progress_message || 'N/A'}"`)
        console.log(`    Created: ${new Date(item.created_at).toLocaleString()} (${elapsedSec}s ago)`)
        console.log(`    Started: ${item.started_at ? new Date(item.started_at).toLocaleString() : 'Not started'}`)
        console.log(`    Scan ID: ${item.scan_id || 'Not created yet'}`)
        console.log()
      })
    } else {
      console.log('  ✅ No active items in scan_queue')
    }
  }

  // 3. Check recent completed scans
  const { data: recentScans, error: recentError } = await supabase
    .from('scans')
    .select('id, project_id, status, created_at, completed_at, total_results, total_cost_usd')
    .in('status', ['completed', 'failed'])
    .order('created_at', { ascending: false })
    .limit(5)

  if (recentError) {
    console.error('❌ Error fetching recent scans:', recentError)
  } else {
    console.log('📝 Recent completed/failed scans:')
    if (recentScans && recentScans.length > 0) {
      recentScans.forEach((scan: any) => {
        const duration = scan.completed_at 
          ? Math.floor((new Date(scan.completed_at).getTime() - new Date(scan.created_at).getTime()) / 1000)
          : 0
        console.log(`  - Scan ${scan.id.substring(0, 8)}... | Status: ${scan.status} | Results: ${scan.total_results}`)
        console.log(`    Created: ${new Date(scan.created_at).toLocaleString()} | Duration: ${duration}s`)
      })
    } else {
      console.log('  No recent scans')
    }
    console.log()
  }

  // 4. Check for stuck scans (running for more than 5 minutes)
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const { data: stuckScans, error: stuckError } = await supabase
    .from('scans')
    .select('id, project_id, status, created_at')
    .eq('status', 'running')
    .lt('created_at', fiveMinutesAgo)

  if (stuckError) {
    console.error('❌ Error checking stuck scans:', stuckError)
  } else {
    if (stuckScans && stuckScans.length > 0) {
      console.log('⚠️  STUCK SCANS DETECTED (running > 5 minutes):')
      stuckScans.forEach((scan: any) => {
        const elapsed = Date.now() - new Date(scan.created_at).getTime()
        const elapsedMin = Math.floor(elapsed / 60000)
        console.log(`  - Scan ${scan.id.substring(0, 8)}... | Project: ${scan.project_id.substring(0, 8)}... | Running for ${elapsedMin} minutes`)
      })
      console.log('  💡 These scans may need to be manually marked as failed')
      console.log()
    }
  }

  // 5. Summary
  console.log('✅ Scan status check complete!')
  console.log('\n📌 To trigger the queue worker manually, run:')
  console.log('   curl -X POST http://localhost:3000/api/cron/process-queue -H "Content-Type: application/json"')
  console.log('\n📌 Or in production:')
  console.log('   curl -X POST https://YOUR_DOMAIN/api/cron/process-queue -H "Authorization: Bearer YOUR_CRON_SECRET"')
}

checkScanStatus().catch(console.error)
