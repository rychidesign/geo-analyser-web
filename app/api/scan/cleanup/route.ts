import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TABLES } from '@/lib/db/schema'

export const runtime = 'edge'

/**
 * Clean up stuck scans for the current user
 * Marks all 'running' scans older than 5 minutes as 'failed'
 * 
 * This handles scans that were started with the old client-side flow
 * and got stuck when the user refreshed or closed the browser.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Find stuck scans: running for more than 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    
    const { data: stuckScans, error: fetchError } = await supabase
      .from(TABLES.SCANS)
      .select('id, project_id, created_at')
      .eq('user_id', user.id)
      .eq('status', 'running')
      .lt('created_at', fiveMinutesAgo)

    if (fetchError) {
      console.error('[Cleanup] Fetch error:', fetchError)
      return NextResponse.json({ error: 'Failed to find stuck scans' }, { status: 500 })
    }

    if (!stuckScans || stuckScans.length === 0) {
      return NextResponse.json({ 
        message: 'No stuck scans found',
        cleaned: 0 
      })
    }

    // Get scan_ids that are in the queue (don't clean those)
    const { data: queuedScans } = await supabase
      .from('scan_queue')
      .select('scan_id')
      .eq('user_id', user.id)
      .in('status', ['pending', 'running'])

    const queuedScanIds = new Set((queuedScans || []).map(s => s.scan_id).filter(Boolean))
    
    // Filter out scans that are actually in the queue
    const actuallyStuckScans = stuckScans.filter(s => !queuedScanIds.has(s.id))

    if (actuallyStuckScans.length === 0) {
      return NextResponse.json({ 
        message: 'No stuck scans found (all running scans are in queue)',
        cleaned: 0 
      })
    }

    // Mark stuck scans as failed
    const stuckIds = actuallyStuckScans.map(s => s.id)
    
    const { error: updateError } = await supabase
      .from(TABLES.SCANS)
      .update({ 
        status: 'failed',
        completed_at: new Date().toISOString()
      })
      .in('id', stuckIds)
      .eq('status', 'running') // Safety check

    if (updateError) {
      console.error('[Cleanup] Update error:', updateError)
      return NextResponse.json({ error: 'Failed to clean up scans' }, { status: 500 })
    }

    // Also clean up any orphaned queue entries
    const { data: orphanedQueue } = await supabase
      .from('scan_queue')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'running')
      .lt('updated_at', fiveMinutesAgo)

    if (orphanedQueue && orphanedQueue.length > 0) {
      await supabase
        .from('scan_queue')
        .update({ 
          status: 'failed',
          error_message: 'Worker timeout - scan did not complete',
          completed_at: new Date().toISOString()
        })
        .in('id', orphanedQueue.map(q => q.id))
    }

    console.log(`[Cleanup] Cleaned up ${actuallyStuckScans.length} stuck scan(s) for user ${user.id.substring(0, 8)}...`)

    return NextResponse.json({ 
      message: `Cleaned up ${actuallyStuckScans.length} stuck scan(s)`,
      cleaned: actuallyStuckScans.length,
      scanIds: stuckIds
    })
  } catch (error: unknown) {
    console.error('[Cleanup] Error:', error)
    return NextResponse.json(
      { error: 'Failed to clean up scans' },
      { status: 500 }
    )
  }
}
