import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getProjectById, getProjectScans } from '@/lib/db/projects'
import { TABLES } from '@/lib/db/schema'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify project ownership
    const project = await getProjectById(id)
    if (!project || project.user_id !== user.id) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const scans = await getProjectScans(id)
    
    // Get scheduled scan history to identify which scans were scheduled
    const { data: scheduledHistory } = await supabase
      .from(TABLES.SCHEDULED_SCAN_HISTORY)
      .select('scan_id')
      .eq('project_id', id)
      .not('scan_id', 'is', null)
    
    // Create a set of scan IDs that were scheduled
    const scheduledScanIds = new Set(scheduledHistory?.map(h => h.scan_id) || [])
    
    // Add is_scheduled flag to each scan
    const scansWithScheduledFlag = scans.map(scan => ({
      ...scan,
      is_scheduled: scheduledScanIds.has(scan.id)
    }))
    
    return NextResponse.json(scansWithScheduledFlag)
  } catch (error: any) {
    console.error('Error fetching scans:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch scans' }, 
      { status: 500 }
    )
  }
}
