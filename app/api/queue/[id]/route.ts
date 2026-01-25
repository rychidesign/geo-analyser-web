import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const TABLES = {
  SCAN_QUEUE: 'scan_queue',
}

// PATCH - Update queue item (pause/resume/cancel)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: queueId } = await params
    const body = await request.json()
    const { action } = body

    // Validate action
    if (!['pause', 'resume', 'cancel'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be: pause, resume, or cancel' },
        { status: 400 }
      )
    }

    // Get current queue item
    const { data: queueItem, error: fetchError } = await supabase
      .from(TABLES.SCAN_QUEUE)
      .select('*')
      .eq('id', queueId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !queueItem) {
      return NextResponse.json(
        { error: 'Queue item not found' },
        { status: 404 }
      )
    }

    // Determine new status based on action
    let newStatus: string
    let updates: any = {}

    switch (action) {
      case 'pause':
        if (queueItem.status !== 'running') {
          return NextResponse.json(
            { error: 'Can only pause running scans' },
            { status: 400 }
          )
        }
        newStatus = 'paused'
        updates = { status: newStatus }
        break

      case 'resume':
        if (queueItem.status !== 'paused') {
          return NextResponse.json(
            { error: 'Can only resume paused scans' },
            { status: 400 }
          )
        }
        newStatus = 'pending'
        updates = { status: newStatus }
        break

      case 'cancel':
        if (!['pending', 'running', 'paused'].includes(queueItem.status)) {
          return NextResponse.json(
            { error: 'Cannot cancel completed or failed scans' },
            { status: 400 }
          )
        }
        newStatus = 'cancelled'
        updates = {
          status: newStatus,
          completed_at: new Date().toISOString(),
          error_message: 'Cancelled by user',
        }
        break

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    // Update queue item
    const { data, error } = await supabase
      .from(TABLES.SCAN_QUEUE)
      .update(updates)
      .eq('id', queueId)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Queue update error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update queue item' },
      { status: 500 }
    )
  }
}

// DELETE - Remove queue item
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: queueId } = await params

    // Only allow deletion of completed, failed, or cancelled items
    const { data: queueItem, error: fetchError } = await supabase
      .from(TABLES.SCAN_QUEUE)
      .select('status')
      .eq('id', queueId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !queueItem) {
      return NextResponse.json(
        { error: 'Queue item not found' },
        { status: 404 }
      )
    }

    if (!['completed', 'failed', 'cancelled'].includes(queueItem.status)) {
      return NextResponse.json(
        { error: 'Can only delete completed, failed, or cancelled items' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from(TABLES.SCAN_QUEUE)
      .delete()
      .eq('id', queueId)
      .eq('user_id', user.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Queue delete error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete queue item' },
      { status: 500 }
    )
  }
}
