import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TABLES } from '@/lib/db/schema'
import { canRunScan, validateModelSelection, getModelsForUser } from '@/lib/credits/middleware'
import { createReservation, getPricingConfigs, estimateScanCost, getUserProfile } from '@/lib/credits'
import { AVAILABLE_MODELS } from '@/lib/ai/providers'

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

    // Check if user can run a scan (tier limits, credits)
    const canRun = await canRunScan(user.id)
    if (!canRun.allowed) {
      return NextResponse.json({ 
        error: canRun.reason || 'Cannot run scan',
        code: 'SCAN_LIMIT_REACHED'
      }, { status: 403 })
    }

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

    // Check if user has selected models and filter out unavailable ones
    const projectModels = (project.selected_models || []) as string[]
    const availableModelIds = AVAILABLE_MODELS.filter(m => m.isActive).map(m => m.id)
    
    // Filter out models that no longer exist in AVAILABLE_MODELS
    const selectedModels = projectModels.filter(m => availableModelIds.includes(m))
    const removedModels = projectModels.filter(m => !availableModelIds.includes(m))
    
    if (removedModels.length > 0) {
      console.log(`[Scan Start] Filtered out unavailable models: ${removedModels.join(', ')}`)
    }
    
    if (selectedModels.length === 0) {
      return NextResponse.json({ error: 'No models selected. Please go to Project Settings and select at least one AI model.' }, { status: 400 })
    }

    // Validate model selection against user's tier
    const modelValidation = await validateModelSelection(user.id, selectedModels)
    if (!modelValidation.valid) {
      return NextResponse.json({ 
        error: modelValidation.reason,
        invalidModels: modelValidation.invalidModels,
        code: 'INVALID_MODELS'
      }, { status: 403 })
    }

    // Check follow-up settings
    const followUpEnabled = project.follow_up_enabled === true
    const followUpDepth = project.follow_up_depth || 1
    
    // Calculate total operations (including follow-ups)
    const operationsPerQuery = followUpEnabled ? (1 + followUpDepth) : 1
    const totalOperations = queries.length * selectedModels.length * operationsPerQuery

    // Estimate cost and create credit reservation (for paid users)
    const profile = await getUserProfile(user.id)
    let reservationId: string | undefined
    let estimatedCostCents = 0

    if (profile && profile.tier !== 'free') {
      // Get pricing to estimate cost
      const pricing = await getPricingConfigs()
      estimatedCostCents = estimateScanCost(pricing, selectedModels, queries.length)
      
      // Add 20% buffer for evaluation costs
      const reservationAmount = Math.ceil(estimatedCostCents * 1.2)
      
      // Create reservation
      const reserveResult = await createReservation(user.id, reservationAmount, projectId)
      if (!reserveResult.success) {
        return NextResponse.json({ 
          error: reserveResult.error || 'Failed to reserve credits',
          code: 'INSUFFICIENT_CREDITS',
          estimatedCost: estimatedCostCents / 100
        }, { status: 402 })
      }
      
      reservationId = reserveResult.reservationId
    }

    // Create scan record
    const { data: scan, error: scanError } = await supabase
      .from(TABLES.SCANS)
      .insert({
        project_id: projectId,
        user_id: user.id,
        status: 'running',
        evaluation_method: 'ai',
        total_cost_usd: 0,
        total_input_tokens: 0,
        total_output_tokens: 0,
        total_queries: queries.length,
        total_results: 0,
      })
      .select()
      .single()

    if (scanError || !scan) {
      // Release reservation if scan creation failed
      if (reservationId) {
        const { releaseReservation } = await import('@/lib/credits')
        await releaseReservation(reservationId, 'Scan creation failed')
      }
      return NextResponse.json({ error: 'Failed to create scan' }, { status: 500 })
    }

    // Update reservation with actual scan ID
    if (reservationId && reservationId !== 'free-tier' && reservationId !== 'test-account' && reservationId !== 'admin-account') {
      await supabase
        .from('credit_reservations')
        .update({ scan_id: scan.id })
        .eq('id', reservationId)
    }

    console.log(`[Scan Start] Created scan ${scan.id} for project ${projectId}: ${totalOperations} operations, reservation: ${reservationId}`)

    return NextResponse.json({
      scanId: scan.id,
      totalOperations,
      queries: queries.map(q => ({ 
        id: q.id, 
        query_text: q.query_text,
        query_type: q.query_type || 'informational', // Default to informational if not set
      })),
      models: selectedModels,
      brandVariations: project.brand_variations || [],
      domain: project.domain,
      language: project.language || 'en',
      reservationId,
      estimatedCostUsd: estimatedCostCents / 100,
      // Follow-up settings
      followUpEnabled,
      followUpDepth,
    })
  } catch (error: unknown) {
    console.error('[Scan Start] Error:', error)
    return NextResponse.json(
      { error: 'Failed to start scan' },
      { status: 500 }
    )
  }
}
