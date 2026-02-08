import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getProjectById, deleteProjectQuery } from '@/lib/db/projects'

interface RouteParams {
  params: Promise<{ id: string; queryId: string }>
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id, queryId } = await params
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

    await deleteProjectQuery(queryId)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting query:', error)
    return NextResponse.json(
      { error: 'Failed to delete query' }, 
      { status: 500 }
    )
  }
}
