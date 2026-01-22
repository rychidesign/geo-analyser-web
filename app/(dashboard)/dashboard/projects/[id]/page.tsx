'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { 
  ArrowLeft, 
  Play, 
  Settings, 
  Calendar, 
  Globe, 
  Tag,
  Clock,
  BarChart3,
  MessageSquare,
  Plus,
  Loader2,
  Eye,
  EyeOff,
  Quote,
  Smile,
  TrendingUp,
  Target,
  Award,
  ThumbsUp,
  Cpu
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MetricsChart } from '@/components/charts/metrics-chart'
import type { Project, ProjectQuery, Scan } from '@/lib/db/schema'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function ProjectPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [queries, setQueries] = useState<ProjectQuery[]>([])
  const [scans, setScans] = useState<Scan[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  useEffect(() => {
    loadProject()
  }, [projectId])

  // Poll for active scans and auto-refresh when completed
  useEffect(() => {
    let wasScanning = false
    
    const checkScanStatus = async () => {
      try {
        const res = await fetch('/api/queue')
        if (res.ok) {
          const queue = await res.json()
          const projectScans = queue.filter((item: any) => 
            item.project_id === projectId && 
            ['pending', 'running', 'paused'].includes(item.status)
          )
          
          const isScanning = projectScans.length > 0
          
          // If was scanning and now finished, reload project data
          if (wasScanning && !isScanning) {
            console.log('[Project] Scan completed, reloading data...')
            loadProject()
          }
          
          wasScanning = isScanning
        }
      } catch (error) {
        console.error('Error checking scan status:', error)
      }
    }
    
    // Check every 5 seconds
    const interval = setInterval(checkScanStatus, 5000)
    checkScanStatus() // Initial check
    
    return () => clearInterval(interval)
  }, [projectId])

  const loadProject = async () => {
    try {
      const [projectRes, queriesRes, scansRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/projects/${projectId}/queries`),
        fetch(`/api/projects/${projectId}/scans`),
      ])

      if (projectRes.ok) {
        setProject(await projectRes.json())
      }
      if (queriesRes.ok) {
        setQueries(await queriesRes.json())
      }
      if (scansRes.ok) {
        setScans(await scansRes.json())
      }
    } catch (error) {
      console.error('Error loading project:', error)
    } finally {
      setLoading(false)
    }
  }

  const runScan = async () => {
    setScanning(true)
    setError(null)

    try {
      // Add project to queue
      const res = await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_ids: [projectId],
          priority: 1, // Higher priority for manual scans
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        console.error('Queue error:', data)
        setError(data.error || 'Failed to queue scan')
        return
      }

      console.log('Queue success:', data)

      // Trigger queue processing
      fetch('/api/queue/process', { method: 'POST' })

      // Show success message and reload data
      setInfo('Scan queued successfully. Monitor progress in the sidebar.')
      setTimeout(() => {
        setInfo(null)
        loadProject() // Reload to show updated scan list
      }, 2000)
    } catch (err: any) {
      console.error('Queue exception:', err)
      setError(`Failed to queue scan: ${err.message || err}`)
    } finally {
      setScanning(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="p-8">
        <p className="text-zinc-500">Project not found</p>
      </div>
    )
  }

  // Only show completed scans for metrics
  const completedScans = scans.filter(scan => scan.status === 'completed')
  const lastScan = completedScans[0]

  return (
    <>
      {/* Header */}
      <div className="shrink-0 bg-zinc-950 border-b border-zinc-800/50" style={{ padding: '16px 32px' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link 
              href="/dashboard/projects"
              className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Projects
            </Link>
            <h1 className="text-xl font-semibold">{project.name}</h1>
          </div>
          <div className="flex gap-3">
            <Link href={`/dashboard/projects/${projectId}/settings`}>
              <Button variant="outline" className="border-0">
                <Settings className="w-4 h-4" />
                Settings
              </Button>
            </Link>
            <Button 
              disabled={queries.length === 0 || scanning}
              onClick={runScan}
            >
              {scanning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Run Scan
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        {/* Project Info */}
        <div className="flex items-center gap-4 text-sm text-zinc-400 flex-wrap mb-8">
          <span className="flex items-center gap-1">
            <Globe className="w-4 h-4" />
            {project.domain}
          </span>
          <span className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            Created {new Date(project.created_at).toLocaleDateString('en-US')}
          </span>
          <span className="text-zinc-600">•</span>
          <span>{scans.length} scans</span>
          <span className="text-zinc-600">•</span>
          <span>{queries.length} queries</span>
          <span className="text-zinc-600">•</span>
          <span>
            {project.scheduled_scan_enabled 
              ? `Scheduled: ${DAYS[project.scheduled_scan_day || 0]}`
              : 'No schedule'}
          </span>
        </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-4 rounded-lg mb-6">
          {error}
        </div>
      )}

      {info && (
        <div className="bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm p-4 rounded-lg mb-6">
          {info}
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '32px' }}>
        <Card style={{ background: 'linear-gradient(to top, #18181b, rgba(24, 24, 27, 0.5))' }}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-medium text-zinc-400">Overall Score</CardTitle>
              <Target className="w-4 h-4 text-zinc-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">
              {lastScan?.overall_score ?? '-'}%
            </div>
          </CardContent>
        </Card>

        <Card style={{ background: 'linear-gradient(to top, #18181b, rgba(24, 24, 27, 0.5))' }}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-medium text-zinc-400">Visibility</CardTitle>
              <Eye className="w-4 h-4 text-zinc-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-400">
              {lastScan?.avg_visibility ?? '-'}%
            </div>
          </CardContent>
        </Card>

        <Card style={{ background: 'linear-gradient(to top, #18181b, rgba(24, 24, 27, 0.5))' }}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-medium text-zinc-400">Sentiment</CardTitle>
              <Smile className="w-4 h-4 text-zinc-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-400">
              {lastScan?.avg_sentiment ?? '-'}%
            </div>
          </CardContent>
        </Card>

        <Card style={{ background: 'linear-gradient(to top, #18181b, rgba(24, 24, 27, 0.5))' }}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-medium text-zinc-400">Citation</CardTitle>
              <Quote className="w-4 h-4 text-zinc-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-400">
              {lastScan?.avg_citation ?? '-'}%
            </div>
          </CardContent>
        </Card>

        <Card style={{ background: 'linear-gradient(to top, #18181b, rgba(24, 24, 27, 0.5))' }}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-medium text-zinc-400">Ranking</CardTitle>
              <TrendingUp className="w-4 h-4 text-zinc-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-pink-400">
              {lastScan?.avg_ranking ?? '-'}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Metrics Chart */}
      {completedScans.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Metrics History
            </CardTitle>
            <CardDescription>
              Track your visibility and performance over time
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MetricsChart projectId={projectId} days={30} />
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Test Queries */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Test Queries
              </CardTitle>
              <CardDescription>
                Queries that will be tested against AI models
              </CardDescription>
            </div>
            <Link href={`/dashboard/projects/${projectId}/queries`}>
              <Button variant="outline" size="sm">
                <Plus className="w-4 h-4" />
                Manage Queries
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {queries.length > 0 ? (
              <div className="space-y-2">
                {queries.slice(0, 5).map((query) => (
                  <div 
                    key={query.id}
                    className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg"
                  >
                    <span className="text-sm">{query.query_text}</span>
                    <span className="text-xs text-zinc-500 capitalize">
                      {query.query_type}
                    </span>
                  </div>
                ))}
                {queries.length > 5 && (
                  <p className="text-sm text-zinc-500 text-center pt-2">
                    +{queries.length - 5} more queries
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <MessageSquare className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                <p className="text-zinc-500 mb-4">No test queries yet</p>
                <Link href={`/dashboard/projects/${projectId}/queries`}>
                  <Button variant="outline">
                    <Plus className="w-4 h-4" />
                    Add Queries
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Scans */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Recent Scans
            </CardTitle>
            <CardDescription>
              History of scan results
            </CardDescription>
          </CardHeader>
          <CardContent>
            {scans.length > 0 ? (
              <div className="space-y-2">
                {scans.slice(0, 5).map((scan) => (
                  <Link 
                    key={scan.id}
                    href={`/dashboard/projects/${projectId}/scans/${scan.id}`}
                    className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg hover:bg-zinc-800 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Clock className="w-4 h-4 text-zinc-500" />
                      <span className="text-sm">
                        {new Date(scan.created_at).toLocaleDateString('en-US')}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        scan.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' :
                        scan.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                        'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {scan.status}
                      </span>
                      {scan.evaluation_method === 'ai' && (
                        <Badge className="gap-1 border-0 bg-purple-500/10 text-purple-400">
                          <Cpu className="w-3 h-3" /> AI
                        </Badge>
                      )}
                    </div>
                    {scan.status === 'completed' && (
                      <div className="flex items-center gap-4 text-xs text-zinc-500">
                        <span className="flex items-center gap-1">
                          {(scan.avg_visibility ?? 0) > 0 ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                          {scan.avg_visibility ?? 0}%
                        </span>
                        <span className="flex items-center gap-1">
                          <ThumbsUp className="w-3.5 h-3.5" />
                          {scan.avg_sentiment ?? 50}%
                        </span>
                        <span className="flex items-center gap-1">
                          <Quote className="w-3.5 h-3.5" />
                          {scan.avg_citation ?? 0}%
                        </span>
                        <span className="flex items-center gap-1">
                          <Award className="w-3.5 h-3.5" />
                          {scan.avg_ranking ?? 0}%
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      {scan.status === 'completed' && scan.overall_score !== null && (
                        <span className="text-sm font-semibold text-white">
                          {scan.overall_score}%
                        </span>
                      )}
                      <span className="text-xs text-zinc-500">
                        ${scan.total_cost_usd.toFixed(4)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <BarChart3 className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                <p className="text-zinc-500 mb-4">No scans yet</p>
                <Button 
                  variant="emerald" 
                  disabled={queries.length === 0 || scanning}
                  onClick={runScan}
                >
                  {scanning ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Run First Scan
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      </div>
    </>
  )
}
