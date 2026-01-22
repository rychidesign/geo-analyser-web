'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  Loader2, 
  Pause, 
  Play, 
  X, 
  BarChart3,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle
} from 'lucide-react'
import type { ScanQueue } from '@/lib/db/schema'

interface ScanQueueWithProject extends ScanQueue {
  project?: {
    id: string
    name: string
    domain: string
  }
}

export function ScanMonitor() {
  const [queueItems, setQueueItems] = useState<ScanQueueWithProject[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadQueue()
    // Poll for updates every 5 seconds
    const interval = setInterval(loadQueue, 5000)
    return () => clearInterval(interval)
  }, [])

  const loadQueue = async () => {
    try {
      // Get active queue items (pending, running, paused)
      const res = await fetch('/api/queue')
      if (res.ok) {
        const data = await res.json()
        // Filter to only show active items
        const activeItems = data.filter((item: ScanQueueWithProject) => 
          ['pending', 'running', 'paused'].includes(item.status)
        )
        setQueueItems(activeItems)
      }
    } catch (error) {
      console.error('Failed to load queue:', error)
    } finally {
      setLoading(false)
    }
  }

  const handlePause = async (queueId: string) => {
    try {
      const res = await fetch(`/api/queue/${queueId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pause' }),
      })
      if (res.ok) {
        loadQueue()
      }
    } catch (error) {
      console.error('Failed to pause scan:', error)
    }
  }

  const handleResume = async (queueId: string) => {
    try {
      const res = await fetch(`/api/queue/${queueId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resume' }),
      })
      if (res.ok) {
        loadQueue()
        // Trigger queue processing
        fetch('/api/queue/process', { method: 'POST' })
      }
    } catch (error) {
      console.error('Failed to resume scan:', error)
    }
  }

  const handleCancel = async (queueId: string) => {
    try {
      const res = await fetch(`/api/queue/${queueId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      })
      if (res.ok) {
        loadQueue()
      }
    } catch (error) {
      console.error('Failed to cancel scan:', error)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
      case 'paused':
        return <Pause className="w-3.5 h-3.5 text-yellow-400" />
      case 'pending':
        return <Clock className="w-3.5 h-3.5 text-zinc-400" />
      case 'completed':
        return <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
      case 'failed':
        return <XCircle className="w-3.5 h-3.5 text-red-400" />
      case 'cancelled':
        return <AlertCircle className="w-3.5 h-3.5 text-zinc-400" />
      default:
        return null
    }
  }

  const getStatusBadge = (status: string) => {
    const colors = {
      running: 'bg-blue-500/10 text-blue-400 border-0',
      paused: 'bg-yellow-500/10 text-yellow-400 border-0',
      pending: 'bg-zinc-500/10 text-zinc-400 border-0',
      completed: 'bg-emerald-500/10 text-emerald-400 border-0',
      failed: 'bg-red-500/10 text-red-400 border-0',
      cancelled: 'bg-zinc-500/10 text-zinc-400 border-0',
    }
    return (
      <Badge className={colors[status as keyof typeof colors] || colors.pending}>
        {getStatusIcon(status)}
        <span className="ml-1">{status}</span>
      </Badge>
    )
  }

  const getProgressPercentage = (item: ScanQueueWithProject) => {
    if (item.progress_total === 0) return 0
    return Math.round((item.progress_current / item.progress_total) * 100)
  }

  if (loading) {
    return null // Don't show anything while loading
  }

  if (queueItems.length === 0) {
    return null // Don't show monitor if no active scans
  }

  return (
    <Card className="bg-zinc-900/90 backdrop-blur-sm border-zinc-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Active Scans ({queueItems.length})
            </CardTitle>
            <CardDescription className="text-xs">
              Running and queued scan operations
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {queueItems.map((item) => (
          <div
            key={item.id}
            className="p-3 bg-zinc-800/50 rounded-lg space-y-2"
          >
            {/* Project name and status */}
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">
                  {item.project?.name || 'Unknown Project'}
                </div>
                {item.progress_message && (
                  <div className="text-xs text-zinc-500 truncate mt-0.5">
                    {item.progress_message}
                  </div>
                )}
              </div>
              {getStatusBadge(item.status)}
            </div>

            {/* Progress bar */}
            {item.progress_total > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>
                    {item.progress_current} / {item.progress_total}
                  </span>
                  <span>{getProgressPercentage(item)}%</span>
                </div>
                <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${getProgressPercentage(item)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-col gap-1.5">
              {item.status === 'running' && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handlePause(item.id)}
                    className="h-7 text-xs w-full text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                  >
                    <Pause className="w-3 h-3 mr-1" />
                    Pause
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleCancel(item.id)}
                    className="h-7 text-xs text-zinc-400 hover:text-red-400 hover:bg-red-500/10 w-full"
                  >
                    <X className="w-3 h-3 mr-1" />
                    Cancel
                  </Button>
                </>
              )}
              {item.status === 'paused' && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleResume(item.id)}
                    className="h-7 text-xs w-full text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                  >
                    <Play className="w-3 h-3 mr-1" />
                    Resume
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleCancel(item.id)}
                    className="h-7 text-xs text-zinc-400 hover:text-red-400 hover:bg-red-500/10 w-full"
                  >
                    <X className="w-3 h-3 mr-1" />
                    Cancel
                  </Button>
                </>
              )}
              {item.status === 'pending' && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleCancel(item.id)}
                  className="h-7 text-xs text-zinc-400 hover:text-red-400 hover:bg-red-500/10 w-full"
                >
                  <X className="w-3 h-3 mr-1" />
                  Cancel
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
