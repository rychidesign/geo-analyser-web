import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TABLES } from '@/lib/db/schema'

export const runtime = 'edge'
export const maxDuration = 10

/**
 * DELETE all scans for a project
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: projectId } = await params

    // Verify project ownership
    const { data: project } = await supabase
      .from(TABLES.PROJECTS)
      .select('id')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .single()

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Delete all scan results first (foreign key constraint)
    const { data: scans } = await supabase
      .from(TABLES.SCANS)
      .select('id')
      .eq('project_id', projectId)
      .eq('user_id', user.id)

    if (scans && scans.length > 0) {
      const scanIds = scans.map(s => s.id)
      
      // Delete scan results
      await supabase
        .from(TABLES.SCAN_RESULTS)
        .delete()
        .in('scan_id', scanIds)

      // Delete scans
      const { error: deleteError } = await supabase
        .from(TABLES.SCANS)
        .delete()
        .eq('project_id', projectId)
        .eq('user_id', user.id)

      if (deleteError) {
        console.error('[Delete All Scans] Error:', deleteError)
        return NextResponse.json({ error: 'Failed to delete scans' }, { status: 500 })
      }

      console.log(`[Delete All Scans] Deleted ${scans.length} scans for project ${projectId}`)
    }

    return NextResponse.json({ 
      success: true, 
      deletedCount: scans?.length || 0 
    })
  } catch (error: any) {
    console.error('[Delete All Scans] Error:', error)
    return NextResponse.json(
      { error: 'Failed to delete scans' },
      { status: 500 }
    )
  }
}
