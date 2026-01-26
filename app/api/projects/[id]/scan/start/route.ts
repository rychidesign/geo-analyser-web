import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TABLES } from '@/lib/db/schema'

export const runtime = 'edge'
export const maxDuration = 10

// POST - Start a new scan (creates scan record)
export async function POST(
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
    const { data: project, error: projectError } = await supabase
      .from(TABLES.PROJECTS)
      .select('*')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .single()

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Get active queries
    const { data: queries, error: queriesError } = await supabase
      .from(TABLES.PROJECT_QUERIES)
      .select('*')
      .eq('project_id', projectId)
      .eq('is_active', true)

    if (queriesError || !queries || queries.length === 0) {
      return NextResponse.json({ error: 'No active queries found' }, { status: 400 })
    }

    // Check if user has selected models (with fallback to old field name)
    const selectedModels = ((project.llm_models || project.selected_models) || []) as string[]
    if (selectedModels.length === 0) {
      return NextResponse.json({ error: 'No models selected. Please go to Project Settings and select at least one AI model.' }, { status: 400 })
    }

    // Calculate total operations
    const totalOperations = queries.length * selectedModels.length

    // Create scan record
    const { data: scan, error: scanError } = await supabase
      .from(TABLES.SCANS)
      .insert({
        project_id: projectId,
        user_id: user.id,
        status: 'running',
        evaluation_method: project.evaluation_method || 'regex',
        total_cost_usd: 0,
        total_input_tokens: 0,
        total_output_tokens: 0,
        total_queries: queries.length,
        total_results: 0,
      })
      .select()
      .single()

    if (scanError || !scan) {
      return NextResponse.json({ error: 'Failed to create scan' }, { status: 500 })
    }

    console.log(`[Scan Start] Created scan ${scan.id} for project ${projectId}: ${totalOperations} operations`)

    return NextResponse.json({
      scanId: scan.id,
      totalOperations,
      queries: queries.map(q => ({ id: q.id, query_text: q.query_text })),
      models: selectedModels,
      evaluationMethod: project.evaluation_method || 'regex',
      brandVariations: project.brand_variations || [],
      domain: project.domain,
    })
  } catch (error: any) {
    console.error('[Scan Start] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to start scan' },
      { status: 500 }
    )
  }
}
