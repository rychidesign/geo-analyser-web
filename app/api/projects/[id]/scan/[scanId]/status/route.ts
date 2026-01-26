import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TABLES } from '@/lib/db/schema'

export const runtime = 'edge'

// GET - Get scan status and progress
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; scanId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: projectId, scanId } = await params

    // Get scan with results count
    const { data: scan, error: scanError } = await supabase
      .from(TABLES.SCANS)
      .select(`
        *,
        scan_results(count)
      `)
      .eq('id', scanId)
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .single()

    if (scanError || !scan) {
      return NextResponse.json({ error: 'Scan not found' }, { status: 404 })
    }

    // Get project to calculate total expected results (with backward compatibility)
    const { data: project } = await supabase
      .from(TABLES.PROJECTS)
      .select('llm_models, selected_models')
      .eq('id', projectId)
      .single()

    const selectedModels = ((project?.llm_models || (project as any)?.selected_models) || []) as string[]
    const totalExpected = scan.total_queries * selectedModels.length
    const completed = scan.total_results || 0

    return NextResponse.json({
      scanId: scan.id,
      status: scan.status,
      progress: {
        completed,
        total: totalExpected,
        percentage: totalExpected > 0 ? Math.round((completed / totalExpected) * 100) : 0,
      },
      metrics: {
        totalCost: scan.total_cost_usd,
        totalInputTokens: scan.total_input_tokens,
        totalOutputTokens: scan.total_output_tokens,
      },
      overallScore: scan.overall_score,
      createdAt: scan.created_at,
      completedAt: scan.completed_at,
    })
  } catch (error: any) {
    console.error('[Scan Status] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get scan status' },
      { status: 500 }
    )
  }
}
