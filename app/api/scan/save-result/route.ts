import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calculateCost } from '@/lib/llm'
import { TABLES, type ScanMetrics } from '@/lib/db/schema'
import type { LLMModel } from '@/lib/llm/types'

export const runtime = 'edge'
export const maxDuration = 10

/**
 * Fast endpoint to save a single scan result and update monthly usage
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
      const { error: scanUpdateError } = await supabase
        .from(TABLES.SCANS)
        .update({
          total_cost_usd: (scan.total_cost_usd || 0) + cost,
          total_input_tokens: (scan.total_input_tokens || 0) + inputTokens,
          total_output_tokens: (scan.total_output_tokens || 0) + outputTokens,
          total_results: (scan.total_results || 0) + 1,
        })
        .eq('id', scanId)
      
      if (scanUpdateError) {
        console.error('[Save Result] Failed to update scan totals:', scanUpdateError)
        // Continue - scan result was saved successfully
      }
    }

    // Update monthly usage for cost tracking
    const month = new Date().toISOString().slice(0, 7) // Format: '2026-01'
    
    // Try to get existing record
    const { data: existingUsage, error: usageSelectError } = await supabase
      .from(TABLES.MONTHLY_USAGE)
      .select('*')
      .eq('user_id', user.id)
      .eq('month', month)
      .eq('provider', modelInfo.provider)
      .eq('model', model)
      .eq('usage_type', 'scan')
      .single()

    if (existingUsage) {
      // Update existing record
      const { error: usageUpdateError } = await supabase
        .from(TABLES.MONTHLY_USAGE)
        .update({
          total_input_tokens: existingUsage.total_input_tokens + inputTokens,
          total_output_tokens: existingUsage.total_output_tokens + outputTokens,
          total_cost_usd: existingUsage.total_cost_usd + cost,
        })
        .eq('id', existingUsage.id)
      
      if (usageUpdateError) {
        console.error('[Save Result] Failed to update monthly usage:', usageUpdateError)
        return NextResponse.json({ 
          error: 'Result saved but failed to update usage statistics',
          resultId: result.id,
          cost 
        }, { status: 500 })
      }
    } else if (usageSelectError?.code === 'PGRST116') {
      // FIX: Only create new record when specifically receiving PGRST116 (no rows returned)
      // This is the only valid case for inserting - when .single() found no matching rows
      const { error: usageInsertError } = await supabase
        .from(TABLES.MONTHLY_USAGE)
        .insert({
          user_id: user.id,
          month,
          provider: modelInfo.provider,
          model,
          usage_type: 'scan',
          total_input_tokens: inputTokens,
          total_output_tokens: outputTokens,
          total_cost_usd: cost,
          scan_count: 0, // Will be incremented when scan completes
        })
      
      if (usageInsertError) {
        console.error('[Save Result] Failed to create monthly usage:', usageInsertError)
        return NextResponse.json({ 
          error: 'Result saved but failed to create usage statistics',
          resultId: result.id,
          cost 
        }, { status: 500 })
      }
    } else if (usageSelectError) {
      // Unexpected error from select (not PGRST116)
      console.error('[Save Result] Failed to check monthly usage:', usageSelectError)
      return NextResponse.json({ 
        error: 'Result saved but failed to check usage statistics',
        resultId: result.id,
        cost 
      }, { status: 500 })
    }
    // Note: If existingUsage is null and there's no error, something unexpected happened
    // with Supabase's .single() - this shouldn't occur normally, but we don't crash

    console.log(`[Save Result] Saved result for scan ${scanId}, model ${model}, cost: $${cost.toFixed(6)}`)

    return NextResponse.json({ success: true, resultId: result.id, cost })
  } catch (error: any) {
    console.error('[Save Result] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to save result' },
      { status: 500 }
    )
  }
}
