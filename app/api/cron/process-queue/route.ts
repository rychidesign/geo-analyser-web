import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TABLES } from '@/lib/db/schema'
import { getPricingConfigs, estimateScanCost, createReservation, consumeReservation, releaseReservation } from '@/lib/credits'
import { AVAILABLE_MODELS } from '@/lib/ai/providers'
import { callGEOQuery, callEvaluation, getCheapestEvaluationModel, getModelInfo } from '@/lib/ai'
import { calculateDynamicCost } from '@/lib/credits'

/**
 * PROCESS QUEUE WORKER
 * 
 * Processes scans from the scan_queue table (manual scans initiated by users).
 * This runs on the server and continues even if the user closes their browser.
 * 
 * Can be triggered by:
 * - POST from the queue endpoint when a new scan is added
 * - GET from Vercel cron as a backup scheduler
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

export async function GET(request: NextRequest) {
  return handleProcessQueue(request)
}

export async function POST(request: NextRequest) {
  return handleProcessQueue(request)
}

async function handleProcessQueue(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const startTime = Date.now()
  const workerId = `queue-${Date.now().toString(36)}`

  try {
    // Try atomic claim using RPC function first
    const { data: claimedRpc, error: rpcError } = await supabase.rpc('claim_pending_queue_scan')
    
    let claimed: QueueItem | null = null
    
    if (rpcError || !claimedRpc || claimedRpc.length === 0) {
      // Fallback: Use optimistic update (less safe but works without migration)
      console.log(`[Worker ${workerId}] RPC claim failed, using fallback method`)
      
      const { data: fallbackClaimed, error: fallbackError } = await supabase
        .from('scan_queue')
        .update({ 
          status: 'running',
          started_at: new Date().toISOString(),
          progress_message: 'Starting scan...'
        })
        .eq('status', 'pending')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(1)
        .select()
        .single()
      
      if (fallbackError || !fallbackClaimed) {
        console.log(`[Worker ${workerId}] No pending scans in queue`)
        return NextResponse.json({ 
          message: 'Queue empty', 
          worker: workerId,
          processed: 0 
        })
      }
      
      claimed = fallbackClaimed as QueueItem
    } else {
      // Get full queue item details
      const claimedItem = claimedRpc[0]
      const { data: fullItem } = await supabase
        .from('scan_queue')
        .select('*')
        .eq('id', claimedItem.id)
        .single()
      
      claimed = fullItem as QueueItem
    }
    
    if (!claimed) {
      console.log(`[Worker ${workerId}] No pending scans in queue`)
      return NextResponse.json({ 
        message: 'Queue empty', 
        worker: workerId,
        processed: 0 
      })
    }

    console.log(`[Worker ${workerId}] Claimed queue item ${claimed.id} for project ${claimed.project_id}`)

    // Process the claimed scan
    const result = await processQueueItem(supabase, claimed, workerId)

    // Trigger next worker if there are more items
    const { count } = await supabase
      .from('scan_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')

    if (count && count > 0) {
      triggerNextWorker(request)
    }

    const duration = Date.now() - startTime
    console.log(`[Worker ${workerId}] Completed in ${Math.round(duration/1000)}s`)

    return NextResponse.json({
      message: 'Scan processed',
      worker: workerId,
      queueId: claimed.id,
      scanId: result.scanId,
      success: result.success,
      results: result.totalResults,
      remaining: count || 0,
      duration
    })

  } catch (error: any) {
    console.error(`[Worker ${workerId}] Fatal error:`, error)
    return NextResponse.json({ error: error.message, worker: workerId }, { status: 500 })
  }
}

interface QueueItem {
  id: string
  user_id: string
  project_id: string
  status: string
  priority: number
  progress_current: number
  progress_total: number
}

async function processQueueItem(
  supabase: ReturnType<typeof createAdminClient>,
  queueItem: QueueItem,
  workerId: string
) {
  // Get project details
  const { data: project, error: projectError } = await supabase
    .from(TABLES.PROJECTS)
    .select('*')
    .eq('id', queueItem.project_id)
    .single()

  if (projectError || !project) {
    await markQueueFailed(supabase, queueItem.id, 'Project not found')
    return { success: false, scanId: null, totalResults: 0 }
  }

  console.log(`[Worker ${workerId}] Processing project: ${project.name}`)

  // Get user profile
  const { data: profile } = await supabase
    .from(TABLES.USER_PROFILES)
    .select('*')
    .eq('user_id', queueItem.user_id)
    .single()

  if (!profile) {
    await markQueueFailed(supabase, queueItem.id, 'User profile not found')
    return { success: false, scanId: null, totalResults: 0 }
  }

  // Check credits for paid users
  if (profile.tier === 'paid' && profile.credit_balance_cents <= 0) {
    await markQueueFailed(supabase, queueItem.id, 'Insufficient credits')
    return { success: false, scanId: null, totalResults: 0 }
  }

  // Get active queries
  const { data: queries } = await supabase
    .from(TABLES.PROJECT_QUERIES)
    .select('*')
    .eq('project_id', project.id)
    .eq('is_active', true)

  if (!queries || queries.length === 0) {
    await markQueueFailed(supabase, queueItem.id, 'No active queries')
    return { success: false, scanId: null, totalResults: 0 }
  }

  // Filter models
  const availableModelIds = AVAILABLE_MODELS.filter(m => m.isActive).map(m => m.id)
  const selectedModels = (project.selected_models || []).filter((m: string) => availableModelIds.includes(m))

  if (selectedModels.length === 0) {
    await markQueueFailed(supabase, queueItem.id, 'No valid models selected')
    return { success: false, scanId: null, totalResults: 0 }
  }

  // Create credit reservation for paid users
  let reservationId: string | undefined
  if (profile.tier === 'paid') {
    const pricing = await getPricingConfigs()
    const estimatedCostCents = estimateScanCost(pricing, selectedModels, queries.length)
    const reservationAmount = Math.ceil(estimatedCostCents * 1.2)

    const reserveResult = await createReservation(queueItem.user_id, reservationAmount, project.id)
    if (!reserveResult.success) {
      await markQueueFailed(supabase, queueItem.id, 'Credit reservation failed')
      return { success: false, scanId: null, totalResults: 0 }
    }
    reservationId = reserveResult.reservationId
  }

  // Create scan record
  const { data: scan, error: scanError } = await supabase
    .from(TABLES.SCANS)
    .insert({
      project_id: project.id,
      user_id: queueItem.user_id,
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
      await releaseReservation(reservationId, 'Scan creation failed')
    }
    await markQueueFailed(supabase, queueItem.id, 'Failed to create scan')
    return { success: false, scanId: null, totalResults: 0 }
  }

  // Link scan to queue item
  await supabase
    .from('scan_queue')
    .update({ scan_id: scan.id })
    .eq('id', queueItem.id)

  console.log(`[Worker ${workerId}] Created scan ${scan.id}: ${queries.length} queries × ${selectedModels.length} models`)

  // Process the scan
  const result = await processScan(supabase, queueItem.id, scan.id, project, queries, selectedModels, workerId)

  // Complete reservation
  if (reservationId && !['free-tier', 'test-account', 'admin-account'].includes(reservationId)) {
    await consumeReservation(reservationId, result.actualCostCents, scan.id)
  }

  // Update scan record
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

  // Update queue item
  await supabase
    .from('scan_queue')
    .update({
      status: result.success ? 'completed' : 'failed',
      error_message: result.error || null,
      completed_at: new Date().toISOString(),
      progress_current: result.totalResults,
      progress_message: result.success ? 'Scan completed' : `Failed: ${result.error}`
    })
    .eq('id', queueItem.id)

  return {
    success: result.success,
    scanId: scan.id,
    totalResults: result.totalResults
  }
}

async function processScan(
  supabase: ReturnType<typeof createAdminClient>,
  queueId: string,
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
        // Check if scan was cancelled
        const { data: queueStatus } = await supabase
          .from('scan_queue')
          .select('status')
          .eq('id', queueId)
          .single()
        
        if (queueStatus?.status === 'cancelled') {
          console.log(`[Worker ${workerId}] Scan cancelled by user`)
          return {
            success: false,
            error: 'Cancelled by user',
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

        // Update progress
        await supabase
          .from('scan_queue')
          .update({
            progress_current: completedOperations,
            progress_total: totalOperations,
            progress_message: `Processing ${modelId}... (${completedOperations + 1}/${totalOperations})`
          })
          .eq('id', queueId)

        try {
          const response = await callGEOQuery(modelId, query.query_text, project.language || 'en')
          completedOperations++
          
          if (!response.content) {
            console.log(`[Worker ${workerId}] Empty response from ${modelId}`)
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
            console.log(`[Worker ${workerId}] Unknown model: ${modelId}`)
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
      error: error.message,
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

async function markQueueFailed(supabase: ReturnType<typeof createAdminClient>, id: string, error: string) {
  await supabase
    .from('scan_queue')
    .update({ 
      status: 'failed', 
      error_message: error, 
      completed_at: new Date().toISOString(),
      progress_message: `Failed: ${error}`
    })
    .eq('id', id)
}

function triggerNextWorker(request: NextRequest) {
  try {
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    
    fetch(`${baseUrl}/api/cron/process-queue`, {
      method: 'POST',
      headers: {
        'Authorization': request.headers.get('authorization') || '',
        'Content-Type': 'application/json'
      }
    }).catch(err => console.error('[Worker] Next trigger failed:', err.message))
  } catch (error) {
    console.warn('[Worker] Failed to trigger next:', error)
  }
}
