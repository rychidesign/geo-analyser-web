import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { requireAdmin, isAdmin } from '@/lib/credits/middleware'
import { updateUserTier, addCredits, getUserProfile, usdToCents } from '@/lib/credits'
import type { UserTier } from '@/lib/credits/types'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/users - List all users (admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check admin access
    if (!await isAdmin(user.id)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const url = new URL(request.url)
    const limit = parseInt(url.searchParams.get('limit') || '50')
    const offset = parseInt(url.searchParams.get('offset') || '0')
    const tierFilter = url.searchParams.get('tier')
    const search = url.searchParams.get('search')

    // Query user profiles
    let query = supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (tierFilter) {
      query = query.eq('tier', tierFilter)
    }

    const { data: profiles, error, count } = await query

    if (error) {
      console.error('[Admin Users API] Query error:', error)
      throw error
    }

    // Get emails from auth.users using admin client
    const emailMap = new Map<string, { email: string; createdAt: string }>()
    const authUserIds = new Set<string>()
    
    try {
      const adminClient = createAdminClient()
      const { data: authUsers } = await adminClient.auth.admin.listUsers()
      
      if (authUsers?.users) {
        for (const authUser of authUsers.users) {
          emailMap.set(authUser.id, {
            email: authUser.email || 'Unknown',
            createdAt: authUser.created_at,
          })
          authUserIds.add(authUser.id)
        }
      }
      
      // Find auth users without profiles and create profiles for them
      const profileUserIds = new Set(profiles?.map(p => p.user_id) || [])
      const usersWithoutProfiles = [...authUserIds].filter(id => !profileUserIds.has(id))
      
      if (usersWithoutProfiles.length > 0) {
        console.log(`[Admin Users API] Found ${usersWithoutProfiles.length} auth users without profiles in current result`)
        
        // Use admin client to bypass RLS
        const adminSupabase = createAdminClient()
        
        // Try to fetch existing profiles for these users (might exist but not in paginated result)
        const { data: existingProfiles } = await adminSupabase
          .from('user_profiles')
          .select('*')
          .in('user_id', usersWithoutProfiles)
        
        if (existingProfiles && existingProfiles.length > 0) {
          console.log(`[Admin Users API] Found ${existingProfiles.length} existing profiles`)
          profiles?.push(...existingProfiles)
        }
        
        // Create truly missing profiles using admin client (bypasses RLS)
        const foundProfileIds = new Set(existingProfiles?.map(p => p.user_id) || [])
        const trulyMissing = usersWithoutProfiles.filter(id => !foundProfileIds.has(id))
        
        for (const userId of trulyMissing) {
          const userEmail = emailMap.get(userId)?.email || 'unknown'
          console.log(`[Admin Users API] Creating profile for user ${userId} (${userEmail})`)
          
          const { data: newProfile, error: createError } = await adminSupabase
            .from('user_profiles')
            .insert({ user_id: userId, tier: 'free' })
            .select()
            .single()
          
          if (createError) {
            console.error(`[Admin Users API] Failed to create profile for ${userId}:`, createError.message)
          } else if (newProfile) {
            console.log(`[Admin Users API] Created profile for ${userEmail}`)
            profiles?.push(newProfile)
          }
        }
      }
    } catch (adminError) {
      console.warn('[Admin Users API] Could not fetch auth users:', adminError)
      // Continue without email data
    }

    // Get usage stats (tokens and costs) for all users from scans
    const userIds = profiles?.map(p => p.user_id) || []
    const usageStatsMap = new Map<string, { totalTokens: number; totalScans: number; totalCostUsd: number }>()
    
    if (userIds.length > 0) {
      // Get aggregated scan data per user
      const { data: scansData } = await supabase
        .from('scans')
        .select('user_id, total_input_tokens, total_output_tokens, total_cost_usd')
        .in('user_id', userIds)
      
      if (scansData) {
        for (const scan of scansData) {
          const existing = usageStatsMap.get(scan.user_id) || { totalTokens: 0, totalScans: 0, totalCostUsd: 0 }
          existing.totalTokens += (scan.total_input_tokens || 0) + (scan.total_output_tokens || 0)
          existing.totalScans += 1
          existing.totalCostUsd += scan.total_cost_usd || 0
          usageStatsMap.set(scan.user_id, existing)
        }
      }
      
      // Get credit transactions (usage type = credits spent)
      const { data: transactionsData } = await supabase
        .from('credit_transactions')
        .select('user_id, amount_cents')
        .in('user_id', userIds)
        .eq('type', 'usage')
      
      if (transactionsData) {
        for (const tx of transactionsData) {
          const existing = usageStatsMap.get(tx.user_id) || { totalTokens: 0, totalScans: 0, totalCostUsd: 0 }
          // amount_cents is negative for usage, so we take absolute value
          existing.totalCostUsd += Math.abs(tx.amount_cents || 0) / 100
          usageStatsMap.set(tx.user_id, existing)
        }
      }
    }

    // Transform data for response
    const users = profiles?.map(p => {
      const authData = emailMap.get(p.user_id)
      const usageStats = usageStatsMap.get(p.user_id) || { totalTokens: 0, totalScans: 0, totalCostUsd: 0 }
      
      return {
        id: p.id,
        user_id: p.user_id,
        email: authData?.email || 'Unknown',
        tier: p.tier,
        credit_balance_usd: p.credit_balance_cents / 100,
        paid_credits_usd: p.paid_credits_cents / 100,
        bonus_credits_usd: p.bonus_credits_cents / 100,
        free_scans_used: p.free_scans_used_this_month,
        test_simulate_no_credits: p.test_simulate_no_credits,
        created_at: authData?.createdAt || p.created_at || null,
        updated_at: p.updated_at,
        // Usage statistics
        total_tokens: usageStats.totalTokens,
        total_scans: usageStats.totalScans,
        credits_spent_usd: usageStats.totalCostUsd,
      }
    }) || []

    return NextResponse.json({
      users,
      pagination: { limit, offset, total: count || users.length },
    })
  } catch (error: any) {
    console.error('[Admin Users API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch users' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/admin/users - Update user (admin only)
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!await isAdmin(user.id)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { userId, action, ...params } = body

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    switch (action) {
      case 'update_tier': {
        const { tier } = params as { tier: UserTier }
        if (!tier || !['free', 'paid', 'test', 'admin'].includes(tier)) {
          return NextResponse.json({ error: 'Invalid tier' }, { status: 400 })
        }
        
        const success = await updateUserTier(userId, tier)
        if (!success) {
          return NextResponse.json({ error: 'Failed to update tier' }, { status: 500 })
        }
        
        return NextResponse.json({ success: true, message: `User tier updated to ${tier}` })
      }

      case 'add_credits': {
        const { amountUsd, description } = params as { amountUsd: number; description?: string }
        if (!amountUsd || amountUsd <= 0) {
          return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
        }

        const result = await addCredits(userId, usdToCents(amountUsd), 'admin_adjustment', {
          description: description || `Admin credit adjustment: +$${amountUsd}`,
          createdBy: user.id,
        })

        if (!result.success) {
          return NextResponse.json({ error: result.error }, { status: 500 })
        }

        return NextResponse.json({ 
          success: true, 
          message: `Added $${amountUsd} to user`,
          newBalance: result.newBalance,
        })
      }

      case 'toggle_test_simulation': {
        const { simulate } = params as { simulate: boolean }
        const profile = await getUserProfile(userId)
        
        if (!profile || profile.tier !== 'test') {
          return NextResponse.json({ error: 'User is not a test account' }, { status: 400 })
        }

        // Use admin client to bypass RLS
        const adminSupabase = createAdminClient()
        const { error } = await adminSupabase
          .from('user_profiles')
          .update({ test_simulate_no_credits: simulate })
          .eq('user_id', userId)

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ 
          success: true, 
          message: simulate ? 'Test account now simulates no credits' : 'Test account has unlimited credits',
        })
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (error: any) {
    console.error('[Admin Users API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update user' },
      { status: 500 }
    )
  }
}
