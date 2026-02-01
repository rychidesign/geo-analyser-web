'use client'

import { useState, useEffect } from 'react'
import { 
  Users, 
  DollarSign, 
  TrendingUp, 
  BarChart3, 
  RefreshCw,
  Search,
  Crown,
  TestTube,
  Shield,
  Sparkles,
  AlertTriangle,
  ChevronDown,
  Plus,
  Check,
  Edit2,
  Save,
  X
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { AnnouncementManager } from '@/components/admin/announcement-manager'

interface AdminStats {
  users: {
    total: number
    byTier: Record<string, number>
    recentRegistrations: number
  }
  scans: {
    total: number
    thisMonth: number
    failedThisWeek: number
  }
  revenue: {
    totalUsd: number
    thisMonthUsd: number
  }
  usage: {
    totalChargedUsd: number
    thisMonthChargedUsd: number
    totalProviderCostUsd: number
    thisMonthProviderCostUsd: number
  }
  profit: {
    totalUsd: number
    thisMonthUsd: number
    marginPercent: number
  }
}

interface AdminUser {
  id: string
  user_id: string
  email: string
  tier: 'free' | 'paid' | 'test' | 'admin'
  credit_balance_usd: number
  paid_credits_usd: number
  bonus_credits_usd: number
  free_scans_used: number
  test_simulate_no_credits: boolean
  created_at: string
  updated_at: string
  // Usage statistics
  total_tokens: number
  total_scans: number
  credits_spent_usd: number
}

interface PricingConfig {
  id: number
  provider: string
  model: string
  base_input_cost_cents: number
  base_output_cost_cents: number
  markup_percentage: number
  final_input_cost_cents: number
  final_output_cost_cents: number
  is_active: boolean
  available_free_tier: boolean
  prices_updated_at: string
}

const TierIcon = {
  free: Sparkles,
  paid: Crown,
  test: TestTube,
  admin: Shield,
}

const TierColors = {
  free: 'text-zinc-400 bg-zinc-800',
  paid: 'text-emerald-400 bg-emerald-900/50',
  test: 'text-amber-400 bg-amber-900/50',
  admin: 'text-purple-400 bg-purple-900/50',
}

export function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [pricing, setPricing] = useState<PricingConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [usersLoading, setUsersLoading] = useState(true)
  const [pricingLoading, setPricingLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [editingPricing, setEditingPricing] = useState<number | null>(null)
  const [pricingEdits, setPricingEdits] = useState<Partial<PricingConfig>>({})
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    fetchStats()
    fetchUsers()
    fetchPricing()
  }, [])

  async function fetchStats() {
    try {
      const res = await fetch('/api/admin/stats')
      if (res.ok) {
        const data = await res.json()
        setStats(data)
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    } finally {
      setLoading(false)
    }
  }

  async function fetchUsers() {
    setUsersLoading(true)
    try {
      const res = await fetch('/api/admin/users')
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users || [])
      }
    } catch (error) {
      console.error('Failed to fetch users:', error)
    } finally {
      setUsersLoading(false)
    }
  }

  async function fetchPricing() {
    setPricingLoading(true)
    try {
      const res = await fetch('/api/admin/pricing')
      if (res.ok) {
        const data = await res.json()
        setPricing(data.pricing || [])
      }
    } catch (error) {
      console.error('Failed to fetch pricing:', error)
    } finally {
      setPricingLoading(false)
    }
  }

  async function updatePricing(id: number, updates: Partial<PricingConfig>) {
    setActionLoading(true)
    try {
      const res = await fetch('/api/admin/pricing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      })
      
      if (res.ok) {
        await fetchPricing()
        setEditingPricing(null)
        setPricingEdits({})
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to update pricing')
      }
    } catch (error) {
      console.error('Failed to update pricing:', error)
      alert('Failed to update pricing')
    } finally {
      setActionLoading(false)
    }
  }

  async function updateUser(userId: string, action: string, params: Record<string, any>) {
    setActionLoading(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action, ...params }),
      })
      
      if (res.ok) {
        await fetchUsers()
        await fetchStats()
        setSelectedUser(null)
        
        // Notify other components (e.g., sidebar) that credits may have changed
        window.dispatchEvent(new CustomEvent('credits-updated'))
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to update user')
      }
    } catch (error) {
      console.error('Failed to update user:', error)
      alert('Failed to update user')
    } finally {
      setActionLoading(false)
    }
  }

  const filteredUsers = users.filter(user => 
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount)
  }

  const formatTokens = (tokens: number) => {
    if (tokens >= 1_000_000) {
      return `${(tokens / 1_000_000).toFixed(1)}M`
    }
    if (tokens >= 1_000) {
      return `${(tokens / 1_000).toFixed(1)}K`
    }
    return tokens.toString()
  }

  return (
    <>
      {/* Header */}
      <div className="bg-zinc-950 border-b border-zinc-800/50 shrink-0" style={{ padding: '16px 32px' }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Shield className="w-5 h-5 text-purple-400" />
              Admin Dashboard
            </h1>
            <p className="text-sm text-zinc-400">Platform overview and user management</p>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => { fetchStats(); fetchUsers(); fetchPricing(); }}
            disabled={loading}
          >
            <RefreshCw className={cn('w-4 h-4 mr-2', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Content - scrollable */}
      <div className="flex-1 overflow-y-auto p-8">
        {/* Stats Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="pb-2">
                  <div className="h-4 w-24 bg-zinc-800 rounded" />
                </CardHeader>
                <CardContent>
                  <div className="h-8 w-32 bg-zinc-800 rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : stats && (
          <>
            {/* Overview Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <Card style={{ background: 'linear-gradient(to top, #18181b, rgba(24, 24, 27, 0.5))' }}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-zinc-400">Total Users</CardTitle>
                  <Users className="w-4 h-4 text-zinc-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.users.total}</div>
                  <p className="text-xs text-zinc-500 mt-1">
                    +{stats.users.recentRegistrations} this week
                  </p>
                </CardContent>
              </Card>

              <Card style={{ background: 'linear-gradient(to top, #18181b, rgba(24, 24, 27, 0.5))' }}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-zinc-400">Revenue (Total)</CardTitle>
                  <DollarSign className="w-4 h-4 text-emerald-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-emerald-400">
                    {formatCurrency(stats.revenue.totalUsd)}
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">
                    {formatCurrency(stats.revenue.thisMonthUsd)} this month
                  </p>
                </CardContent>
              </Card>

              <Card style={{ background: 'linear-gradient(to top, #18181b, rgba(24, 24, 27, 0.5))' }}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-zinc-400">Profit (Total)</CardTitle>
                  <TrendingUp className="w-4 h-4 text-zinc-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatCurrency(stats.profit.totalUsd)}
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">
                    {stats.profit.marginPercent}% margin
                  </p>
                </CardContent>
              </Card>

              <Card style={{ background: 'linear-gradient(to top, #18181b, rgba(24, 24, 27, 0.5))' }}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-zinc-400">Total Scans</CardTitle>
                  <BarChart3 className="w-4 h-4 text-zinc-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.scans.total}</div>
                  <p className="text-xs text-zinc-500 mt-1">
                    {stats.scans.thisMonth} this month
                    {stats.scans.failedThisWeek > 0 && (
                      <span className="text-red-400 ml-2">
                        ({stats.scans.failedThisWeek} failed)
                      </span>
                    )}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* User Tier Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <Card className="flex flex-col">
                <CardHeader>
                  <CardTitle>Users by Tier</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-between">
                  <div>
                    {/* Stacked bar chart */}
                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden flex">
                      {(['free', 'paid', 'test', 'admin'] as const).map((tier) => {
                        const count = stats.users.byTier[tier] || 0
                        const percentage = stats.users.total > 0 ? (count / stats.users.total) * 100 : 0
                        const barColor = tier === 'free' ? 'bg-zinc-500' : tier === 'paid' ? 'bg-emerald-500' : tier === 'test' ? 'bg-amber-500' : 'bg-purple-500'
                        
                        if (percentage === 0) return null
                        
                        return (
                          <div
                            key={tier}
                            className={cn('h-full transition-all', barColor)}
                            style={{ width: `${percentage}%` }}
                            title={`${tier}: ${count} (${percentage.toFixed(0)}%)`}
                          />
                        )
                      })}
                    </div>
                    
                    {/* Description */}
                    <p className="text-sm text-zinc-500 mt-3">
                      Distribution of {stats.users.total} registered users across subscription tiers. 
                      Free users have limited scans per month, Paid users use credits, 
                      Test accounts are for internal testing.
                    </p>
                  </div>
                  
                  {/* Legend with counts */}
                  <div className="flex flex-wrap gap-4 pt-4">
                    {(['free', 'paid', 'test', 'admin'] as const).map((tier) => {
                      const count = stats.users.byTier[tier] || 0
                      const Icon = TierIcon[tier]
                      const colors = TierColors[tier]
                      
                      return (
                        <div key={tier} className="flex items-center gap-2">
                          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', colors)}>
                            <Icon className="w-3 h-3" />
                            {tier.charAt(0).toUpperCase() + tier.slice(1)}
                          </span>
                          <span className="text-sm text-zinc-400">{count}</span>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Cost Breakdown</CardTitle>
                  <CardDescription>Provider costs vs. revenue</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Total Charged</span>
                      <span className="font-medium">{formatCurrency(stats.usage.totalChargedUsd)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Provider Costs</span>
                      <span className="font-medium text-red-400">-{formatCurrency(stats.usage.totalProviderCostUsd)}</span>
                    </div>
                    <div className="h-px bg-zinc-800" />
                    <div className="flex justify-between">
                      <span className="font-medium">Net Profit</span>
                      <span className="font-medium text-emerald-400">{formatCurrency(stats.profit.totalUsd)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}

        {/* Announcements Management */}
        <AnnouncementManager />

        {/* Users List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Users</CardTitle>
                <CardDescription>Manage user accounts and credits</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <Input
                    placeholder="Search by email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 w-64"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {usersLoading ? (
              <div className="text-center py-8 text-zinc-500">Loading users...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left py-3 px-4 text-sm font-medium text-zinc-400">Email</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-zinc-400">Tier</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-zinc-400">Balance</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-zinc-400">Scans</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-zinc-400">Tokens</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-zinc-400">Spent</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-zinc-400">Joined</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-zinc-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => {
                      const Icon = TierIcon[user.tier]
                      const colors = TierColors[user.tier]
                      
                      return (
                        <tr key={user.id} className="border-b border-zinc-800/50 hover:bg-zinc-900/50">
                          <td className="py-3 px-4">
                            <span className="text-sm">{user.email}</span>
                            {user.test_simulate_no_credits && (
                              <span className="ml-2 text-xs text-amber-400">(simulating no credits)</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', colors)}>
                              <Icon className="w-3 h-3" />
                              {user.tier.charAt(0).toUpperCase() + user.tier.slice(1)}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className={cn('text-sm font-medium', user.credit_balance_usd > 0 ? 'text-emerald-400' : 'text-zinc-500')}>
                              {formatCurrency(user.credit_balance_usd)}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right text-sm text-zinc-400">
                            {user.total_scans || 0}
                          </td>
                          <td className="py-3 px-4 text-right text-sm text-zinc-400">
                            {formatTokens(user.total_tokens || 0)}
                          </td>
                          <td className="py-3 px-4 text-right text-sm text-zinc-400">
                            {user.credits_spent_usd > 0 ? formatCurrency(user.credits_spent_usd) : '–'}
                          </td>
                          <td className="py-3 px-4 text-right text-sm text-zinc-400">
                            {user.created_at ? new Date(user.created_at).toLocaleDateString('en-US') : '–'}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedUser(user)}
                            >
                              <ChevronDown className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pricing Management */}
        <Card className="mt-8">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Model Pricing</CardTitle>
                <CardDescription>Manage base costs and markup for AI models</CardDescription>
              </div>
              <Badge variant="secondary" className="text-xs">
                Source: <a href="https://vercel.com/ai-gateway/models" target="_blank" rel="noopener noreferrer" className="underline hover:text-white">Vercel AI Gateway</a>
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {pricingLoading ? (
              <div className="text-center py-8 text-zinc-500">Loading pricing...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left py-2 px-3 text-xs font-medium text-zinc-400">Provider</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-zinc-400">Model</th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-zinc-400">Base Input</th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-zinc-400">Base Output</th>
                      <th className="text-center py-2 px-3 text-xs font-medium text-zinc-400">Markup %</th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-zinc-400">Final Input</th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-zinc-400">Final Output</th>
                      <th className="text-center py-2 px-3 text-xs font-medium text-zinc-400">Free Tier</th>
                      <th className="text-center py-2 px-3 text-xs font-medium text-zinc-400">Active</th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-zinc-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pricing.map((p) => {
                      const isEditing = editingPricing === p.id
                      const edits = isEditing ? pricingEdits : {}
                      
                      return (
                        <tr key={p.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                          <td className="py-2 px-3 font-medium text-zinc-300">{p.provider}</td>
                          <td className="py-2 px-3">
                            <code className="text-xs bg-zinc-800 px-1.5 py-0.5 rounded">{p.model}</code>
                          </td>
                          <td className="py-2 px-3 text-right">
                            {isEditing ? (
                              <Input
                                type="number"
                                value={edits.base_input_cost_cents ?? p.base_input_cost_cents}
                                onChange={(e) => setPricingEdits({ ...edits, base_input_cost_cents: Number(e.target.value) })}
                                className="w-20 h-7 text-xs text-right"
                              />
                            ) : (
                              <span className="text-zinc-400">${(p.base_input_cost_cents / 100).toFixed(2)}</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right">
                            {isEditing ? (
                              <Input
                                type="number"
                                value={edits.base_output_cost_cents ?? p.base_output_cost_cents}
                                onChange={(e) => setPricingEdits({ ...edits, base_output_cost_cents: Number(e.target.value) })}
                                className="w-20 h-7 text-xs text-right"
                              />
                            ) : (
                              <span className="text-zinc-400">${(p.base_output_cost_cents / 100).toFixed(2)}</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-center">
                            {isEditing ? (
                              <Input
                                type="number"
                                value={edits.markup_percentage ?? p.markup_percentage}
                                onChange={(e) => setPricingEdits({ ...edits, markup_percentage: Number(e.target.value) })}
                                className="w-16 h-7 text-xs text-center"
                              />
                            ) : (
                              <Badge variant="outline" className="text-xs">{p.markup_percentage}%</Badge>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right font-medium text-emerald-400">
                            ${(p.final_input_cost_cents / 100).toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-right font-medium text-emerald-400">
                            ${(p.final_output_cost_cents / 100).toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-center">
                            {isEditing ? (
                              <button
                                onClick={() => setPricingEdits({ ...edits, available_free_tier: !p.available_free_tier })}
                                className={cn(
                                  'w-5 h-5 rounded border flex items-center justify-center',
                                  (edits.available_free_tier ?? p.available_free_tier) ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-600'
                                )}
                              >
                                {(edits.available_free_tier ?? p.available_free_tier) && <Check className="w-3 h-3" />}
                              </button>
                            ) : (
                              p.available_free_tier ? <Check className="w-4 h-4 text-emerald-400 mx-auto" /> : <span className="text-zinc-600">–</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-center">
                            {isEditing ? (
                              <button
                                onClick={() => setPricingEdits({ ...edits, is_active: !p.is_active })}
                                className={cn(
                                  'w-5 h-5 rounded border flex items-center justify-center',
                                  (edits.is_active ?? p.is_active) ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-600'
                                )}
                              >
                                {(edits.is_active ?? p.is_active) && <Check className="w-3 h-3" />}
                              </button>
                            ) : (
                              p.is_active ? <Check className="w-4 h-4 text-emerald-400 mx-auto" /> : <X className="w-4 h-4 text-red-400 mx-auto" />
                            )}
                          </td>
                          <td className="py-2 px-3 text-right">
                            {isEditing ? (
                              <div className="flex gap-1 justify-end">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2"
                                  onClick={() => {
                                    setEditingPricing(null)
                                    setPricingEdits({})
                                  }}
                                  disabled={actionLoading}
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  className="h-7 px-2"
                                  onClick={() => updatePricing(p.id, pricingEdits)}
                                  disabled={actionLoading}
                                >
                                  <Save className="w-3 h-3" />
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2"
                                onClick={() => {
                                  setEditingPricing(p.id)
                                  setPricingEdits({})
                                }}
                              >
                                <Edit2 className="w-3 h-3" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <p className="text-xs text-zinc-500 mt-4">
                  💡 Base costs are from providers (per 1M tokens in cents). Final prices = Base × (1 + Markup%).
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* User Actions Modal */}
        {selectedUser && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4">
                Manage User: {selectedUser.email}
              </h3>
              
              <div className="space-y-4">
                {/* Change Tier */}
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">Change Tier</label>
                  <div className="flex gap-2">
                    {(['free', 'paid', 'test', 'admin'] as const).map((tier) => {
                      const Icon = TierIcon[tier]
                      const isActive = selectedUser.tier === tier
                      return (
                        <button
                          key={tier}
                          onClick={() => !isActive && updateUser(selectedUser.user_id, 'update_tier', { tier })}
                          disabled={actionLoading || isActive}
                          className={cn(
                            'flex items-center gap-1 px-3 py-1.5 rounded-md text-sm transition-colors',
                            isActive 
                              ? 'bg-zinc-700 text-zinc-100' 
                              : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                          )}
                        >
                          <Icon className="w-3 h-3" />
                          {tier.charAt(0).toUpperCase() + tier.slice(1)}
                          {isActive && <Check className="w-3 h-3 ml-1" />}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Add Credits */}
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">Add Credits</label>
                  <div className="flex gap-2">
                    {[10, 50, 100].map((amount) => (
                      <Button
                        key={amount}
                        variant="outline"
                        size="sm"
                        onClick={() => updateUser(selectedUser.user_id, 'add_credits', { amountUsd: amount })}
                        disabled={actionLoading}
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        ${amount}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Test Account Toggle */}
                {selectedUser.tier === 'test' && (
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">
                      Simulate No Credits
                    </label>
                    <Button
                      variant={selectedUser.test_simulate_no_credits ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => updateUser(selectedUser.user_id, 'toggle_test_simulation', { 
                        simulate: !selectedUser.test_simulate_no_credits 
                      })}
                      disabled={actionLoading}
                    >
                      {selectedUser.test_simulate_no_credits ? 'Disable' : 'Enable'} Simulation
                    </Button>
                    <p className="text-xs text-zinc-500 mt-1">
                      When enabled, test account will behave as if it has no credits
                    </p>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <Button
                  variant="ghost"
                  onClick={() => setSelectedUser(null)}
                  disabled={actionLoading}
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
