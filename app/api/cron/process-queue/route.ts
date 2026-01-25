import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TABLES } from '@/lib/db/schema'

// This endpoint is called by Vercel Cron every minute to process pending queue items
export async function GET(request: NextRequest) {
  try {
    // Verify this is a cron request
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.log('[Cron] Unauthorized request')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[Cron] Processing queue...')

    const supabase = await createClient()

    // First, check for stuck "running" items (running for more than 10 minutes)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const { data: stuckItems, error: stuckError } = await supabase
      .from(TABLES.SCAN_QUEUE)
      .select('id')
      .eq('status', 'running')
      .lt('started_at', tenMinutesAgo)

    if (stuckItems && stuckItems.length > 0) {
      console.log(`[Cron] Found ${stuckItems.length} stuck items, resetting to pending...`)
      await supabase
        .from(TABLES.SCAN_QUEUE)
        .update({
          status: 'pending',
          started_at: null,
          error_message: 'Previous attempt timed out',
        })
        .in('id', stuckItems.map(item => item.id))
    }

    // Find the next pending item (oldest first, highest priority first)
    const { data: pendingItems, error: queueError } = await supabase
      .from(TABLES.SCAN_QUEUE)
      .select('*, projects(name)')
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)

    if (queueError) {
      console.error('[Cron] Error fetching queue:', queueError)
      return NextResponse.json({ error: 'Failed to fetch queue' }, { status: 500 })
    }

    if (!pendingItems || pendingItems.length === 0) {
      console.log('[Cron] No pending items in queue')
      return NextResponse.json({ message: 'No pending items' })
    }

    const item = pendingItems[0]
    console.log(`[Cron] Found pending item: ${item.id} for project: ${item.project_id}`)

    // Trigger the queue processor for this specific item
    const processUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/queue/process`
    
    console.log(`[Cron] Calling process endpoint: ${processUrl}`)
    
    // Call the process endpoint (no need to wait for response)
    fetch(processUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ queueId: item.id }),
    }).catch(error => {
      console.error('[Cron] Error calling process endpoint:', error)
    })

    return NextResponse.json({ 
      message: 'Queue processing triggered',
      queueId: item.id,
      projectId: item.project_id
    })
  } catch (error: any) {
    console.error('[Cron] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process queue' },
      { status: 500 }
    )
  }
}
