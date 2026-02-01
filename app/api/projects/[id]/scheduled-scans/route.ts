import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TABLES } from '@/lib/db/schema'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET - Get scheduled scan history for a project
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify project ownership
    const { data: project, error: projectError } = await supabase
      .from(TABLES.PROJECTS)
      .select('id, user_id')
      .eq('id', projectId)
      .single()

    if (projectError || !project || project.user_id !== user.id) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Get scheduled scan history
    const { data: history, error: historyError } = await supabase
      .from(TABLES.SCHEDULED_SCAN_HISTORY)
      .select(`
        id,
        scan_id,
        scheduled_for,
        status,
        error_message,
        created_at,
        completed_at
      `)
      .eq('project_id', projectId)
      .order('scheduled_for', { ascending: false })
      .limit(20)

    if (historyError) {
      console.error('Error fetching scheduled scan history:', historyError)
      return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 })
    }

    return NextResponse.json({
      history: history || []
    })
  } catch (error: any) {
    console.error('Error in scheduled scans endpoint:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
