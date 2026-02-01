import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getProjectById } from '@/lib/db/projects'
import { TABLES } from '@/lib/db/schema'

interface RouteParams {
  params: Promise<{ id: string; scanId: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id, scanId } = await params
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

    // Get scan
    const { data: scan, error: scanError } = await supabase
      .from(TABLES.SCANS)
      .select('*')
      .eq('id', scanId)
      .eq('project_id', id)
      .single()

    if (scanError || !scan) {
      return NextResponse.json({ error: 'Scan not found' }, { status: 404 })
    }

    // Get results - order by query_text, model, then follow_up_level for proper grouping
    const { data: results } = await supabase
      .from(TABLES.SCAN_RESULTS)
      .select('*')
      .eq('scan_id', scanId)
      .order('query_text', { ascending: true })
      .order('model', { ascending: true })
      .order('follow_up_level', { ascending: true })

    return NextResponse.json({
      scan,
      results: results || [],
      project: {
        brand_variations: project.brand_variations || [],
        domain: project.domain,
        target_keywords: project.target_keywords || [],
      },
    })
  } catch (error: any) {
    console.error('Error fetching scan:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch scan' }, 
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id, scanId } = await params
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

    // Verify scan exists and belongs to this project
    const { data: scan, error: scanError } = await supabase
      .from(TABLES.SCANS)
      .select('id')
      .eq('id', scanId)
      .eq('project_id', id)
      .single()

    if (scanError || !scan) {
      return NextResponse.json({ error: 'Scan not found' }, { status: 404 })
    }

    // Delete scan results first (due to foreign key constraint)
    const { error: resultsError } = await supabase
      .from(TABLES.SCAN_RESULTS)
      .delete()
      .eq('scan_id', scanId)

    if (resultsError) {
      console.error('Error deleting scan results:', resultsError)
      return NextResponse.json(
        { error: 'Failed to delete scan results' }, 
        { status: 500 }
      )
    }

    // Delete the scan
    const { error: deleteError } = await supabase
      .from(TABLES.SCANS)
      .delete()
      .eq('id', scanId)
      .eq('project_id', id)

    if (deleteError) {
      console.error('Error deleting scan:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete scan' }, 
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting scan:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete scan' }, 
      { status: 500 }
    )
  }
}
