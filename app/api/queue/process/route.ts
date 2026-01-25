import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runScan } from '@/lib/scan/engine'
import { getUserApiKeys } from '@/lib/db/settings'
import { getProviderForModel, AVAILABLE_MODELS, type LLMModel, type LLMProvider } from '@/lib/llm/types'

const TABLES = {
  SCAN_QUEUE: 'scan_queue',
  PROJECTS: 'projects',
  QUERIES: 'project_queries',
}

// POST - Process next item in queue
// Note: This endpoint is called by the cron job (/api/cron/process-queue) every minute
// It should NOT recursively trigger itself to avoid timeouts
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Optional: Verify this is called from cron or authorized source
    const authHeader = request.headers.get('authorization')
    const cookieHeader = request.headers.get('cookie')
    
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      // For manual testing, we can also check for authenticated user
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    // Get next pending item with highest priority
    const { data: queueItems, error: queueError } = await supabase
      .from(TABLES.SCAN_QUEUE)
      .select('*')
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)

    if (queueError) throw queueError

    if (!queueItems || queueItems.length === 0) {
      return NextResponse.json({ message: 'No pending items in queue' })
    }

    const queueItem = queueItems[0]
    console.log(`[Queue Process] Processing queue item ${queueItem.id} for project ${queueItem.project_id}`)

    // Mark as running
    const { error: updateError } = await supabase
      .from(TABLES.SCAN_QUEUE)
      .update({
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .eq('id', queueItem.id)

    if (updateError) {
      console.error('[Queue Process] Failed to mark as running:', updateError)
      throw updateError
    }

    // Get project details
    const { data: project, error: projectError } = await supabase
      .from(TABLES.PROJECTS)
      .select('*')
      .eq('id', queueItem.project_id)
      .single()

    if (projectError || !project) {
      console.error('[Queue Process] Project not found:', projectError)
      // Mark as failed
      await supabase
        .from(TABLES.SCAN_QUEUE)
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: 'Project not found',
        })
        .eq('id', queueItem.id)

      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    console.log(`[Queue Process] Project: ${project.name}`)

    // Get project queries
    const { data: queries, error: queriesError } = await supabase
      .from(TABLES.QUERIES)
      .select('*')
      .eq('project_id', project.id)

    if (queriesError) {
      console.error('[Queue Process] Failed to fetch queries:', queriesError)
      throw queriesError
    }

    console.log(`[Queue Process] Found ${queries?.length || 0} queries`)

    if (!queries || queries.length === 0) {
      console.warn('[Queue Process] No queries found for project')
      // Mark as failed
      await supabase
        .from(TABLES.SCAN_QUEUE)
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: 'No queries found for project',
        })
        .eq('id', queueItem.id)

      return NextResponse.json({ error: 'No queries found for project' }, { status: 400 })
    }

    // Get user's API keys (same as original scan route)
    const apiKeys = await getUserApiKeys(queueItem.user_id)
    console.log(`[Queue Process] Got API keys for providers:`, Object.keys(apiKeys).filter(k => apiKeys[k as keyof typeof apiKeys]))

    // Filter to only selected models that have API keys and build ModelConfig array
    const selectedModels = (project.selected_models || []) as LLMModel[]
    console.log(`[Queue Process] Selected models:`, selectedModels)

    const modelConfigs: { model: LLMModel; provider: LLMProvider; apiKey: string }[] = []
    
    for (const modelId of selectedModels) {
      const modelInfo = AVAILABLE_MODELS.find(m => m.id === modelId)
      if (!modelInfo) {
        console.warn(`[Queue Process] Unknown model: ${modelId}`)
        continue
      }
      
      const apiKeyField = `${modelInfo.provider}_api_key` as keyof typeof apiKeys
      const apiKey = apiKeys[apiKeyField]
      
      if (apiKey) {
        console.log(`[Queue Process] Found API key for ${modelId} (provider: ${modelInfo.provider})`)
        modelConfigs.push({
          model: modelId,
          provider: modelInfo.provider,
          apiKey: apiKey as string,
        })
      } else {
        console.warn(`[Queue Process] No API key for ${modelId} (provider: ${modelInfo.provider})`)
      }
    }

    console.log(`[Queue Process] Built ${modelConfigs.length} model configs`)

    if (modelConfigs.length === 0) {
      console.error('[Queue Process] No API keys configured for selected models')
      const errorMsg = 'No API keys configured for the selected models. Go to Settings to add your LLM API keys.'
      
      // Mark as failed
      await supabase
        .from(TABLES.SCAN_QUEUE)
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: errorMsg,
        })
        .eq('id', queueItem.id)

      return NextResponse.json(
        { error: errorMsg },
        { status: 400 }
      )
    }

    // Update progress total
    await supabase
      .from(TABLES.SCAN_QUEUE)
      .update({
        progress_total: queries.length * modelConfigs.length,
        progress_message: 'Starting scan...',
      })
      .eq('id', queueItem.id)

    // Run the scan
    try {
      const scanResult = await runScan({
        projectId: project.id,
        userId: queueItem.user_id,
        queries,
        project,
        models: modelConfigs,
        // Pass queue ID for progress updates
        queueId: queueItem.id,
      })

      // Mark as completed
      await supabase
        .from(TABLES.SCAN_QUEUE)
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          scan_id: scanResult.id,
          progress_message: 'Scan completed successfully',
        })
        .eq('id', queueItem.id)

      console.log('[Queue Process] Scan completed successfully')
      
      // Note: Cron job will pick up next pending item automatically

      return NextResponse.json({
        success: true,
        queueId: queueItem.id,
        scanId: scanResult.id,
      })
    } catch (scanError: any) {
      console.error('Scan execution error:', scanError)

      // Mark as failed
      await supabase
        .from(TABLES.SCAN_QUEUE)
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: scanError.message || 'Scan execution failed',
        })
        .eq('id', queueItem.id)

      // Note: Cron job will pick up next pending item automatically
      console.log('[Queue Process] Scan failed, cron will process next item')

      throw scanError
    }
  } catch (error: any) {
    console.error('Queue process error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process queue' },
      { status: 500 }
    )
  }
}
