'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { 
  LayoutDashboard, 
  FolderOpen, 
  LogOut,
  Plus,
  CreditCard,
  Loader2,
  X,
  Clock,
  Wallet,
  Sparkles,
  Crown,
  TestTube,
  Shield
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { useScan } from '@/lib/scan/scan-context'
import type { User } from '@supabase/supabase-js'
import type { UserCreditInfo, UserTier } from '@/lib/credits/types'

interface DashboardSidebarProps {
  user: User
  isOpen?: boolean
  onClose?: () => void
}

const TIER_DISPLAY: Record<UserTier, { label: string; color: string; bgColor: string }> = {
  free: { label: 'Free', color: 'text-zinc-400', bgColor: 'bg-zinc-800' },
  paid: { label: 'Pro', color: 'text-emerald-400', bgColor: 'bg-emerald-900/50' },
  test: { label: 'Test', color: 'text-amber-400', bgColor: 'bg-amber-900/50' },
  admin: { label: 'Admin', color: 'text-purple-400', bgColor: 'bg-purple-900/50' },
}

const TierIcon = {
  free: Sparkles,
  paid: Crown,
  test: TestTube,
  admin: Shield,
}

export function DashboardSidebar({ user, isOpen = false, onClose }: DashboardSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)
  const [creditInfo, setCreditInfo] = useState<UserCreditInfo | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const supabase = createClient()
  const { jobs } = useScan()

  // Get active jobs for sidebar display
  const activeJobs = jobs.filter(job => ['running', 'queued'].includes(job.status))

  // Fetch credit info
  useEffect(() => {
    fetchCredits()
    
    // Listen for credit updates from other components (e.g., admin panel)
    const handleCreditUpdate = () => fetchCredits()
    window.addEventListener('credits-updated', handleCreditUpdate)
    
    return () => {
      window.removeEventListener('credits-updated', handleCreditUpdate)
    }
  }, [])

  async function fetchCredits() {
    try {
      const res = await fetch('/api/credits')
      if (res.ok) {
        const data = await res.json()
        setCreditInfo(data.credits)
        setAvatarUrl(data.avatarUrl)
      }
    } catch (error) {
      console.error('Failed to fetch credits:', error)
    }
  }

  const handleLogout = async () => {
    setLoggingOut(true)
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }
  
  // Format USD
  const formatUsd = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(cents / 100)
  }

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Projects', href: '/dashboard/projects', icon: FolderOpen },
    { name: 'Costs', href: '/dashboard/costs', icon: CreditCard },
  ]
  
  // Admin-only navigation
  const adminNavigation = creditInfo?.tier === 'admin' ? [
    { name: 'Admin Panel', href: '/dashboard/admin', icon: Shield },
  ] : []

  return (
    <div 
      className={cn(
        "w-64 h-full bg-zinc-900 flex flex-col border-r border-zinc-800",
        // Mobile: fixed overlay, slide in from left
        "fixed inset-y-0 left-0 z-50",
        // Desktop: relative positioning
        "lg:relative",
        // Transform for mobile slide animation
        "transform transition-transform duration-300 ease-in-out",
        isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}
    >
      {/* Header */}
      <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-3" onClick={onClose}>
          <Image 
            src="/app-icon.png" 
            alt="GEO Analyser" 
            width={32} 
            height={32}
            className="rounded-lg"
          />
          <span className="text-lg font-semibold">GEO Analyser</span>
        </Link>
        
        {/* Close button - visible only on mobile */}
        <button
          onClick={onClose}
          className="lg:hidden text-zinc-400 hover:text-zinc-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href || 
              (item.href !== '/dashboard' && pathname.startsWith(item.href))
            
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors',
                  isActive
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50'
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.name}
              </Link>
            )
          })}

          {/* Admin Navigation */}
          {adminNavigation.length > 0 && (
            <>
              <div className="py-2">
                <div className="h-px bg-zinc-800" />
              </div>
              {adminNavigation.map((item) => {
                const isActive = pathname.startsWith(item.href)
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors',
                      isActive
                        ? 'bg-purple-900/50 text-purple-300'
                        : 'text-purple-400 hover:text-purple-300 hover:bg-purple-900/30'
                    )}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.name}
                  </Link>
                )
              })}
            </>
          )}

          {/* Divider */}
          <div className="py-2">
            <div className="h-px bg-zinc-800" />
          </div>

          {/* New Project Button */}
          <Link
            href="/dashboard/projects/new"
            onClick={onClose}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-md transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Project
          </Link>

          {/* Active Scans Section */}
          {activeJobs.length > 0 && (
            <>
              <div className="py-2">
                <div className="h-px bg-zinc-800" />
              </div>
              
              <div className="px-3 py-2">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
                  Active Scans
                </p>
                <div className="space-y-1">
                  {activeJobs.map((job) => (
                    <Link
                      key={job.projectId}
                      href={`/dashboard/projects/${job.projectId}`}
                      onClick={onClose}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-zinc-800/50 transition-colors"
                    >
                      {job.status === 'running' ? (
                        <Loader2 className="w-3 h-3 animate-spin text-blue-400 shrink-0" />
                      ) : (
                        <Clock className="w-3 h-3 text-zinc-500 shrink-0" />
                      )}
                      <span className="text-sm truncate flex-1">{job.projectName}</span>
                      <span className={cn(
                        "text-xs px-1.5 py-0.5 rounded shrink-0",
                        job.status === 'running' 
                          ? "bg-blue-500/10 text-blue-400" 
                          : "bg-zinc-500/10 text-zinc-400"
                      )}>
                        {job.status === 'running' ? 'Running' : 'Queued'}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* User Section */}
      <div className="p-4 border-t border-zinc-800">
        {/* Credit/Tier Info */}
        {creditInfo && (
          <div className="mb-3 py-2 px-2 rounded-lg bg-zinc-800/50">
            <div className="flex items-center justify-between">
              {/* Tier Badge */}
              {(() => {
                const tier = creditInfo.tier
                const display = TIER_DISPLAY[tier]
                const Icon = TierIcon[tier]
                return (
                  <span className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                    display.bgColor,
                    display.color
                  )}>
                    <Icon className="w-3 h-3" />
                    {display.label}
                  </span>
                )
              })()}
              
              {/* Balance or Free Scans */}
              {creditInfo.tier !== 'free' ? (
                <div className="flex items-center gap-1.5 text-sm">
                  <Wallet className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="font-medium">{formatUsd(creditInfo.balanceCents)}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-sm">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>
                    <span className="font-medium">{creditInfo.freeScansRemaining}</span>
                    <span className="text-zinc-500">/{creditInfo.freeScansLimit}</span>
                  </span>
                </div>
              )}
            </div>
            
            {/* Progress bar for free tier */}
            {creditInfo.tier === 'free' && (
              <div className="h-1 bg-zinc-700 rounded-full overflow-hidden mt-2">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    creditInfo.freeScansRemaining === 0 
                      ? 'bg-red-500' 
                      : creditInfo.freeScansRemaining === 1 
                        ? 'bg-amber-500' 
                        : 'bg-emerald-500'
                  )}
                  style={{ 
                    width: `${(creditInfo.freeScansRemaining / creditInfo.freeScansLimit) * 100}%` 
                  }}
                />
              </div>
            )}
          </div>
        )}
        
        <Link
          href="/dashboard/settings"
          onClick={onClose}
          className="flex items-center gap-3 mb-3 p-2 -mx-2 rounded-lg hover:bg-zinc-800/50 transition-colors group"
        >
          <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-sm font-medium overflow-hidden border border-zinc-700 group-hover:border-zinc-600 transition-colors">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt="Avatar"
                width={32}
                height={32}
                className="w-full h-full object-cover"
              />
            ) : (
              user.email?.charAt(0).toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate group-hover:text-zinc-100 transition-colors">{user.email}</p>
            <p className="text-xs text-zinc-500">View profile</p>
          </div>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-zinc-400 hover:text-zinc-100"
          onClick={handleLogout}
          disabled={loggingOut}
        >
          {loggingOut ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <LogOut className="w-4 h-4 mr-2" />
          )}
          Sign Out
        </Button>
      </div>
    </div>
  )
}
