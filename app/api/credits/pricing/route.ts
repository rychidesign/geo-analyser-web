import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPricingConfigs, getUserProfile } from '@/lib/credits'
import { getModelsForUser } from '@/lib/credits/middleware'

/**
 * GET /api/credits/pricing - Get pricing information
 * 
 * Regular users see only final prices (with markup)
 * Admins see full pricing including base costs and markup
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // Get all pricing
    const allPricing = await getPricingConfigs()
    
    // Check if user is admin
    let isAdmin = false
    if (user) {
      const profile = await getUserProfile(user.id)
      isAdmin = profile?.tier === 'admin'
    }

    // Map pricing data - admins see full data, others see only final prices
    const pricing = allPricing.map(p => ({
      id: p.id,
      provider: p.provider,
      model: p.model,
      // Everyone sees final prices as input/output_cost_cents
      input_cost_cents: p.final_input_cost_cents,
      output_cost_cents: p.final_output_cost_cents,
      available_free_tier: p.available_free_tier,
      is_active: p.is_active,
      updated_at: p.updated_at,
      // Admin-only fields
      ...(isAdmin && {
        base_input_cost_cents: p.base_input_cost_cents,
        base_output_cost_cents: p.base_output_cost_cents,
        markup_percentage: p.markup_percentage,
        final_input_cost_cents: p.final_input_cost_cents,
        final_output_cost_cents: p.final_output_cost_cents,
      }),
    }))

    // If user is logged in, also show which models are available to them
    let availableModels: string[] | null = null
    let isLimited = false

    if (user) {
      const { models, isLimited: limited } = await getModelsForUser(user.id)
      availableModels = models.map(m => m.model)
      isLimited = limited
    }

    return NextResponse.json({
      pricing,
      availableModels,
      isLimited,
      isAdmin, // Let frontend know if showing full data
    })
  } catch (error: any) {
    console.error('[Pricing API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch pricing' },
      { status: 500 }
    )
  }
}
