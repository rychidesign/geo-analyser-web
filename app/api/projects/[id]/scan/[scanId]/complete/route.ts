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
    let overallScore = 0
    let avgVisibility = 0
    let avgSentiment = 50 // Default neutral
    let avgCitation = 0
    let avgRanking = 0
    let validResults = 0

    if (results && results.length > 0) {
      for (const result of results) {
        if (result.metrics_json) {
          const metrics = result.metrics_json as any
          avgVisibility += metrics.visibility_score || 0
          avgSentiment += (metrics.sentiment_score || 50) - 50 // Adjust for averaging
          avgCitation += metrics.citation_score || 0
          avgRanking += metrics.ranking_score || 0
          overallScore += metrics.recommendation_score || 0
          validResults++
        }
      }

      if (validResults > 0) {
        avgVisibility = Math.round(avgVisibility / validResults)
        avgSentiment = Math.round(50 + (avgSentiment / validResults)) // Restore to 0-100 scale
        avgCitation = Math.round(avgCitation / validResults)
        avgRanking = Math.round(avgRanking / validResults)
        overallScore = Math.round(overallScore / validResults)
      }
    }

    // Update scan status and metrics
    const { error: updateError } = await supabase
      .from(TABLES.SCANS)
      .update({
        status: 'completed',
        overall_score: overallScore,
        avg_visibility: avgVisibility,
        avg_sentiment: avgSentiment,
        avg_citation: avgCitation,
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
    
    // Get distinct provider/model combinations from results
    const { data: distinctModels } = await supabase
      .from(TABLES.SCAN_RESULTS)
      .select('provider, model')
      .eq('scan_id', scanId)

    if (distinctModels) {
      const uniqueModels = new Map<string, { provider: string; model: string }>()
      for (const m of distinctModels) {
        const key = `${m.provider}:${m.model}`
        if (!uniqueModels.has(key)) {
          uniqueModels.set(key, m)
        }
      }

      // Increment scan_count for each unique model
      for (const { provider, model } of uniqueModels.values()) {
        const { data: existing } = await supabase
          .from(TABLES.MONTHLY_USAGE)
          .select('id, scan_count')
          .eq('user_id', user.id)
          .eq('month', month)
          .eq('provider', provider)
          .eq('model', model)
          .eq('usage_type', 'scan')
          .single()

        if (existing) {
          await supabase
            .from(TABLES.MONTHLY_USAGE)
            .update({ scan_count: (existing.scan_count || 0) + 1 })
            .eq('id', existing.id)
        }
      }
    }

    console.log(`[Complete Scan] Scan ${scanId} marked as completed with score ${overallScore}%`)

    return NextResponse.json({ 
      success: true,
      metrics: {
        overallScore,
        avgVisibility,
        avgSentiment,
        avgCitation,
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
