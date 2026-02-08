import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TABLES } from '@/lib/db/schema'
import { getPricingConfigs, estimateScanCost, createReservation, consumeReservation } from '@/lib/credits'
import { AVAILABLE_MODELS } from '@/lib/ai/providers'
import { callGEOQuery, callEvaluation, getCheapestEvaluationModel, getModelInfo } from '@/lib/ai'
import { calculateDynamicCost } from '@/lib/credits'

/**
 * PROCESS SCAN WORKER
 * 
 * Processes ONE scan from the queue using atomic locking.
 * Multiple workers can run in parallel safely.
 * After completing one scan, triggers itself to process the next.
 */

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes max per scan

function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  
  if (process.env.NODE_ENV === 'development') {
    return true
  }
  
  return cronSecret ? authHeader === `Bearer ${cronSecret}` : false
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

// GET for Vercel cron backup, POST for chain triggers
export async function GET(request: NextRequest) {
  return handleProcessScan(request)
}

export async function POST(request: NextRequest) {
  return handleProcessScan(request)
}

async function handleProcessScan(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const startTime = Date.now()
  const workerId = new URL(request.url).searchParams.get('worker') || '0'

  try {
    // Atomic claim: Find and lock one pending scan
    // Using RPC for atomic operation
    const { data: claimedScan, error: claimError } = await supabase
      .rpc('claim_pending_scan')

    if (claimError) {
      console.error(`[Worker ${workerId}] Claim error:`, claimError)
      // Try fallback method
      return await fallbackClaim(supabase, workerId, request, startTime)
    }

    if (!claimedScan || claimedScan.length === 0) {
      console.log(`[Worker ${workerId}] No pending scans in queue`)
      return NextResponse.json({ 
        message: 'Queue empty', 
        worker: workerId,
        processed: 0 
      })
    }

    const historyRecord = claimedScan[0]
    return await processClaimedScan(supabase, historyRecord, workerId, request, startTime)

  } catch (error: any) {
    console.error(`[Worker ${workerId}] Fatal error:`, error)
    return NextResponse.json({ error: 'Internal processing error', worker: workerId }, { status: 500 })
  }
}

async function fallbackClaim(
  supabase: ReturnType<typeof createAdminClient>,
  workerId: string,
  request: NextRequest,
  startTime: number
) {
  // Fallback: Use optimistic locking
  const lockId = `worker-${workerId}-${Date.now()}`
  
  // Find oldest pending scan
  const { data: pending, error: fetchError } = await supabase
    .from(TABLES.SCHEDULED_SCAN_HISTORY)
    .select('id, project_id, scheduled_for')
    .eq('status', 'pending')
    .order('scheduled_for', { ascending: true })
    .limit(1)
    .single()

  if (fetchError || !pending) {
    console.log(`[Worker ${workerId}] No pending scans (fallback)`)
    return NextResponse.json({ message: 'Queue empty', worker: workerId, processed: 0 })
  }

  // Try to claim it atomically
  const { data: claimed, error: updateError } = await supabase
    .from(TABLES.SCHEDULED_SCAN_HISTORY)
    .update({ 
      status: 'running',
      error_message: lockId // Use as lock identifier
    })
    .eq('id', pending.id)
    .eq('status', 'pending') // Only if still pending
    .select()
    .single()

  if (updateError || !claimed) {
    // Another worker got it first, try again
    console.log(`[Worker ${workerId}] Lost race for scan ${pending.id}, retrying...`)
    return triggerNext(supabase, workerId, request)
  }

  // Successfully claimed
  const historyRecord = {
    id: claimed.id,
    project_id: claimed.project_id,
    scheduled_for: claimed.scheduled_for
  }

  return await processClaimedScan(supabase, historyRecord, workerId, request, startTime)
}

async function processClaimedScan(
  supabase: ReturnType<typeof createAdminClient>,
  historyRecord: { id: string; project_id: string; scheduled_for: string },
  workerId: string,
  request: NextRequest,
  startTime: number
) {
  console.log(`[Worker ${workerId}] Processing scan for project ${historyRecord.project_id}`)

  // Get project details
  const { data: project, error: projectError } = await supabase
    .from(TABLES.PROJECTS)
    .select('*')
    .eq('id', historyRecord.project_id)
    .single()

  if (projectError || !project) {
    await markFailed(supabase, historyRecord.id, 'Project not found')
    return triggerNext(supabase, workerId, request, { skipped: 1, reason: 'Project not found' })
  }

  console.log(`[Worker ${workerId}] Project: ${project.name}`)

  // Get user profile
  const { data: profile } = await supabase
    .from(TABLES.USER_PROFILES)
    .select('*')
    .eq('user_id', project.user_id)
    .single()

  if (!profile) {
    await markFailed(supabase, historyRecord.id, 'User profile not found')
    return triggerNext(supabase, workerId, request, { skipped: 1, reason: 'User not found' })
  }

  // Check credits
  if (profile.tier === 'paid' && profile.credit_balance_cents <= 0) {
    await markSkipped(supabase, historyRecord.id, 'Insufficient credits')
    return triggerNext(supabase, workerId, request, { skipped: 1, reason: 'No credits' })
  }

  // Get queries
  const { data: queries } = await supabase
    .from(TABLES.PROJECT_QUERIES)
    .select('*')
    .eq('project_id', project.id)
    .eq('is_active', true)

  if (!queries || queries.length === 0) {
    await markSkipped(supabase, historyRecord.id, 'No active queries')
    return triggerNext(supabase, workerId, request, { skipped: 1, reason: 'No queries' })
  }

  // Filter models
  const availableModelIds = AVAILABLE_MODELS.filter(m => m.isActive).map(m => m.id)
  const selectedModels = (project.selected_models || []).filter((m: string) => availableModelIds.includes(m))

  if (selectedModels.length === 0) {
    await markSkipped(supabase, historyRecord.id, 'No valid models')
    return triggerNext(supabase, workerId, request, { skipped: 1, reason: 'No models' })
  }

  // Create credit reservation
  let reservationId: string | undefined
  if (profile.tier === 'paid') {
    const pricing = await getPricingConfigs()
    const estimatedCostCents = estimateScanCost(pricing, selectedModels, queries.length)
    const reservationAmount = Math.ceil(estimatedCostCents * 1.2)

    const reserveResult = await createReservation(project.user_id, reservationAmount, project.id)
    if (!reserveResult.success) {
      await markSkipped(supabase, historyRecord.id, 'Credit reservation failed')
      return triggerNext(supabase, workerId, request, { skipped: 1, reason: 'Reservation failed' })
    }
    reservationId = reserveResult.reservationId
  }

  // Create scan record
  const { data: scan, error: scanError } = await supabase
    .from(TABLES.SCANS)
    .insert({
      project_id: project.id,
      user_id: project.user_id,
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
    if (reservationId) {
      const { releaseReservation } = await import('@/lib/credits')
      await releaseReservation(reservationId, 'Scan creation failed')
    }
    await markFailed(supabase, historyRecord.id, 'Failed to create scan')
    return triggerNext(supabase, workerId, request, { failed: 1 })
  }

  // Link scan to history
  await supabase
    .from(TABLES.SCHEDULED_SCAN_HISTORY)
    .update({ scan_id: scan.id })
    .eq('id', historyRecord.id)

  // Process the scan
  console.log(`[Worker ${workerId}] Starting scan ${scan.id}: ${queries.length} queries × ${selectedModels.length} models`)
  
  const result = await processScan(supabase, scan.id, project, queries, selectedModels, workerId)

  // Complete reservation
  if (reservationId && !['free-tier', 'test-account', 'admin-account'].includes(reservationId)) {
    await consumeReservation(reservationId, result.actualCostCents, scan.id)
  }

  // Update scan
  await supabase
    .from(TABLES.SCANS)
    .update({
      status: result.success ? 'completed' : 'failed',
      completed_at: new Date().toISOString(),
      total_cost_usd: result.totalCostUsd,
      total_input_tokens: result.totalInputTokens,
      total_output_tokens: result.totalOutputTokens,
      total_results: result.totalResults,
      overall_score: result.overallScore,
      avg_visibility: result.avgVisibility,
      avg_sentiment: result.avgSentiment,
      avg_ranking: result.avgRanking,
    })
    .eq('id', scan.id)

  // Update history
  await supabase
    .from(TABLES.SCHEDULED_SCAN_HISTORY)
    .update({
      status: result.success ? 'completed' : 'failed',
      error_message: result.error || null,
      completed_at: new Date().toISOString()
    })
    .eq('id', historyRecord.id)

  const duration = Date.now() - startTime
  console.log(`[Worker ${workerId}] Completed ${project.name} in ${Math.round(duration/1000)}s: ${result.totalResults} results`)

  return triggerNext(supabase, workerId, request, {
    processed: 1,
    projectName: project.name,
    scanId: scan.id,
    results: result.totalResults,
    duration
  })
}

async function processScan(
  supabase: ReturnType<typeof createAdminClient>,
  scanId: string,
  project: any,
  queries: any[],
  models: string[],
  workerId: string
) {
  let totalCostUsd = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalResults = 0
  let totalCostCents = 0
  
  const allScores = { visibility: [] as number[], sentiment: [] as number[], ranking: [] as number[] }
  const evaluationModel = getCheapestEvaluationModel()
  const totalOperations = queries.length * models.length
  let completedOperations = 0

  try {
    for (const modelId of models) {
      for (const query of queries) {
        try {
          const response = await callGEOQuery(modelId, query.query_text)
          completedOperations++
          
          if (!response.content) {
            console.log(`[Worker ${workerId}] Empty response from ${modelId} (${completedOperations}/${totalOperations})`)
            continue
          }

          const evalResult = await callEvaluation(
            evaluationModel,
            response.content,
            project.brand_variations || [],
            project.domain
          )

          if (!evalResult.metrics) continue

          const modelInfo = getModelInfo(modelId)
          if (!modelInfo) {
            console.log(`[Worker ${workerId}] Unknown model: ${modelId}, skipping`)
            continue
          }
          
          const queryCostCents = await calculateDynamicCost(modelId, response.inputTokens, response.outputTokens)
          const evalCostCents = await calculateDynamicCost(evaluationModel, evalResult.inputTokens, evalResult.outputTokens)

          totalCostUsd += (queryCostCents + evalCostCents) / 100
          totalCostCents += queryCostCents + evalCostCents
          totalInputTokens += response.inputTokens + evalResult.inputTokens
          totalOutputTokens += response.outputTokens + evalResult.outputTokens

          await supabase
            .from(TABLES.SCAN_RESULTS)
            .insert({
              scan_id: scanId,
              provider: modelInfo.provider,
              model: modelId,
              query_text: query.query_text,
              ai_response_raw: response.content,
              metrics_json: evalResult.metrics,
              input_tokens: response.inputTokens + evalResult.inputTokens,
              output_tokens: response.outputTokens + evalResult.outputTokens,
              cost_usd: (queryCostCents + evalCostCents) / 100,
            })

          totalResults++

          if (evalResult.metrics) {
            allScores.visibility.push(evalResult.metrics.visibility_score)
            if (evalResult.metrics.sentiment_score !== null) {
              allScores.sentiment.push(evalResult.metrics.sentiment_score)
            }
            allScores.ranking.push(evalResult.metrics.ranking_score)
          }

        } catch (err: any) {
          console.error(`[Worker ${workerId}] Error ${modelId}:`, err.message)
        }
      }
      
      // Log progress after each model
      console.log(`[Worker ${workerId}] Model ${modelId} done (${completedOperations}/${totalOperations})`)
    }

    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null
    const avgVisibility = avg(allScores.visibility)
    const avgSentiment = avg(allScores.sentiment)
    const avgRanking = avg(allScores.ranking)

    let overallScore: number | null = null
    if (avgVisibility !== null && avgRanking !== null) {
      const scores = [avgVisibility, avgRanking]
      if (avgSentiment !== null) scores.push(avgSentiment)
      overallScore = avg(scores)
    }

    return {
      success: totalResults > 0,
      totalCostUsd,
      actualCostCents: totalCostCents,
      totalInputTokens,
      totalOutputTokens,
      totalResults,
      overallScore,
      avgVisibility,
      avgSentiment,
      avgRanking,
    }

  } catch (error: any) {
    return {
      success: false,
      error: 'Scan processing failed',
      totalCostUsd,
      actualCostCents: totalCostCents,
      totalInputTokens,
      totalOutputTokens,
      totalResults,
      overallScore: null,
      avgVisibility: null,
      avgSentiment: null,
      avgRanking: null,
    }
  }
}

async function markFailed(supabase: ReturnType<typeof createAdminClient>, id: string, error: string) {
  await supabase
    .from(TABLES.SCHEDULED_SCAN_HISTORY)
    .update({ status: 'failed', error_message: error, completed_at: new Date().toISOString() })
    .eq('id', id)
}

async function markSkipped(supabase: ReturnType<typeof createAdminClient>, id: string, reason: string) {
  await supabase
    .from(TABLES.SCHEDULED_SCAN_HISTORY)
    .update({ status: 'skipped', error_message: reason, completed_at: new Date().toISOString() })
    .eq('id', id)
}

async function triggerNext(
  supabase: ReturnType<typeof createAdminClient>,
  workerId: string,
  request: NextRequest,
  result?: any
) {
  // Check remaining
  const { count } = await supabase
    .from(TABLES.SCHEDULED_SCAN_HISTORY)
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')

  if (count && count > 0) {
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    
    // Fire and forget
    fetch(`${baseUrl}/api/cron/process-scan?worker=${workerId}`, {
      method: 'POST',
      headers: {
        'Authorization': request.headers.get('authorization') || '',
        'Content-Type': 'application/json'
      }
    }).catch(err => console.error(`[Worker ${workerId}] Next trigger failed:`, err.message))
  }

  return NextResponse.json({
    message: result?.processed ? 'Scan processed' : 'Done',
    worker: workerId,
    remaining: count || 0,
    ...result
  })
}
