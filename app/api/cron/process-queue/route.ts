import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { runScan } from '@/lib/scan/engine'
import { getUserApiKeys } from '@/lib/db/settings'
import { getProviderForModel, AVAILABLE_MODELS, type LLMModel, type LLMProvider } from '@/lib/llm/types'
import { TABLES } from '@/lib/db/schema'

// Use service role for cron jobs (bypasses RLS)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes max for Vercel Pro

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[Cron] Processing scan queue...')

  try {
    // --- Step 1: Reset stuck 'running' scans ---
    const stuckThreshold = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago
    const progressStuckThreshold = new Date(Date.now() - 15 * 60 * 1000).toISOString(); // 15 minutes ago

    const { data: stuckScans, error: stuckError } = await supabase
      .from(TABLES.SCAN_QUEUE)
      .select('id, status, updated_at, progress_current, progress_total, started_at')
      .eq('status', 'running')
      .or(`started_at.lt.${stuckThreshold},and(progress_current.eq.0,started_at.lt.${stuckThreshold}),and(progress_current.gt.0,updated_at.lt.${progressStuckThreshold})`)
      .limit(10); // Limit to avoid processing too many at once

    if (stuckError) {
      console.error('[Cron] Error fetching stuck scans:', stuckError);
      throw stuckError;
    }

    if (stuckScans && stuckScans.length > 0) {
      console.warn(`[Cron] Found ${stuckScans.length} potentially stuck scans. Resetting...`);
      for (const scan of stuckScans) {
        console.log(`[Cron] Resetting stuck scan ${scan.id}. Status: ${scan.status}, Updated: ${scan.updated_at}, Progress: ${scan.progress_current}/${scan.progress_total}`);
        await supabase
          .from(TABLES.SCAN_QUEUE)
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_message: 'Scan stuck or timed out (auto-reset)',
            updated_at: new Date().toISOString(),
          })
          .eq('id', scan.id);
      }
    }

    // --- Step 2: Check if there's already a running scan ---
    const { data: runningScans, error: runningError } = await supabase
      .from(TABLES.SCAN_QUEUE)
      .select('id')
      .eq('status', 'running')
      .limit(1)

    if (runningError) {
      console.error('[Cron] Error checking running scans:', runningError)
      throw runningError
    }

    if (runningScans && runningScans.length > 0) {
      console.log('[Cron] A scan is already running, skipping this run')
      return NextResponse.json({ message: 'Scan already running' })
    }

    // --- Step 3: Process next pending item ---
    const { data: queueItem, error: queueError } = await supabase
      .from(TABLES.SCAN_QUEUE)
      .select('*')
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .single()

    if (queueError && queueError.code !== 'PGRST116') throw queueError // PGRST116 means no rows found

    if (!queueItem) {
      console.log('[Cron] No pending items in queue.')
      return NextResponse.json({ message: 'No pending items in queue' })
    }

    console.log(`[Cron] Processing queue item: ${queueItem.id} for project ${queueItem.project_id}`)

    // Mark as running
    await supabase
      .from(TABLES.SCAN_QUEUE)
      .update({ 
        status: 'running', 
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', queueItem.id)

    // Fetch project details and queries
    const { data: project, error: projectError } = await supabase
      .from(TABLES.PROJECTS)
      .select('*')
      .eq('id', queueItem.project_id)
      .single()

    if (projectError || !project) {
      throw new Error(`Project ${queueItem.project_id} not found: ${projectError?.message}`)
    }

    const { data: queries, error: queriesError } = await supabase
      .from(TABLES.QUERIES)
      .select('*')
      .eq('project_id', queueItem.project_id)
      .eq('is_active', true)

    if (queriesError) throw queriesError

    if (!queries || queries.length === 0) {
      throw new Error(`No active queries found for project ${queueItem.project_id}`)
    }

    // Get user's API keys
    const userApiKeys = await getUserApiKeys(queueItem.user_id)
    if (!userApiKeys) {
      throw new Error('No API keys configured for user')
    }

    // Filter models based on available API keys
    const selectedModels: LLMModel[] = (project.selected_models || []) as LLMModel[]

    const modelConfigs: { model: LLMModel; provider: LLMProvider; apiKey: string }[] = []
    
    for (const modelId of selectedModels) {
      const modelInfo = AVAILABLE_MODELS.find(m => m.id === modelId)
      if (!modelInfo) {
        console.warn(`[Cron] Unknown model: ${modelId}`)
        continue
      }
      
      const apiKeyField = `${modelInfo.provider}_api_key` as keyof typeof userApiKeys
      const apiKey = userApiKeys[apiKeyField]
      
      if (apiKey) {
        modelConfigs.push({
          model: modelId,
          provider: modelInfo.provider,
          apiKey: apiKey as string,
        })
      } else {
        console.warn(`[Cron] No API key for ${modelId} (provider: ${modelInfo.provider})`)
      }
    }

    if (modelConfigs.length === 0) {
      throw new Error('No API keys configured for the selected models. Go to Settings to add your LLM API keys.')
    }

    console.log(`[Cron] Running scan for project ${project.name} with ${queries.length} queries and ${modelConfigs.length} models.`)

    // Update progress total
    await supabase
      .from(TABLES.SCAN_QUEUE)
      .update({
        progress_total: queries.length * modelConfigs.length,
        progress_message: 'Starting scan...',
        updated_at: new Date().toISOString(),
      })
      .eq('id', queueItem.id)

    // Execute the scan
    const scanResult = await runScan({
      projectId: project.id,
      userId: queueItem.user_id,
      queries,
      project,
      models: modelConfigs,
      queueId: queueItem.id, // Pass queueId for progress updates
    })

    // Mark as completed
    await supabase
      .from(TABLES.SCAN_QUEUE)
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        scan_id: scanResult.id,
        progress_current: queries.length * modelConfigs.length,
        progress_total: queries.length * modelConfigs.length,
        progress_message: 'Scan completed successfully',
        updated_at: new Date().toISOString(),
      })
      .eq('id', queueItem.id)

    console.log(`[Cron] Scan ${scanResult.id} completed for queue item ${queueItem.id}`)

    return NextResponse.json({
      success: true,
      queueId: queueItem.id,
      scanId: scanResult.id,
    })
  } catch (error: any) {
    console.error('[Cron] Queue process error:', error)

    // Try to mark the failed item if we know which one it is
    // Look for queue item ID in error context (if available)
    try {
      const { data: runningItems } = await supabase
        .from(TABLES.SCAN_QUEUE)
        .select('id')
        .eq('status', 'running')
        .limit(1)

      if (runningItems && runningItems.length > 0) {
        const queueId = runningItems[0].id
        await supabase
          .from(TABLES.SCAN_QUEUE)
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_message: error.message || 'Scan execution failed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', queueId)
      }
    } catch (updateError) {
      console.error('[Cron] Failed to update failed scan status:', updateError)
    }

    return NextResponse.json(
      { error: error.message || 'Failed to process queue' },
      { status: 500 }
    )
  }
}
