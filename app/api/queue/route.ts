import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const TABLES = {
  SCAN_QUEUE: 'scan_queue',
  PROJECTS: 'projects',
}

// GET - List queue items for current user
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get status filter from query params
    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status')

    // Build query
    let query = supabase
      .from(TABLES.SCAN_QUEUE)
      .select(`
        *,
        project:projects(id, name, domain)
      `)
      .eq('user_id', user.id)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })

    // Apply status filter if provided
    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Queue fetch error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch queue' },
      { status: 500 }
    )
  }
}

// POST - Add scan to queue (can be multiple projects)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { project_ids, priority = 0 } = body

    if (!project_ids || !Array.isArray(project_ids) || project_ids.length === 0) {
      return NextResponse.json(
        { error: 'project_ids array is required' },
        { status: 400 }
      )
    }

    // Create queue items for each project
    const queueItems = project_ids.map((project_id: string) => ({
      user_id: user.id,
      project_id,
      status: 'pending',
      priority,
      progress_current: 0,
      progress_total: 0,
    }))

    const { data, error } = await supabase
      .from(TABLES.SCAN_QUEUE)
      .insert(queueItems)
      .select()

    if (error) throw error

    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Queue add error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to add to queue' },
      { status: 500 }
    )
  }
}
