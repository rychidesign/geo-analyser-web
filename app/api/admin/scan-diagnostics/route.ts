import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TABLES } from '@/lib/db/schema'

export const runtime = 'edge'
export const maxDuration = 25

/**
 * Diagnostic endpoint to check scan status
 * Only accessible by logged-in users (shows only their scans)
 * NOTE: No rate limit for admin diagnostics
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const diagnostics: any = {
      timestamp: new Date().toISOString(),
      userId: user.id,
    }

    // 1. Check active scans in scans table
    const { data: activeScans, error: scansError } = await supabase
      .from(TABLES.SCANS)
      .select('id, project_id, status, created_at, total_queries, total_results, total_cost_usd')
      .eq('user_id', user.id)
      .in('status', ['running', 'pending'])
      .order('created_at', { ascending: false })
      .limit(10)

    diagnostics.activeScans = {
      count: activeScans?.length || 0,
      scans: activeScans?.map(scan => ({
        id: scan.id.substring(0, 8) + '...',
        projectId: scan.project_id.substring(0, 8) + '...',
        status: scan.status,
        created: scan.created_at,
        results: `${scan.total_results}/${scan.total_queries}`,
        cost: scan.total_cost_usd,
      })) || [],
      error: scansError?.message,
    }

    // 2. Check scan queue
    const { data: queueItems, error: queueError } = await supabase
      .from('scan_queue')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['pending', 'running'])
      .order('created_at', { ascending: false })
      .limit(10)

    diagnostics.queueItems = {
      count: queueItems?.length || 0,
      items: queueItems?.map(item => {
        const elapsed = Date.now() - new Date(item.created_at).getTime()
        return {
          id: item.id,
          idShort: item.id.substring(0, 8) + '...',
          projectId: item.project_id,
          projectIdShort: item.project_id.substring(0, 8) + '...',
          status: item.status,
          progress: `${item.progress_current || 0}/${item.progress_total || 0}`,
          message: item.progress_message,
          created: item.created_at,
          elapsedSeconds: Math.floor(elapsed / 1000),
          started: item.started_at,
          scanId: item.scan_id,
          scanIdShort: item.scan_id ? item.scan_id.substring(0, 8) + '...' : null,
          updated: item.updated_at,
        }
      }) || [],
      error: queueError?.message,
    }

    // 3. Check recent completed scans
    const { data: recentScans, error: recentError } = await supabase
      .from(TABLES.SCANS)
      .select('id, project_id, status, created_at, completed_at, total_results')
      .eq('user_id', user.id)
      .in('status', ['completed', 'failed'])
      .order('created_at', { ascending: false })
      .limit(5)

    diagnostics.recentScans = {
      count: recentScans?.length || 0,
      scans: recentScans?.map(scan => {
        const duration = scan.completed_at 
          ? Math.floor((new Date(scan.completed_at).getTime() - new Date(scan.created_at).getTime()) / 1000)
          : 0
        return {
          id: scan.id.substring(0, 8) + '...',
          status: scan.status,
          results: scan.total_results,
          created: scan.created_at,
          durationSeconds: duration,
        }
      }) || [],
      error: recentError?.message,
    }

    // 4. Check for stuck scans
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const { data: stuckScans, error: stuckError } = await supabase
      .from(TABLES.SCANS)
      .select('id, project_id, status, created_at')
      .eq('user_id', user.id)
      .eq('status', 'running')
      .lt('created_at', fiveMinutesAgo)

    diagnostics.stuckScans = {
      count: stuckScans?.length || 0,
      scans: stuckScans?.map(scan => {
        const elapsed = Date.now() - new Date(scan.created_at).getTime()
        return {
          id: scan.id.substring(0, 8) + '...',
          projectId: scan.project_id.substring(0, 8) + '...',
          elapsedMinutes: Math.floor(elapsed / 60000),
          created: scan.created_at,
        }
      }) || [],
      error: stuckError?.message,
    }

    // 5. Recommendations
    diagnostics.recommendations = []
    
    if (diagnostics.queueItems.count > 0) {
      const item = diagnostics.queueItems.items[0]
      if (item.status === 'running' && item.elapsedSeconds > 300) {
        diagnostics.recommendations.push({
          severity: 'warning',
          message: `Scan has been running for ${Math.floor(item.elapsedSeconds / 60)} minutes. This may indicate a stuck scan.`,
        })
      }
      if (item.status === 'pending' && item.elapsedSeconds > 60) {
        diagnostics.recommendations.push({
          severity: 'info',
          message: 'Scan is pending for more than 1 minute. The worker may not be processing the queue.',
        })
      }
    }

    if (diagnostics.stuckScans.count > 0) {
      diagnostics.recommendations.push({
        severity: 'error',
        message: `Found ${diagnostics.stuckScans.count} stuck scan(s). These should be marked as failed.`,
      })
    }

    return NextResponse.json(diagnostics, { status: 200 })
  } catch (error: any) {
    console.error('[Scan Diagnostics] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get diagnostics' },
      { status: 500 }
    )
  }
}
