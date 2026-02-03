import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TABLES } from '@/lib/db/schema'

export const runtime = 'edge'

/**
 * Get all active (pending/running) scans for the current user
 * Used to restore scan state after page refresh
 * 
 * Also detects "stuck" scans from old client-side flow and marks them as failed
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get all active queue items for this user (new queue-based flow)
    const { data: activeQueueScans, error: queueError } = await supabase
      .from('scan_queue')
      .select(`
        id,
        project_id,
        scan_id,
        status,
        priority,
        progress_current,
        progress_total,
        progress_message,
        created_at,
        started_at,
        error_message
      `)
      .eq('user_id', user.id)
      .in('status', ['pending', 'running'])
      .order('created_at', { ascending: false })

    if (queueError) {
      console.error('[Active Scans] Queue query error:', queueError)
    }

    // Also check for "stuck" scans in the scans table (old client-side flow)
    // These are scans with status='running' but no queue entry and old updated_at
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    
    const { data: stuckScans, error: stuckError } = await supabase
      .from(TABLES.SCANS)
      .select('id, project_id, status, created_at, total_queries, total_results')
      .eq('user_id', user.id)
      .eq('status', 'running')
      .lt('created_at', fiveMinutesAgo) // Running for more than 5 minutes
      .order('created_at', { ascending: false })

    if (stuckError) {
      console.error('[Active Scans] Stuck scans query error:', stuckError)
    }

    // Get scan_ids that are in the queue (to filter them out from stuck scans)
    const queuedScanIds = new Set((activeQueueScans || []).map(s => s.scan_id).filter(Boolean))
    
    // Filter stuck scans: running in scans table but NOT in the queue
    const actuallyStuckScans = (stuckScans || []).filter(s => !queuedScanIds.has(s.id))

    // Auto-mark stuck scans as failed (they were started with old client-side flow)
    if (actuallyStuckScans.length > 0) {
      console.log(`[Active Scans] Found ${actuallyStuckScans.length} stuck scan(s), marking as failed`)
      
      for (const stuckScan of actuallyStuckScans) {
        await supabase
          .from(TABLES.SCANS)
          .update({ 
            status: 'failed',
            completed_at: new Date().toISOString()
          })
          .eq('id', stuckScan.id)
          .eq('status', 'running') // Only update if still running
      }
    }

    // Get project names for each active scan
    const projectIds = [...new Set((activeQueueScans || []).map(s => s.project_id))]
    
    let projectNames: Record<string, string> = {}
    if (projectIds.length > 0) {
      const { data: projects } = await supabase
        .from('projects')
        .select('id, name')
        .in('id', projectIds)
      
      projectNames = Object.fromEntries((projects || []).map(p => [p.id, p.name]))
    }

    // Format response (only queue-based scans, stuck ones are now marked as failed)
    const result = (activeQueueScans || []).map(scan => ({
      queueId: scan.id,
      projectId: scan.project_id,
      projectName: projectNames[scan.project_id] || 'Unknown Project',
      scanId: scan.scan_id,
      status: scan.status,
      progress: {
        current: scan.progress_current || 0,
        total: scan.progress_total || 0,
        message: scan.progress_message,
      },
      error: scan.error_message,
      createdAt: scan.created_at,
      startedAt: scan.started_at,
    }))

    return NextResponse.json({ 
      scans: result,
      stuckScansFixed: actuallyStuckScans.length // Inform client how many stuck scans were fixed
    })
  } catch (error: any) {
    console.error('[Active Scans] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get active scans' },
      { status: 500 }
    )
  }
}
