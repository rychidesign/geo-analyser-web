import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TABLES } from '@/lib/db/schema'

/**
 * CRON JOB: Queue Scheduled Scans & Spawn Workers
 * 
 * 1. Finds all projects due for scanning
 * 2. Creates pending records in scheduled_scan_history
 * 3. Spawns multiple parallel workers to process the queue
 * 
 * Schedule: Daily at 6:00 AM UTC ("0 6 * * *")
 */

export const runtime = 'nodejs'
export const maxDuration = 30

// Number of parallel workers to spawn
const PARALLEL_WORKERS = 10

function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  
  if (process.env.NODE_ENV === 'development') {
    return true
  }
  
  if (!cronSecret) {
    console.error('[Scheduled Scans] CRON_SECRET not configured')
    return false
  }
  
  return authHeader === `Bearer ${cronSecret}`
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const startTime = Date.now()

  try {
    console.log('[Scheduled Scans] Starting queue job...')

    const now = new Date().toISOString()
    
    // Find projects due for scanning
    const { data: projects, error: projectsError } = await supabase
      .from(TABLES.PROJECTS)
      .select('id, user_id, name, next_scheduled_scan_at')
      .eq('scheduled_scan_enabled', true)
      .lte('next_scheduled_scan_at', now)
      .order('next_scheduled_scan_at', { ascending: true })

    if (projectsError) {
      console.error('[Scheduled Scans] Error fetching projects:', projectsError)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    if (!projects || projects.length === 0) {
      console.log('[Scheduled Scans] No projects due for scanning')
      return NextResponse.json({ 
        message: 'No scheduled scans due',
        queued: 0,
        duration: Date.now() - startTime
      })
    }

    console.log(`[Scheduled Scans] Found ${projects.length} projects to queue`)

    // Create history records with 'pending' status
    const historyRecords = projects.map(project => ({
      project_id: project.id,
      scheduled_for: project.next_scheduled_scan_at,
      status: 'pending'
    }))

    const { data: history, error: historyError } = await supabase
      .from(TABLES.SCHEDULED_SCAN_HISTORY)
      .insert(historyRecords)
      .select('id, project_id')

    if (historyError) {
      console.error('[Scheduled Scans] Error creating history records:', historyError)
      return NextResponse.json({ error: 'Failed to queue scans' }, { status: 500 })
    }

    // Update next_scheduled_scan_at for all queued projects
    for (const project of projects) {
      await supabase
        .from(TABLES.PROJECTS)
        .update({ 
          last_scheduled_scan_at: now,
          // Touch scheduled_scan_enabled to trigger recalculation
          scheduled_scan_enabled: true 
        })
        .eq('id', project.id)
    }

    const queuedCount = history?.length || 0
    console.log(`[Scheduled Scans] Queued ${queuedCount} scans, spawning ${PARALLEL_WORKERS} workers...`)

    // Spawn parallel workers
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    
    const workerPromises = []
    for (let i = 0; i < Math.min(PARALLEL_WORKERS, queuedCount); i++) {
      workerPromises.push(
        fetch(`${baseUrl}/api/cron/process-scan?worker=${i}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.CRON_SECRET || 'dev'}`,
            'Content-Type': 'application/json'
          }
        }).catch(err => {
          console.error(`[Scheduled Scans] Failed to spawn worker ${i}:`, err.message)
          return null
        })
      )
    }

    // Don't wait for workers to complete - fire and forget
    Promise.all(workerPromises).then(results => {
      const spawned = results.filter(r => r !== null).length
      console.log(`[Scheduled Scans] Spawned ${spawned}/${PARALLEL_WORKERS} workers`)
    })

    return NextResponse.json({
      message: 'Scans queued, workers spawning',
      queued: queuedCount,
      workers: Math.min(PARALLEL_WORKERS, queuedCount),
      projects: projects.map(p => ({ id: p.id, name: p.name })),
      duration: Date.now() - startTime
    })

  } catch (error: any) {
    console.error('[Scheduled Scans] Fatal error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
