import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TABLES } from '@/lib/db/schema'

export const runtime = 'edge'

interface RouteParams {
  params: Promise<{ id: string; queueId: string }>
}

/**
 * Get scan queue status - used for polling progress
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: projectId, queueId } = await params

    // Get queue item with ownership check
    const { data: queueItem, error: queueError } = await supabase
      .from('scan_queue')
      .select('*')
      .eq('id', queueId)
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .single()

    if (queueError || !queueItem) {
      return NextResponse.json({ error: 'Queue item not found' }, { status: 404 })
    }

    // If scan is completed or failed, also return the scan data
    let scanData = null
    if (queueItem.scan_id && ['completed', 'failed'].includes(queueItem.status)) {
      const { data: scan } = await supabase
        .from(TABLES.SCANS)
        .select('*')
        .eq('id', queueItem.scan_id)
        .single()
      
      scanData = scan
    }

    return NextResponse.json({
      queueId: queueItem.id,
      status: queueItem.status,
      scanId: queueItem.scan_id,
      progress: {
        current: queueItem.progress_current || 0,
        total: queueItem.progress_total || 0,
        message: queueItem.progress_message,
      },
      error: queueItem.error_message,
      createdAt: queueItem.created_at,
      startedAt: queueItem.started_at,
      completedAt: queueItem.completed_at,
      scan: scanData,
    })
  } catch (error: any) {
    console.error('[Scan Queue Status] Error:', error)
    return NextResponse.json(
      { error: 'Failed to get queue status' },
      { status: 500 }
    )
  }
}

/**
 * Cancel a queued/running scan
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: projectId, queueId } = await params

    // Update queue item to cancelled (only if pending or running)
    const { data: queueItem, error: updateError } = await supabase
      .from('scan_queue')
      .update({ 
        status: 'cancelled',
        error_message: 'Cancelled by user',
        completed_at: new Date().toISOString()
      })
      .eq('id', queueId)
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .in('status', ['pending', 'running'])
      .select()
      .single()

    if (updateError || !queueItem) {
      return NextResponse.json({ 
        error: 'Cannot cancel: scan not found or already completed' 
      }, { status: 404 })
    }

    // If there's an associated scan, mark it as cancelled too
    if (queueItem.scan_id) {
      await supabase
        .from(TABLES.SCANS)
        .update({ status: 'cancelled' })
        .eq('id', queueItem.scan_id)
    }

    console.log(`[Scan Queue] Cancelled queue item ${queueId}`)

    return NextResponse.json({ 
      success: true, 
      message: 'Scan cancelled' 
    })
  } catch (error: any) {
    console.error('[Scan Queue Cancel] Error:', error)
    return NextResponse.json(
      { error: 'Failed to cancel scan' },
      { status: 500 }
    )
  }
}
