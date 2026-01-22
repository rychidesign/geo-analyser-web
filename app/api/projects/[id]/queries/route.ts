import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getProjectById, getProjectQueries, createProjectQuery } from '@/lib/db/projects'

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

    const queries = await getProjectQueries(id)
    return NextResponse.json(queries)
  } catch (error: any) {
    console.error('Error fetching queries:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch queries' }, 
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
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

    const body = await request.json()
    const { query_text, query_type } = body

    if (!query_text?.trim()) {
      return NextResponse.json({ error: 'Query text is required' }, { status: 400 })
    }

    const query = await createProjectQuery({
      project_id: id,
      query_text: query_text.trim(),
      query_type: query_type || 'informational',
      is_active: true,
    })

    return NextResponse.json(query)
  } catch (error: any) {
    console.error('Error creating query:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create query' }, 
      { status: 500 }
    )
  }
}
