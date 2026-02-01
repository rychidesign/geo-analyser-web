'use client'

import { useState, useEffect } from 'react'
import { Wallet, ChevronDown, Plus, Sparkles, Crown, TestTube, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import { 
  UserTier, 
  TIER_DISPLAY, 
  formatUsd, 
  UserCreditInfo 
} from '@/lib/credits/types'

interface CreditDisplayProps {
  className?: string
  showAddButton?: boolean
  onAddCredits?: () => void
}

export function CreditDisplay({ className, showAddButton = true, onAddCredits }: CreditDisplayProps) {
  const [creditInfo, setCreditInfo] = useState<UserCreditInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCredits()
  }, [])

  async function fetchCredits() {
    try {
      const res = await fetch('/api/credits')
      if (res.ok) {
        const data = await res.json()
        setCreditInfo(data.credits)
      }
    } catch (error) {
      console.error('Failed to fetch credits:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className={cn('flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900/50', className)}>
        <div className="w-4 h-4 rounded-full bg-zinc-700 animate-pulse" />
        <div className="w-16 h-4 rounded bg-zinc-700 animate-pulse" />
      </div>
    )
  }

  if (!creditInfo) {
    return null
  }

  const tierDisplay = TIER_DISPLAY[creditInfo.tier]

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* Tier Badge */}
      <TierBadge tier={creditInfo.tier} />

      {/* Credit Balance */}
      {creditInfo.tier !== 'free' && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900/50 border border-zinc-800">
          <Wallet className="w-4 h-4 text-emerald-500" />
          <span className="font-medium text-sm">
            {formatUsd(creditInfo.balanceCents)}
          </span>
          {showAddButton && onAddCredits && (
            <button
              onClick={onAddCredits}
              className="ml-1 p-1 rounded hover:bg-zinc-800 transition-colors"
              title="Add credits"
            >
              <Plus className="w-3.5 h-3.5 text-zinc-400" />
            </button>
          )}
        </div>
      )}

      {/* Free Tier Scans Counter */}
      {creditInfo.tier === 'free' && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900/50 border border-zinc-800">
          <Sparkles className="w-4 h-4 text-amber-500" />
          <span className="text-sm">
            <span className="font-medium">{creditInfo.freeScansRemaining}</span>
            <span className="text-zinc-500">/{creditInfo.freeScansLimit} scans</span>
          </span>
        </div>
      )}
    </div>
  )
}

interface TierBadgeProps {
  tier: UserTier
  size?: 'sm' | 'md'
  className?: string
}

export function TierBadge({ tier, size = 'sm', className }: TierBadgeProps) {
  const display = TIER_DISPLAY[tier]
  
  const Icon = {
    free: Sparkles,
    paid: Crown,
    test: TestTube,
    admin: Shield,
  }[tier]

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs gap-1',
    md: 'px-3 py-1 text-sm gap-1.5',
  }

  return (
    <span className={cn(
      'inline-flex items-center rounded-full font-medium',
      display.bgColor,
      display.color,
      sizeClasses[size],
      className
    )}>
      <Icon className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />
      {display.label}
    </span>
  )
}

interface CreditBalanceInlineProps {
  balanceCents: number
  className?: string
}

export function CreditBalanceInline({ balanceCents, className }: CreditBalanceInlineProps) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <Wallet className="w-4 h-4 text-emerald-500" />
      <span className="font-medium">{formatUsd(balanceCents)}</span>
    </span>
  )
}

interface FreeTierLimitProps {
  used: number
  limit: number
  className?: string
}

export function FreeTierLimit({ used, limit, className }: FreeTierLimitProps) {
  const remaining = Math.max(0, limit - used)
  const percentage = (used / limit) * 100

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-400">Free scans this month</span>
        <span className="font-medium">{remaining} remaining</span>
      </div>
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            percentage >= 100 ? 'bg-red-500' : 
            percentage >= 75 ? 'bg-amber-500' : 'bg-emerald-500'
          )}
          style={{ width: `${Math.min(100, percentage)}%` }}
        />
      </div>
    </div>
  )
}
