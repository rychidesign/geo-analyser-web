import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TABLES } from '@/lib/db/schema'
import { canRunScan, validateModelSelection } from '@/lib/credits/middleware'
import { createReservation, getPricingConfigs, estimateScanCost, getUserProfile } from '@/lib/credits'
import { AVAILABLE_MODELS } from '@/lib/ai/providers'

export const runtime = 'edge'
export const maxDuration = 10

/**
 * Queue a scan for background processing
 * This creates a scan_queue entry that will be processed by the cron worker
 * The scan will continue running even if the user refreshes or closes the browser
 */
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

    // Check if there's already a pending/running scan for this project
    const { data: existingQueue } = await supabase
      .from('scan_queue')
      .select('id, status')
      .eq('project_id', projectId)
      .in('status', ['pending', 'running'])
      .limit(1)

    if (existingQueue && existingQueue.length > 0) {
      return NextResponse.json({ 
        error: 'A scan is already queued or running for this project',
        code: 'SCAN_ALREADY_QUEUED',
        queueId: existingQueue[0].id
      }, { status: 409 })
    }

    // Check if user has selected models and filter out unavailable ones
    const projectModels = (project.selected_models || []) as string[]
    const availableModelIds = AVAILABLE_MODELS.filter(m => m.isActive).map(m => m.id)
    
    // Filter out models that no longer exist in AVAILABLE_MODELS
    const selectedModels = projectModels.filter(m => availableModelIds.includes(m))
    
    if (selectedModels.length === 0) {
      return NextResponse.json({ 
        error: 'No models selected. Please go to Project Settings and select at least one AI model.' 
      }, { status: 400 })
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

    // Calculate total operations
    const followUpEnabled = project.follow_up_enabled === true
    const followUpDepth = project.follow_up_depth || 1
    const operationsPerQuery = followUpEnabled ? (1 + followUpDepth) : 1
    const totalOperations = queries.length * selectedModels.length * operationsPerQuery

    // Estimate cost for paid users
    const profile = await getUserProfile(user.id)
    let estimatedCostCents = 0

    if (profile && profile.tier !== 'free') {
      const pricing = await getPricingConfigs()
      estimatedCostCents = estimateScanCost(pricing, selectedModels, queries.length)
      
      // Check if user has enough credits (with 20% buffer)
      const requiredCents = Math.ceil(estimatedCostCents * 1.2)
      if (profile.credit_balance_cents < requiredCents) {
        return NextResponse.json({ 
          error: 'Insufficient credits for this scan',
          code: 'INSUFFICIENT_CREDITS',
          estimatedCost: estimatedCostCents / 100,
          available: profile.credit_balance_cents / 100
        }, { status: 402 })
      }
    }

    // Create queue entry
    const { data: queueItem, error: queueError } = await supabase
      .from('scan_queue')
      .insert({
        user_id: user.id,
        project_id: projectId,
        status: 'pending',
        priority: 0,
        progress_current: 0,
        progress_total: totalOperations,
        progress_message: 'Waiting in queue...',
        is_scheduled: false,
      })
      .select()
      .single()

    if (queueError || !queueItem) {
      console.error('[Scan Queue] Failed to create queue item:', queueError)
      return NextResponse.json({ error: 'Failed to queue scan' }, { status: 500 })
    }

    console.log(`[Scan Queue] Created queue item ${queueItem.id} for project ${projectId}: ${totalOperations} operations`)

    // Trigger the worker to start processing (fire and forget)
    triggerWorker(request)

    return NextResponse.json({
      queueId: queueItem.id,
      status: 'pending',
      totalOperations,
      estimatedCostUsd: estimatedCostCents / 100,
      message: 'Scan queued for processing'
    })
  } catch (error: any) {
    console.error('[Scan Queue] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to queue scan' },
      { status: 500 }
    )
  }
}

// Trigger the worker to process the queue
async function triggerWorker(request: NextRequest) {
  try {
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    
    const cronSecret = process.env.CRON_SECRET
    const authHeader = cronSecret ? `Bearer ${cronSecret}` : ''
    
    // Fire and forget - don't wait for response
    fetch(`${baseUrl}/api/cron/process-queue`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      }
    }).catch(err => {
      console.warn('[Scan Queue] Worker trigger failed:', err.message)
    })
  } catch (error) {
    console.warn('[Scan Queue] Failed to trigger worker:', error)
  }
}
