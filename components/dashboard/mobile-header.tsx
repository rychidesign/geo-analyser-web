'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Menu, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface MobileHeaderProps {
  onMenuClick: () => void
}

interface ActiveScan {
  id: string
  project_id: string
  status: string
  progress_current: number
  progress_total: number
  progress_message: string | null
}

export function MobileHeader({ onMenuClick }: MobileHeaderProps) {
  const [activeScans, setActiveScans] = useState<ActiveScan[]>([])
  const [loading, setLoading] = useState(true)

  // Poll for active scans
  useEffect(() => {
    const fetchActiveScans = async () => {
      try {
        const response = await fetch('/api/queue')
        if (response.ok) {
          const data = await response.json()
          const active = data.queue?.filter((item: any) => 
            item.status === 'running' || item.status === 'pending'
          ) || []
          setActiveScans(active)
        }
      } catch (error) {
        console.error('Error fetching active scans:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchActiveScans()
    const interval = setInterval(fetchActiveScans, 3000) // Poll every 3 seconds

    return () => clearInterval(interval)
  }, [])

  const hasActiveScans = activeScans.length > 0
  const runningScan = activeScans.find(s => s.status === 'running')

  return (
    <div className="lg:hidden sticky top-0 z-50 h-14 bg-zinc-900 border-b border-zinc-800 flex items-center px-4 gap-3">
      {/* Logo */}
      <Link href="/dashboard" className="flex items-center gap-2 flex-1">
        <Image 
          src="/app-icon.png" 
          alt="GEO Analyser" 
          width={24} 
          height={24}
          className="rounded-md"
        />
        <span className="text-sm font-semibold">GEO Analyser</span>
      </Link>

      {/* Scan Indicator */}
      {hasActiveScans && (
        <button
          onClick={onMenuClick}
          className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 rounded-md text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
        >
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Scanning</span>
          {runningScan && runningScan.progress_total > 0 && (
            <span className="text-zinc-500">
              {runningScan.progress_current}/{runningScan.progress_total}
            </span>
          )}
        </button>
      )}

      {/* Hamburger Menu */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onMenuClick}
        className="text-zinc-400 hover:text-zinc-100"
      >
        <Menu className="w-5 h-5" />
      </Button>
    </div>
  )
}
