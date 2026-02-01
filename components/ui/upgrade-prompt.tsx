'use client'

import { useState } from 'react'
import { Sparkles, X, ArrowRight, Zap, Crown, Infinity } from 'lucide-react'
import { Button } from './button'
import { cn } from '@/lib/utils'

interface UpgradePromptProps {
  reason?: string
  variant?: 'inline' | 'banner' | 'modal'
  onDismiss?: () => void
  className?: string
}

export function UpgradePrompt({ 
  reason = 'Upgrade to Pro for unlimited access', 
  variant = 'inline',
  onDismiss,
  className 
}: UpgradePromptProps) {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  const handleDismiss = () => {
    setDismissed(true)
    onDismiss?.()
  }

  if (variant === 'banner') {
    return (
      <div className={cn(
        'relative bg-gradient-to-r from-purple-900/30 via-pink-900/30 to-amber-900/30 border border-purple-500/20 rounded-lg p-4',
        className
      )}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <Crown className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="font-medium text-sm">{reason}</p>
              <p className="text-xs text-zinc-400 mt-0.5">
                Get unlimited scans, all models, and scheduled scans
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" className="bg-purple-600 hover:bg-purple-500">
              Add Credits
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
            {onDismiss && (
              <button
                onClick={handleDismiss}
                className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (variant === 'modal') {
    return (
      <div className={cn(
        'bg-zinc-900 border border-zinc-800 rounded-xl p-6 max-w-md',
        className
      )}>
        <div className="text-center mb-6">
          <div className="inline-flex p-3 bg-gradient-to-br from-purple-500/20 to-amber-500/20 rounded-xl mb-4">
            <Crown className="w-8 h-8 text-amber-400" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Upgrade to Pro</h3>
          <p className="text-zinc-400 text-sm">{reason}</p>
        </div>

        <div className="space-y-3 mb-6">
          <FeatureItem icon={Infinity} text="Unlimited scans" />
          <FeatureItem icon={Sparkles} text="Access to all AI models" />
          <FeatureItem icon={Zap} text="Scheduled weekly scans" />
        </div>

        <div className="space-y-2">
          <Button className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500">
            Add Credits
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
          {onDismiss && (
            <Button variant="ghost" className="w-full" onClick={handleDismiss}>
              Maybe later
            </Button>
          )}
        </div>
      </div>
    )
  }

  // Inline variant (default)
  return (
    <div className={cn(
      'flex items-center gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm',
      className
    )}>
      <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
      <span className="flex-1 text-amber-200">{reason}</span>
      <Button size="sm" variant="ghost" className="text-amber-400 hover:text-amber-300 shrink-0">
        Upgrade
        <ArrowRight className="w-3 h-3 ml-1" />
      </Button>
    </div>
  )
}

function FeatureItem({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="p-1.5 bg-zinc-800 rounded-md">
        <Icon className="w-4 h-4 text-emerald-400" />
      </div>
      <span>{text}</span>
    </div>
  )
}

interface LimitReachedProps {
  type: 'scans' | 'projects' | 'queries'
  limit: number
  className?: string
}

export function LimitReached({ type, limit, className }: LimitReachedProps) {
  const messages = {
    scans: `You've used all ${limit} free scans this month`,
    projects: `Free tier is limited to ${limit} project`,
    queries: `Free tier is limited to ${limit} queries per project`,
  }

  return (
    <UpgradePrompt
      variant="banner"
      reason={messages[type]}
      className={className}
    />
  )
}
