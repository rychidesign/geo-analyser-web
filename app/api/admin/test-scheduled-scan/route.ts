import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { TABLES } from '@/lib/db/schema'

/**
 * TEST ENDPOINT: Manually trigger a scheduled scan for a specific project
 * 
 * Only accessible by admin users or in development mode.
 * Creates a pending record in scheduled_scan_history and then processes it.
 */

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin (tier === 'admin')
    const { data: profile } = await supabase
      .from(TABLES.USER_PROFILES)
      .select('tier')
      .eq('user_id', user.id)
      .single()

    // Allow in development or for admins
    const isDev = process.env.NODE_ENV === 'development'
    const isAdmin = profile?.tier === 'admin'
    if (!isDev && !isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { projectId } = await request.json()

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    // Verify project exists and user has access
    const { data: project, error: projectError } = await supabase
      .from(TABLES.PROJECTS)
      .select('id, name, user_id')
      .eq('id', projectId)
      .single()

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Allow admins to test any project, regular users only their own
    if (!isAdmin && project.user_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    console.log(`[Test Scheduled Scan] Creating scheduled scan for project: ${project.name}`)

    // Check service role key is available
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ 
        error: 'Server misconfiguration: SUPABASE_SERVICE_ROLE_KEY not set' 
      }, { status: 500 })
    }

    // Use admin client to bypass RLS for scheduled_scan_history insert
    const adminSupabase = createAdminClient()
    
    // Create a pending record in scheduled_scan_history
    const now = new Date().toISOString()
    const { data: historyRecord, error: historyError } = await adminSupabase
      .from(TABLES.SCHEDULED_SCAN_HISTORY)
      .insert({
        project_id: projectId,
        scheduled_for: now,
        status: 'pending'
      })
      .select()
      .single()

    if (historyError) {
      console.error('[Test Scheduled Scan] Failed to create history record:', historyError)
      return NextResponse.json({ error: 'Failed to create scheduled scan record', details: historyError.message }, { status: 500 })
    }

    console.log(`[Test Scheduled Scan] Created history record ${historyRecord.id}, triggering worker...`)

    // Trigger the process-scan worker
    // Use NEXT_PUBLIC_APP_URL first (production URL), then VERCEL_URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL 
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
      || 'http://localhost:3000'
    
    const cronSecret = process.env.CRON_SECRET

    let workerResult: any = null
    let workerError: string | null = null

    // Debug info
    console.log(`[Test Scheduled Scan] Using baseUrl: ${baseUrl}`)
    console.log(`[Test Scheduled Scan] CRON_SECRET exists: ${!!cronSecret}`)

    if (!cronSecret) {
      return NextResponse.json({
        success: true,
        message: 'Scheduled scan record created, but CRON_SECRET not configured',
        historyId: historyRecord.id,
        projectName: project.name,
        workerError: 'CRON_SECRET environment variable is not set',
        workerResponse: null
      })
    }

    try {
      const workerUrl = `${baseUrl}/api/cron/process-scan?worker=test`
      console.log(`[Test Scheduled Scan] Calling worker: ${workerUrl}`)
      
      const workerResponse = await fetch(workerUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cronSecret}`,
          'Content-Type': 'application/json'
        }
      })

      const contentType = workerResponse.headers.get('content-type')
      if (contentType?.includes('application/json')) {
        workerResult = await workerResponse.json()
      } else {
        const text = await workerResponse.text()
        workerError = `Worker returned non-JSON (status ${workerResponse.status}): ${text.substring(0, 200)}`
        console.error('[Test Scheduled Scan] Worker error:', workerError)
      }
    } catch (workerErr: any) {
      workerError = `Worker call failed: ${workerErr.message}`
      console.error('[Test Scheduled Scan] Worker exception:', workerErr)
    }

    return NextResponse.json({
      success: true,
      message: 'Scheduled scan record created' + (workerResult ? ', worker triggered' : ', worker trigger failed'),
      historyId: historyRecord.id,
      projectName: project.name,
      workerResponse: workerResult,
      workerError
    })

  } catch (error: any) {
    console.error('[Test Scheduled Scan] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
