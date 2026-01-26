import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calculateCost } from '@/lib/llm'
import { TABLES, type ScanMetrics } from '@/lib/db/schema'
import type { LLMModel } from '@/lib/llm/types'

export const runtime = 'edge'
export const maxDuration = 10

/**
 * Fast endpoint to save a single scan result
 * Frontend calls this after getting LLM response
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const {
      scanId,
      model,
      query,
      response,
      inputTokens,
      outputTokens,
      metrics,
    } = await request.json()

    if (!scanId || !model || !query || !response) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Calculate cost
    const cost = calculateCost(model as LLMModel, inputTokens, outputTokens)

    // Import model info
    const { AVAILABLE_MODELS } = await import('@/lib/llm/types')
    const modelInfo = AVAILABLE_MODELS.find(m => m.id === model)
    
    if (!modelInfo) {
      return NextResponse.json({ error: `Unknown model: ${model}` }, { status: 400 })
    }

    // Save result
    const { data: result, error: saveError } = await supabase
      .from(TABLES.SCAN_RESULTS)
      .insert({
        scan_id: scanId,
        provider: modelInfo.provider,
        model: model,
        query_text: query,
        ai_response_raw: response,
        metrics_json: metrics,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: cost,
      })
      .select()
      .single()

    if (saveError) {
      console.error('[Save Result] DB error:', saveError)
      return NextResponse.json({ error: 'Failed to save result' }, { status: 500 })
    }

    // Update scan totals
    const { data: scan } = await supabase
      .from(TABLES.SCANS)
      .select('total_cost_usd, total_input_tokens, total_output_tokens, total_results')
      .eq('id', scanId)
      .single()

    if (scan) {
      await supabase
        .from(TABLES.SCANS)
        .update({
          total_cost_usd: (scan.total_cost_usd || 0) + cost,
          total_input_tokens: (scan.total_input_tokens || 0) + inputTokens,
          total_output_tokens: (scan.total_output_tokens || 0) + outputTokens,
          total_results: (scan.total_results || 0) + 1,
        })
        .eq('id', scanId)
    }

    console.log(`[Save Result] Saved result for scan ${scanId}, model ${model}`)

    return NextResponse.json({ success: true, resultId: result.id })
  } catch (error: any) {
    console.error('[Save Result] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to save result' },
      { status: 500 }
    )
  }
}
