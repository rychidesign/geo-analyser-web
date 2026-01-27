import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getProjectById, getProjectQueries } from '@/lib/db/projects'
import { getUserApiKeys } from '@/lib/db/settings'
import { runScan } from '@/lib/scan/engine'
import { AVAILABLE_MODELS, type LLMModel, type LLMProvider } from '@/lib/llm/types'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get project
    const project = await getProjectById(id)
    if (!project || project.user_id !== user.id) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Get queries
    const queries = await getProjectQueries(id)
    if (queries.length === 0) {
      return NextResponse.json({ 
        error: 'No test queries. Add some queries before running a scan.' 
      }, { status: 400 })
    }

    // Get selected models from project
    const selectedModels = (project.selected_models || ['gpt-5-mini']) as LLMModel[]
    if (selectedModels.length === 0) {
      return NextResponse.json({ 
        error: 'No AI models selected. Go to Project Settings to select models.' 
      }, { status: 400 })
    }

    // Get user's API keys
    const apiKeys = await getUserApiKeys(user.id)
    
    // Build list of models to use (only those with valid API keys)
    const modelsToUse: { model: LLMModel; provider: LLMProvider; apiKey: string }[] = []
    
    for (const modelId of selectedModels) {
      const modelInfo = AVAILABLE_MODELS.find(m => m.id === modelId)
      if (!modelInfo) continue
      
      const apiKeyField = `${modelInfo.provider}_api_key` as keyof typeof apiKeys
      const apiKey = apiKeys[apiKeyField]
      
      if (apiKey) {
        modelsToUse.push({
          model: modelId,
          provider: modelInfo.provider,
          apiKey: apiKey as string,
        })
      }
    }

    if (modelsToUse.length === 0) {
      return NextResponse.json({ 
        error: 'No API keys configured for the selected models. Go to Settings to add your LLM API keys.' 
      }, { status: 400 })
    }

    console.log(`Starting scan with ${modelsToUse.length} models:`, modelsToUse.map(m => `${m.provider}/${m.model}`))

    // Run scan with selected models
    const scan = await runScan({
      projectId: id,
      userId: user.id,
      queries,
      models: modelsToUse,
      project,
    })

    return NextResponse.json(scan)
  } catch (error: any) {
    console.error('Error running scan:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to run scan' }, 
      { status: 500 }
    )
  }
}
