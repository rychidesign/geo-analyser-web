'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, RefreshCw, AlertCircle, CheckCircle, Clock } from 'lucide-react'

export default function ScanDiagnosticsPage() {
  const [diagnostics, setDiagnostics] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadDiagnostics = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/scan-diagnostics')
      if (!res.ok) {
        throw new Error(`Failed to load diagnostics: ${res.status}`)
      }
      const data = await res.json()
      setDiagnostics(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDiagnostics()
  }, [])

  if (loading && !diagnostics) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    )
  }

  if (error && !diagnostics) {
    return (
      <div className="container mx-auto p-6">
        <Card className="border-red-500">
          <CardHeader>
            <CardTitle className="text-red-500">Error Loading Diagnostics</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{error}</p>
            <Button onClick={loadDiagnostics} className="mt-4">
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'error': return 'text-red-500 bg-red-500/10'
      case 'warning': return 'text-yellow-500 bg-yellow-500/10'
      case 'info': return 'text-blue-500 bg-blue-500/10'
      default: return 'text-gray-500 bg-gray-500/10'
    }
  }

  const triggerWorker = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/cron/process-queue', {
        method: 'POST',
      })
      if (res.ok) {
        const data = await res.json()
        alert(`Worker triggered: ${data.message || 'Processing...'}`)
        setTimeout(loadDiagnostics, 2000)
      } else {
        const data = await res.json()
        alert(`Failed to trigger worker: ${data.error || res.status}`)
      }
    } catch (err: any) {
      alert(`Error triggering worker: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const cancelQueueItem = async (queueId: string, projectId: string) => {
    if (!confirm('Cancel this queued scan?')) return
    
    try {
      setLoading(true)
      const res = await fetch(`/api/projects/${projectId}/scan/queue/${queueId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        alert('Scan cancelled')
        await loadDiagnostics()
      } else {
        const data = await res.json()
        alert(`Failed to cancel: ${data.error || res.status}`)
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6 max-h-screen overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Scan Diagnostics</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Real-time scan status and queue monitoring
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={triggerWorker} disabled={loading} variant="default">
            <Loader2 className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Trigger Worker
          </Button>
          <Button onClick={loadDiagnostics} disabled={loading} variant="outline">
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Recommendations */}
      {diagnostics?.recommendations && diagnostics.recommendations.length > 0 && (
        <Card className="border-yellow-500 bg-yellow-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-500">
              <AlertCircle className="w-5 h-5" />
              Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {diagnostics.recommendations.map((rec: any, idx: number) => (
                <div key={idx} className={`p-3 rounded-lg ${getSeverityColor(rec.severity)}`}>
                  <p className="text-sm font-medium">{rec.message}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Queue Items */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Active Queue Items ({diagnostics?.queueItems?.count || 0})
          </CardTitle>
          <CardDescription>
            Scans currently in the queue (pending or running)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {diagnostics?.queueItems?.count > 0 ? (
            <div className="space-y-4">
              {diagnostics.queueItems.items.map((item: any) => (
                <div key={item.id} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-zinc-800 px-2 py-1 rounded">{item.idShort || item.id}</code>
                      <Badge variant={item.status === 'running' ? 'default' : 'secondary'}>
                        {item.status}
                      </Badge>
                    </div>
                    <span className="text-xs text-zinc-500">
                      {item.elapsedSeconds}s ago
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-zinc-500">Project:</span>{' '}
                      <code className="text-xs">{item.projectIdShort || item.projectId}</code>
                    </div>
                    <div>
                      <span className="text-zinc-500">Progress:</span>{' '}
                      <span className="font-mono">{item.progress}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-zinc-500">Message:</span>{' '}
                      <span className="text-zinc-300">{item.message || 'N/A'}</span>
                    </div>
                    {item.scanId && (
                      <div className="col-span-2">
                        <span className="text-zinc-500">Scan ID:</span>{' '}
                        <code className="text-xs">{item.scanIdShort || item.scanId}</code>
                      </div>
                    )}
                    {item.updated && (
                      <div className="col-span-2">
                        <span className="text-zinc-500">Last Updated:</span>{' '}
                        <span className="text-xs">{new Date(item.updated).toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex gap-2 mt-3">
                    {item.status === 'pending' && (
                      <Button 
                        size="sm" 
                        onClick={() => triggerWorker()}
                        disabled={loading}
                      >
                        Start Processing
                      </Button>
                    )}
                    <Button 
                      size="sm" 
                      variant="destructive"
                      onClick={() => cancelQueueItem(item.id, item.projectId)}
                      disabled={loading}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-zinc-500">
              <CheckCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No active queue items</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active Scans */}
      <Card>
        <CardHeader>
          <CardTitle>Active Scans ({diagnostics?.activeScans?.count || 0})</CardTitle>
          <CardDescription>
            Scans marked as running or pending in the scans table
          </CardDescription>
        </CardHeader>
        <CardContent>
          {diagnostics?.activeScans?.count > 0 ? (
            <div className="space-y-3">
              {diagnostics.activeScans.scans.map((scan: any) => (
                <div key={scan.id} className="flex items-center justify-between border rounded-lg p-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-zinc-800 px-2 py-1 rounded">{scan.id}</code>
                      <Badge>{scan.status}</Badge>
                    </div>
                    <div className="text-sm text-zinc-500">
                      Results: {scan.results} | Cost: ${scan.cost || 0}
                    </div>
                  </div>
                  <div className="text-xs text-zinc-500">
                    {new Date(scan.created).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-zinc-500">
              <p>No active scans</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Completed Scans */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Completed Scans</CardTitle>
          <CardDescription>Last 5 completed or failed scans</CardDescription>
        </CardHeader>
        <CardContent>
          {diagnostics?.recentScans?.count > 0 ? (
            <div className="space-y-2">
              {diagnostics.recentScans.scans.map((scan: any) => (
                <div key={scan.id} className="flex items-center justify-between text-sm border-b border-zinc-800 py-2">
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-zinc-800 px-2 py-1 rounded">{scan.id}</code>
                    <Badge variant={scan.status === 'completed' ? 'default' : 'destructive'}>
                      {scan.status}
                    </Badge>
                    <span className="text-zinc-500">
                      {scan.results} results | {scan.durationSeconds}s
                    </span>
                  </div>
                  <span className="text-xs text-zinc-500">
                    {new Date(scan.created).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-zinc-500">
              <p>No recent scans</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stuck Scans */}
      {diagnostics?.stuckScans?.count > 0 && (
        <Card className="border-red-500">
          <CardHeader>
            <CardTitle className="text-red-500">
              Stuck Scans ({diagnostics.stuckScans.count})
            </CardTitle>
            <CardDescription>
              Scans running for more than 5 minutes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {diagnostics.stuckScans.scans.map((scan: any) => (
                <div key={scan.id} className="flex items-center justify-between border border-red-500/20 rounded-lg p-3">
                  <div>
                    <code className="text-xs bg-zinc-800 px-2 py-1 rounded">{scan.id}</code>
                    <p className="text-sm text-zinc-500 mt-1">
                      Running for {scan.elapsedMinutes} minutes
                    </p>
                  </div>
                  <Button size="sm" variant="destructive">
                    Mark as Failed
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Debug Info */}
      <Card>
        <CardHeader>
          <CardTitle>Debug Information</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs bg-zinc-900 p-4 rounded-lg overflow-auto max-h-96">
            {JSON.stringify(diagnostics, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  )
}
