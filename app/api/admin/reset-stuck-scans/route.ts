import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TABLES } from '@/lib/db/schema'

// Reset stuck scans that have been running for too long
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Reset all running scans for this user (regardless of time)
    const { data: stuckScans, error: fetchError } = await supabase
      .from(TABLES.SCAN_QUEUE)
      .select('id, project_id, started_at')
      .eq('user_id', user.id)
      .eq('status', 'running')

    if (fetchError) {
      console.error('Error fetching stuck scans:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch scans' }, { status: 500 })
    }

    if (!stuckScans || stuckScans.length === 0) {
      return NextResponse.json({ message: 'No stuck scans found', reset: 0 })
    }

    console.log(`[Reset Stuck] Found ${stuckScans.length} running scans for user ${user.id}`)

    // Reset them to failed status
    const { error: updateError } = await supabase
      .from(TABLES.SCAN_QUEUE)
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: 'Scan was stuck and manually reset',
      })
      .in('id', stuckScans.map(s => s.id))

    if (updateError) {
      console.error('Error resetting stuck scans:', updateError)
      return NextResponse.json({ error: 'Failed to reset scans' }, { status: 500 })
    }

    console.log(`[Reset Stuck] Successfully reset ${stuckScans.length} scans`)

    return NextResponse.json({ 
      message: 'Stuck scans reset successfully',
      reset: stuckScans.length,
      scans: stuckScans
    })
  } catch (error: any) {
    console.error('Error resetting stuck scans:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to reset scans' },
      { status: 500 }
    )
  }
}
