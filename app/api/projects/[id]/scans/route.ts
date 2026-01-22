import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getProjectById, getProjectScans } from '@/lib/db/projects'

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
    return NextResponse.json(scans)
  } catch (error: any) {
    console.error('Error fetching scans:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch scans' }, 
      { status: 500 }
    )
  }
}
