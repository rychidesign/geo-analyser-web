import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getModelsForUser } from '@/lib/credits/middleware'
import { AVAILABLE_MODELS, type ModelInfo } from '@/lib/ai'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get available models for user from database pricing config
    const { models: dbModels, allModels, isLimited } = await getModelsForUser(user.id)
    
    // Merge with static model info from AI module for additional metadata
    const modelsWithInfo = dbModels.map(dbModel => {
      const staticInfo = AVAILABLE_MODELS.find(m => m.id === dbModel.model)
      return {
        id: dbModel.model,
        provider: dbModel.provider,
        name: staticInfo?.name || dbModel.model,
        description: staticInfo?.description || '',
        contextWindow: staticInfo?.contextWindow || 0,
        // Pricing with markup (what user pays)
        pricing: {
          inputPer1M: dbModel.final_input_cost_cents / 100, // USD per 1M tokens
          outputPer1M: dbModel.final_output_cost_cents / 100,
        },
        availableFreeTier: dbModel.available_free_tier,
        isActive: dbModel.is_active,
      }
    })

    // Group by provider
    const byProvider = modelsWithInfo.reduce((acc, model) => {
      if (!acc[model.provider]) {
        acc[model.provider] = []
      }
      acc[model.provider].push(model)
      return acc
    }, {} as Record<string, typeof modelsWithInfo>)

    return NextResponse.json({
      models: modelsWithInfo,
      byProvider,
      isLimited,
      totalAvailable: modelsWithInfo.length,
      totalAll: allModels.length,
    })
  } catch (error: any) {
    console.error('[Models API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch models' },
      { status: 500 }
    )
  }
}
