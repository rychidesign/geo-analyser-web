import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/credits/middleware'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/stats - Get platform statistics (admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!await isAdmin(user.id)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    // Use admin client for all user data to bypass RLS
    const adminClient = createAdminClient()
    
    // Get user counts by tier from profiles (using admin client)
    const { data: tierCounts } = await adminClient
      .from('user_profiles')
      .select('tier')
    
    const usersByTier = (tierCounts || []).reduce((acc, p) => {
      acc[p.tier] = (acc[p.tier] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    
    // Total users = sum of all tier counts (consistent with byTier)
    const totalUsers = Object.values(usersByTier).reduce((sum, count) => sum + count, 0)

    // Get total scans
    const { count: totalScans } = await supabase
      .from('scans')
      .select('*', { count: 'exact', head: true })

    // Get scans this month
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    const { count: scansThisMonth } = await supabase
      .from('scans')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startOfMonth)

    // Get total revenue (sum of top_up transactions)
    const { data: revenueData } = await supabase
      .from('credit_transactions')
      .select('amount_cents')
      .eq('type', 'top_up')
    
    const totalRevenueCents = (revenueData || []).reduce((sum, t) => sum + t.amount_cents, 0)

    // Get revenue this month
    const { data: monthRevenueData } = await supabase
      .from('credit_transactions')
      .select('amount_cents')
      .eq('type', 'top_up')
      .gte('created_at', startOfMonth)
    
    const monthRevenueCents = (monthRevenueData || []).reduce((sum, t) => sum + t.amount_cents, 0)

    // Get total usage (sum of usage transactions - negative values)
    const { data: usageData } = await supabase
      .from('credit_transactions')
      .select('amount_cents')
      .eq('type', 'usage')
    
    const totalUsageCents = Math.abs((usageData || []).reduce((sum, t) => sum + t.amount_cents, 0))

    // Get usage this month
    const { data: monthUsageData } = await supabase
      .from('credit_transactions')
      .select('amount_cents')
      .eq('type', 'usage')
      .gte('created_at', startOfMonth)
    
    const monthUsageCents = Math.abs((monthUsageData || []).reduce((sum, t) => sum + t.amount_cents, 0))

    // Calculate profit (revenue - provider costs)
    // Provider costs = usage / 3 (since we charge 3x markup)
    const totalProviderCostCents = Math.round(totalUsageCents / 3)
    const monthProviderCostCents = Math.round(monthUsageCents / 3)
    
    const totalProfitCents = totalRevenueCents - totalProviderCostCents
    const monthProfitCents = monthRevenueCents - monthProviderCostCents

    // Get recent registrations (last 7 days)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { count: recentRegistrations } = await supabase
      .from('user_profiles')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', weekAgo)

    // Get failed scans (for monitoring)
    const { count: failedScans } = await supabase
      .from('scans')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('created_at', weekAgo)

    return NextResponse.json({
      users: {
        total: totalUsers || 0,
        byTier: usersByTier,
        recentRegistrations: recentRegistrations || 0,
      },
      scans: {
        total: totalScans || 0,
        thisMonth: scansThisMonth || 0,
        failedThisWeek: failedScans || 0,
      },
      revenue: {
        totalUsd: totalRevenueCents / 100,
        thisMonthUsd: monthRevenueCents / 100,
      },
      usage: {
        totalChargedUsd: totalUsageCents / 100,
        thisMonthChargedUsd: monthUsageCents / 100,
        totalProviderCostUsd: totalProviderCostCents / 100,
        thisMonthProviderCostUsd: monthProviderCostCents / 100,
      },
      profit: {
        totalUsd: totalProfitCents / 100,
        thisMonthUsd: monthProfitCents / 100,
        marginPercent: totalUsageCents > 0 
          ? Math.round((totalProfitCents / totalUsageCents) * 100) 
          : 0,
      },
    })
  } catch (error: any) {
    console.error('[Admin Stats API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch stats' },
      { status: 500 }
    )
  }
}
