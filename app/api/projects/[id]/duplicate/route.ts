import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { TABLES } from '@/lib/db/schema'

interface DuplicationOptions {
  queries: boolean
  settings: boolean
  scheduledScan: boolean
  scanHistory: boolean
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id: projectId } = await params

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const { newName, options }: { newName: string; options: DuplicationOptions } = await request.json()

    if (!newName || !newName.trim()) {
      return NextResponse.json({ error: 'New project name is required' }, { status: 400 })
    }

    // Get original project
    const { data: originalProject, error: projectError } = await supabase
      .from(TABLES.PROJECTS)
      .select('*')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .single()

    if (projectError || !originalProject) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Build new project data
    const newProjectData: Record<string, unknown> = {
      user_id: user.id,
      name: newName.trim(),
      brand_name: originalProject.brand_name,
      domain: originalProject.domain,
    }

    // Copy settings if requested
    if (options.settings) {
      newProjectData.language = originalProject.language
      newProjectData.selected_models = originalProject.selected_models
      newProjectData.follow_up_enabled = originalProject.follow_up_enabled
      newProjectData.follow_up_depth = originalProject.follow_up_depth
      newProjectData.query_generation_model = originalProject.query_generation_model
      newProjectData.evaluation_model = originalProject.evaluation_model
    }

    // Copy scheduled scan settings if requested
    if (options.scheduledScan) {
      newProjectData.scheduled_scan_enabled = originalProject.scheduled_scan_enabled
      newProjectData.scheduled_scan_day = originalProject.scheduled_scan_day
      // Don't copy next_scheduled_scan_at - it will be calculated fresh
    }

    // Create new project
    const { data: newProject, error: createError } = await supabase
      .from(TABLES.PROJECTS)
      .insert(newProjectData)
      .select()
      .single()

    if (createError || !newProject) {
      console.error('Error creating new project:', createError)
      return NextResponse.json({ error: 'Failed to create new project' }, { status: 500 })
    }

    // Copy queries if requested
    if (options.queries) {
      const { data: originalQueries, error: queriesError } = await supabase
        .from(TABLES.PROJECT_QUERIES)
        .select('*')
        .eq('project_id', projectId)

      if (!queriesError && originalQueries && originalQueries.length > 0) {
        const newQueries = originalQueries.map(query => ({
          project_id: newProject.id,
          query_text: query.query_text,
          category: query.category,
          is_active: query.is_active,
        }))

        const { error: insertQueriesError } = await supabase
          .from(TABLES.PROJECT_QUERIES)
          .insert(newQueries)

        if (insertQueriesError) {
          console.error('Error copying queries:', insertQueriesError)
          // Don't fail the whole operation, just log the error
        }
      }
    }

    // Copy scan history if requested (this could be a lot of data!)
    if (options.scanHistory) {
      // Get all scans from original project
      const { data: originalScans, error: scansError } = await supabase
        .from(TABLES.SCANS)
        .select('*')
        .eq('project_id', projectId)

      if (!scansError && originalScans && originalScans.length > 0) {
        // Create a mapping from old scan IDs to new scan IDs
        const scanIdMapping: Record<string, string> = {}

        for (const scan of originalScans) {
          const newScanData = {
            project_id: newProject.id,
            user_id: user.id,
            status: scan.status,
            total_queries: scan.total_queries,
            completed_queries: scan.completed_queries,
            overall_score: scan.overall_score,
            avg_visibility: scan.avg_visibility,
            avg_sentiment: scan.avg_sentiment,
            avg_ranking: scan.avg_ranking,
            total_cost_usd: scan.total_cost_usd,
            initial_score: scan.initial_score,
            conversational_bonus: scan.conversational_bonus,
            brand_persistence: scan.brand_persistence,
            follow_up_active: scan.follow_up_active,
            completed_at: scan.completed_at,
            created_at: scan.created_at,
          }

          const { data: newScan, error: insertScanError } = await supabase
            .from(TABLES.SCANS)
            .insert(newScanData)
            .select()
            .single()

          if (insertScanError || !newScan) {
            console.error('Error copying scan:', insertScanError)
            continue
          }

          scanIdMapping[scan.id] = newScan.id

          // Copy scan results for this scan
          const { data: originalResults, error: resultsError } = await supabase
            .from(TABLES.SCAN_RESULTS)
            .select('*')
            .eq('scan_id', scan.id)

          if (!resultsError && originalResults && originalResults.length > 0) {
            // First pass: copy results without parent_result_id
            const resultIdMapping: Record<string, string> = {}
            
            for (const result of originalResults.filter(r => !r.parent_result_id)) {
              const newResultData = {
                scan_id: newScan.id,
                project_id: newProject.id,
                user_id: user.id,
                query_id: result.query_id, // Note: This references old query IDs if queries weren't copied
                model_id: result.model_id,
                query_text: result.query_text,
                response_text: result.response_text,
                metrics_json: result.metrics_json,
                cost_usd: result.cost_usd,
                input_tokens: result.input_tokens,
                output_tokens: result.output_tokens,
                follow_up_level: result.follow_up_level,
                follow_up_query_used: result.follow_up_query_used,
              }

              const { data: newResult, error: insertResultError } = await supabase
                .from(TABLES.SCAN_RESULTS)
                .insert(newResultData)
                .select()
                .single()

              if (!insertResultError && newResult) {
                resultIdMapping[result.id] = newResult.id
              }
            }

            // Second pass: copy follow-up results with parent_result_id
            for (const result of originalResults.filter(r => r.parent_result_id)) {
              const newParentId = resultIdMapping[result.parent_result_id]
              if (!newParentId) continue // Skip if parent wasn't copied

              const newResultData = {
                scan_id: newScan.id,
                project_id: newProject.id,
                user_id: user.id,
                query_id: result.query_id,
                model_id: result.model_id,
                query_text: result.query_text,
                response_text: result.response_text,
                metrics_json: result.metrics_json,
                cost_usd: result.cost_usd,
                input_tokens: result.input_tokens,
                output_tokens: result.output_tokens,
                follow_up_level: result.follow_up_level,
                parent_result_id: newParentId,
                follow_up_query_used: result.follow_up_query_used,
              }

              await supabase
                .from(TABLES.SCAN_RESULTS)
                .insert(newResultData)
            }
          }
        }
      }
    }

    return NextResponse.json({ 
      project: newProject,
      message: 'Project duplicated successfully'
    })

  } catch (error) {
    console.error('Error in project duplication:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
