import { createClient } from '@/lib/supabase/server'
import { getTotalCostThisMonth, getCostsByProvider, getCostsByType, getUsageHistory } from '@/lib/db/settings'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CreditCard, TrendingUp, DollarSign, BarChart3, Zap, Sparkles, Target } from 'lucide-react'

export default async function CostsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return <div className="p-8">Unauthorized</div>
  }

  // Fetch cost data from database
  const thisMonthCost = await getTotalCostThisMonth(user.id)
  const usageHistory = await getUsageHistory(user.id, 2)
  const providerBreakdown = await getCostsByProvider(user.id)
  const typeBreakdown = await getCostsByType(user.id)
  
  // Calculate last month cost
  const lastMonth = new Date()
  lastMonth.setMonth(lastMonth.getMonth() - 1)
  const lastMonthStr = lastMonth.toISOString().slice(0, 7)
  const lastMonthUsage = usageHistory.filter(u => u.month === lastMonthStr)
  const lastMonthCost = lastMonthUsage.reduce((sum, u) => sum + u.total_cost_usd, 0)
  
  // Calculate totals
  const thisMonthUsage = usageHistory.filter(u => u.month === new Date().toISOString().slice(0, 7))
  const totalScans = thisMonthUsage.reduce((sum, u) => sum + u.scan_count, 0)
  const totalTokens = thisMonthUsage.reduce((sum, u) => sum + u.total_input_tokens + u.total_output_tokens, 0)

  const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const previousMonth = lastMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <>
      {/* Header */}
      <div className="bg-zinc-950 border-b border-zinc-800/50 lg:shrink-0" style={{ padding: '16px 32px' }}>
        <h1 className="text-xl font-semibold">Costs</h1>
        <p className="text-sm text-zinc-400">Overview of your LLM API call costs.</p>
      </div>

      {/* Content */}
      <div className="p-8 lg:flex-1 lg:overflow-y-auto">

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card style={{ background: 'linear-gradient(to top, #18181b, rgba(24, 24, 27, 0.5))' }}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">
              This Month
            </CardTitle>
            <DollarSign className="w-4 h-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${thisMonthCost.toFixed(2)}</div>
            <p className="text-xs text-zinc-500 mt-1">
              {currentMonth}
            </p>
          </CardContent>
        </Card>

        <Card style={{ background: 'linear-gradient(to top, #18181b, rgba(24, 24, 27, 0.5))' }}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">
              Last Month
            </CardTitle>
            <TrendingUp className="w-4 h-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${lastMonthCost.toFixed(2)}</div>
            <p className="text-xs text-zinc-500 mt-1">
              {previousMonth}
            </p>
          </CardContent>
        </Card>

        <Card style={{ background: 'linear-gradient(to top, #18181b, rgba(24, 24, 27, 0.5))' }}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">
              Total Scans
            </CardTitle>
            <BarChart3 className="w-4 h-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalScans}</div>
            <p className="text-xs text-zinc-500 mt-1">
              This month
            </p>
          </CardContent>
        </Card>

        <Card style={{ background: 'linear-gradient(to top, #18181b, rgba(24, 24, 27, 0.5))' }}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">
              Tokens
            </CardTitle>
            <CreditCard className="w-4 h-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalTokens >= 1000 ? `${(totalTokens / 1000).toFixed(1)}K` : totalTokens}
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              Total this month
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Costs by Type */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Costs by Type</CardTitle>
            <CardDescription>
              Cost breakdown by usage type
            </CardDescription>
          </CardHeader>
          <CardContent>
            {typeBreakdown.length === 0 || thisMonthCost === 0 ? (
              <div className="text-center py-8 text-zinc-500">
                <Target className="w-12 h-12 mx-auto mb-4 text-zinc-700" />
                <p>No costs yet</p>
                <p className="text-sm mt-1">
                  Costs will appear after your first scan
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {typeBreakdown.map((item) => {
                  const typeLabels: Record<string, { label: string; icon: any; color: string }> = {
                    scan: { label: 'Queries (Scans)', icon: Zap, color: 'bg-blue-500' },
                    generation: { label: 'AI Generation', icon: Sparkles, color: 'bg-purple-500' },
                    evaluation: { label: 'AI Evaluation', icon: Target, color: 'bg-emerald-500' },
                  }
                  const config = typeLabels[item.type] || { label: item.type, icon: CreditCard, color: 'bg-zinc-500' }
                  const Icon = config.icon
                  
                  return (
                    <div key={item.type}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-zinc-400" />
                          <span className="text-sm">{config.label}</span>
                        </div>
                        <span className="text-sm text-zinc-400">
                          ${item.cost.toFixed(2)} ({item.percentage}%)
                        </span>
                      </div>
                      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${config.color} rounded-full`}
                          style={{ width: `${item.percentage}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Provider Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Costs by Provider</CardTitle>
            <CardDescription>
              Cost breakdown across LLM providers
            </CardDescription>
          </CardHeader>
          <CardContent>
            {providerBreakdown.length === 0 || thisMonthCost === 0 ? (
              <div className="text-center py-8 text-zinc-500">
                <CreditCard className="w-12 h-12 mx-auto mb-4 text-zinc-700" />
                <p>No costs yet</p>
                <p className="text-sm mt-1">
                  Costs will appear after your first scan
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {providerBreakdown.map((item) => (
                  <div key={item.provider}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm capitalize">{item.provider}</span>
                      <span className="text-sm text-zinc-400">
                        ${item.cost.toFixed(2)} ({item.percentage}%)
                      </span>
                    </div>
                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      </div>
    </>
  )
}
