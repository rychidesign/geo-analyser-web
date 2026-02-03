import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'edge'

/**
 * Get all active (pending/running) scans for the current user
 * Used to restore scan state after page refresh
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get all active queue items for this user
    const { data: activeScans, error: queueError } = await supabase
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
      console.error('[Active Scans] Query error:', queueError)
      return NextResponse.json({ error: 'Failed to get active scans' }, { status: 500 })
    }

    // Get project names for each active scan
    const projectIds = [...new Set((activeScans || []).map(s => s.project_id))]
    
    let projectNames: Record<string, string> = {}
    if (projectIds.length > 0) {
      const { data: projects } = await supabase
        .from('projects')
        .select('id, name')
        .in('id', projectIds)
      
      projectNames = Object.fromEntries((projects || []).map(p => [p.id, p.name]))
    }

    // Format response
    const result = (activeScans || []).map(scan => ({
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

    return NextResponse.json({ scans: result })
  } catch (error: any) {
    console.error('[Active Scans] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get active scans' },
      { status: 500 }
    )
  }
}
