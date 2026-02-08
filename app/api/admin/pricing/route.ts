import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { safeErrorMessage } from '@/lib/api-error'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/pricing - Get all pricing configs (admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check admin
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('tier')
      .eq('user_id', user.id)
      .single()
    
    if (profile?.tier !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    // Fetch all pricing configs with calculated final costs
    const { data: pricing, error } = await supabase
      .from('pricing_config')
      .select('*')
      .order('provider', { ascending: true })
      .order('model', { ascending: true })

    if (error) throw error

    // Calculate final prices for each model
    const pricingWithFinal = pricing?.map(p => ({
      ...p,
      final_input_cost_cents: Math.round(p.base_input_cost_cents * (1 + p.markup_percentage / 100)),
      final_output_cost_cents: Math.round(p.base_output_cost_cents * (1 + p.markup_percentage / 100)),
    })) || []

    return NextResponse.json({ pricing: pricingWithFinal })
  } catch (error: unknown) {
    console.error('[Admin Pricing API] Error:', error)
    return NextResponse.json(
      { error: safeErrorMessage(error, 'Failed to fetch pricing') },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/admin/pricing - Update pricing config (admin only)
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check admin
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('tier')
      .eq('user_id', user.id)
      .single()
    
    if (profile?.tier !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { id, base_input_cost_cents, base_output_cost_cents, markup_percentage, is_active, available_free_tier } = body

    if (!id) {
      return NextResponse.json({ error: 'Missing pricing id' }, { status: 400 })
    }

    // Build update object with only provided fields
    const updates: Record<string, any> = {
      prices_updated_at: new Date().toISOString(),
    }

    if (base_input_cost_cents !== undefined) {
      updates.base_input_cost_cents = Math.round(base_input_cost_cents)
    }
    if (base_output_cost_cents !== undefined) {
      updates.base_output_cost_cents = Math.round(base_output_cost_cents)
    }
    if (markup_percentage !== undefined) {
      updates.markup_percentage = Math.round(markup_percentage)
    }
    if (is_active !== undefined) {
      updates.is_active = is_active
    }
    if (available_free_tier !== undefined) {
      updates.available_free_tier = available_free_tier
    }

    // Update pricing
    const { data, error } = await supabase
      .from('pricing_config')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    console.log(`[Admin Pricing] Updated pricing for model ${data.model}:`, updates)

    return NextResponse.json({ 
      success: true, 
      pricing: {
        ...data,
        final_input_cost_cents: Math.round(data.base_input_cost_cents * (1 + data.markup_percentage / 100)),
        final_output_cost_cents: Math.round(data.base_output_cost_cents * (1 + data.markup_percentage / 100)),
      }
    })
  } catch (error: unknown) {
    console.error('[Admin Pricing API] Error:', error)
    return NextResponse.json(
      { error: safeErrorMessage(error, 'Failed to update pricing') },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/pricing - Add new model pricing (admin only)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check admin
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('tier')
      .eq('user_id', user.id)
      .single()
    
    if (profile?.tier !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { provider, model, base_input_cost_cents, base_output_cost_cents, markup_percentage = 200, is_active = true, available_free_tier = false } = body

    if (!provider || !model) {
      return NextResponse.json({ error: 'Missing provider or model' }, { status: 400 })
    }

    // Insert new pricing
    const { data, error } = await supabase
      .from('pricing_config')
      .insert({
        provider,
        model,
        base_input_cost_cents: Math.round(base_input_cost_cents || 0),
        base_output_cost_cents: Math.round(base_output_cost_cents || 0),
        markup_percentage: Math.round(markup_percentage),
        is_active,
        available_free_tier,
      })
      .select()
      .single()

    if (error) throw error

    console.log(`[Admin Pricing] Created pricing for model ${model}`)

    return NextResponse.json({ 
      success: true, 
      pricing: {
        ...data,
        final_input_cost_cents: Math.round(data.base_input_cost_cents * (1 + data.markup_percentage / 100)),
        final_output_cost_cents: Math.round(data.base_output_cost_cents * (1 + data.markup_percentage / 100)),
      }
    })
  } catch (error: unknown) {
    console.error('[Admin Pricing API] Error:', error)
    return NextResponse.json(
      { error: safeErrorMessage(error, 'Failed to create pricing') },
      { status: 500 }
    )
  }
}
