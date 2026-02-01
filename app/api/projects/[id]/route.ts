import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getProjectById, updateProject, deleteProject } from '@/lib/db/projects'

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

    const project = await getProjectById(id)
    
    if (!project || project.user_id !== user.id) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Get generation costs from credit_transactions
    const { data: transactions } = await supabase
      .from('credit_transactions')
      .select('amount_cents')
      .eq('user_id', user.id)
      .eq('reference_type', 'generation')
      .eq('reference_id', id)
    
    const generationCostCents = transactions?.reduce((sum, t) => sum + Math.abs(t.amount_cents), 0) || 0

    return NextResponse.json({
      ...project,
      generation_cost_usd: generationCostCents / 100,
    })
  } catch (error: any) {
    console.error('Error fetching project:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch project' }, 
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify ownership
    const existing = await getProjectById(id)
    if (!existing || existing.user_id !== user.id) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const body = await request.json()
    const allowedFields = [
      'name', 
      'domain', 
      'language',
      'brand_variations',
      'target_keywords',
      'scheduled_scan_enabled', 
      'scheduled_scan_day',
      'follow_up_enabled',
      'follow_up_depth',
      'selected_models',  // Database column name
      'query_generation_model',
      'evaluation_model',
    ]
    
    const updates: Record<string, any> = {}
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field]
      }
    }
    
    // Handle llm_models -> selected_models mapping (frontend sends llm_models)
    if (body.llm_models !== undefined) {
      updates.selected_models = body.llm_models
    }

    const project = await updateProject(id, updates)
    return NextResponse.json(project)
  } catch (error: any) {
    console.error('Error updating project:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update project' }, 
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify ownership
    const existing = await getProjectById(id)
    if (!existing || existing.user_id !== user.id) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    await deleteProject(id)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting project:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete project' }, 
      { status: 500 }
    )
  }
}
