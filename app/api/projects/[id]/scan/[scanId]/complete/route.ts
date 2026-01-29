import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TABLES } from '@/lib/db/schema'

export const runtime = 'edge'
export const maxDuration = 10

/**
 * Mark scan as completed and calculate final metrics
 */
export async function POST(
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

    // Verify scan ownership
    const { data: scan } = await supabase
      .from(TABLES.SCANS)
      .select('id, status')
      .eq('id', scanId)
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .single()

    if (!scan) {
      return NextResponse.json({ error: 'Scan not found' }, { status: 404 })
    }

    // Get all results for this scan to calculate metrics
    const { data: results } = await supabase
      .from(TABLES.SCAN_RESULTS)
      .select('metrics_json')
      .eq('scan_id', scanId)

    // Calculate aggregated metrics
    let totalVisibility = 0
    let totalSentiment = 0
    let sentimentCount = 0  // Only count when visibility > 0
    let totalRanking = 0
    let rankingCount = 0    // Only count when ranking > 0 (brand in list)
    let totalRecommendation = 0
    let validResults = 0

    if (results && results.length > 0) {
      for (const result of results) {
        if (result.metrics_json) {
          const metrics = result.metrics_json as any
          totalVisibility += metrics.visibility_score || 0
          totalRecommendation += metrics.recommendation_score || 0
          validResults++
          
          // Only include sentiment when visibility > 0
          if ((metrics.visibility_score || 0) > 0 && metrics.sentiment_score !== null && metrics.sentiment_score !== undefined) {
            totalSentiment += metrics.sentiment_score
            sentimentCount++
          }
          
          // Only include ranking when brand is actually in a list (ranking > 0)
          if ((metrics.visibility_score || 0) > 0 && (metrics.ranking_score || 0) > 0) {
            totalRanking += metrics.ranking_score
            rankingCount++
          }
        }
      }
    }

    // Calculate final averages
    const avgVisibility = validResults > 0 ? Math.round(totalVisibility / validResults) : 0
    const avgSentiment = sentimentCount > 0 ? Math.round(totalSentiment / sentimentCount) : null
    const avgRanking = rankingCount > 0 ? Math.round(totalRanking / rankingCount) : null
    const overallScore = validResults > 0 ? Math.round(totalRecommendation / validResults) : 0

    // Update scan status and metrics
    const { error: updateError } = await supabase
      .from(TABLES.SCANS)
      .update({
        status: 'completed',
        overall_score: overallScore,
        avg_visibility: avgVisibility,
        avg_sentiment: avgSentiment,
        avg_ranking: avgRanking,
        completed_at: new Date().toISOString(),
      })
      .eq('id', scanId)

    if (updateError) {
      console.error('[Complete Scan] Error:', updateError)
      return NextResponse.json({ error: 'Failed to complete scan' }, { status: 500 })
    }

    // Increment scan_count in monthly_usage for all models used
    const month = new Date().toISOString().slice(0, 7)
    
    // Get distinct provider/model combinations from results with token/cost data
    const { data: distinctModels } = await supabase
      .from(TABLES.SCAN_RESULTS)
      .select('provider, model, input_tokens, output_tokens, cost_usd')
      .eq('scan_id', scanId)

    if (distinctModels) {
      // Aggregate totals per model
      const modelAggregates = new Map<string, { 
        provider: string
        model: string
        totalInputTokens: number
        totalOutputTokens: number
        totalCost: number
      }>()
      
      for (const m of distinctModels) {
        const key = `${m.provider}:${m.model}`
        const existing = modelAggregates.get(key)
        if (existing) {
          existing.totalInputTokens += m.input_tokens || 0
          existing.totalOutputTokens += m.output_tokens || 0
          existing.totalCost += m.cost_usd || 0
        } else {
          modelAggregates.set(key, {
            provider: m.provider,
            model: m.model,
            totalInputTokens: m.input_tokens || 0,
            totalOutputTokens: m.output_tokens || 0,
            totalCost: m.cost_usd || 0,
          })
        }
      }

      // Increment scan_count for each unique model
      for (const { provider, model, totalInputTokens, totalOutputTokens, totalCost } of modelAggregates.values()) {
        const { data: existing, error: selectError } = await supabase
          .from(TABLES.MONTHLY_USAGE)
          .select('id, scan_count')
          .eq('user_id', user.id)
          .eq('month', month)
          .eq('provider', provider)
          .eq('model', model)
          .eq('usage_type', 'scan')
          .single()

        if (existing) {
          // Update existing record
          const { error: updateUsageError } = await supabase
            .from(TABLES.MONTHLY_USAGE)
            .update({ scan_count: (existing.scan_count || 0) + 1 })
            .eq('id', existing.id)
          
          if (updateUsageError) {
            console.error(`[Complete Scan] Failed to update scan_count for ${provider}/${model}:`, updateUsageError)
          }
        } else if (selectError?.code === 'PGRST116') {
          // FIX: Only create new record when specifically receiving PGRST116 (no rows returned)
          // This handles the case where results were saved but monthly_usage wasn't created
          const { error: insertError } = await supabase
            .from(TABLES.MONTHLY_USAGE)
            .insert({
              user_id: user.id,
              month,
              provider,
              model,
              usage_type: 'scan',
              total_input_tokens: totalInputTokens,
              total_output_tokens: totalOutputTokens,
              total_cost_usd: totalCost,
              scan_count: 1,
            })
          
          if (insertError) {
            console.error(`[Complete Scan] Failed to create monthly_usage for ${provider}/${model}:`, insertError)
          }
        } else if (selectError) {
          // Unexpected error (not PGRST116)
          console.error(`[Complete Scan] Failed to check monthly_usage for ${provider}/${model}:`, selectError)
        }
        // Note: If existing is null and there's no error, something unexpected happened
        // with Supabase's .single() - this shouldn't occur normally
      }
    }

    console.log(`[Complete Scan] Scan ${scanId} marked as completed with score ${overallScore}%`)

    return NextResponse.json({ 
      success: true,
      metrics: {
        overallScore,
        avgVisibility,
        avgSentiment,
        avgRanking,
      }
    })
  } catch (error: any) {
    console.error('[Complete Scan] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to complete scan' },
      { status: 500 }
    )
  }
}
