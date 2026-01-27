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
  Smile,
  TrendingUp,
  Target,
  Award,
  ThumbsUp,
  Cpu,
  Trash2,
  Square,
  Pause
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MetricsChart } from '@/components/charts/metrics-chart'
import { useScan } from '@/lib/scan/scan-context'
import { useToast } from '@/components/ui/toast'
import type { Project, ProjectQuery, Scan } from '@/lib/db/schema'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function ProjectPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  const { startScan, cancelScan, getJobForProject, hasActiveJob } = useScan()
  const { showSuccess, showError, showInfo } = useToast()

  const [project, setProject] = useState<Project | null>(null)
  const [queries, setQueries] = useState<ProjectQuery[]>([])
  const [scans, setScans] = useState<Scan[]>([])
  const [loading, setLoading] = useState(true)

  // Get current scan job status
  const currentJob = getJobForProject(projectId)
  const isScanning = currentJob?.status === 'running'
  const isQueued = currentJob?.status === 'queued'
  const hasActiveScan = hasActiveJob(projectId)

  useEffect(() => {
    loadProject()
  }, [projectId])

  // Reload project when scan completes
  useEffect(() => {
    if (currentJob?.status === 'completed') {
      loadProject()
      showSuccess('Scan completed successfully!')
    } else if (currentJob?.status === 'failed') {
      showError(`Scan failed: ${currentJob.error}`)
    }
  }, [currentJob?.status])

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
    try {
      await startScan(projectId, project?.name || 'Project')
      showInfo('Scan added to queue')
    } catch (err: any) {
      console.error('Queue exception:', err)
      showError(`Failed to queue scan: ${err.message || err}`)
    }
  }

  const handleCancelScan = () => {
    cancelScan(projectId)
    showInfo('Scan cancelled')
  }

  const deleteAllScans = async () => {
    if (!confirm(`Are you sure you want to delete ALL ${scans.length} scans? This action cannot be undone and will affect your statistics.`)) {
      return
    }

    try {
      const res = await fetch(`/api/projects/${projectId}/scans/delete-all`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        throw new Error('Failed to delete scans')
      }

      const result = await res.json()
      showSuccess(`Successfully deleted ${result.deletedCount} scans`)
      loadProject()
    } catch (err: any) {
      showError(`Failed to delete scans: ${err.message}`)
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

  // Calculate averages across ALL completed scans
  const avgMetrics = completedScans.length > 0 ? {
    overall: Math.round(completedScans.reduce((sum, s) => sum + (s.overall_score || 0), 0) / completedScans.length),
    visibility: Math.round(completedScans.reduce((sum, s) => sum + (s.avg_visibility || 0), 0) / completedScans.length),
    sentiment: (() => {
      // Only average sentiment from scans where brand was mentioned (visibility > 0)
      const scansWithBrand = completedScans.filter(s => (s.avg_visibility || 0) > 0)
      if (scansWithBrand.length === 0) return 0
      return Math.round(scansWithBrand.reduce((sum, s) => sum + (s.avg_sentiment || 0), 0) / scansWithBrand.length)
    })(),
    ranking: Math.round(completedScans.reduce((sum, s) => sum + (s.avg_ranking || 0), 0) / completedScans.length),
  } : null

  return (
    <>
      {/* Header */}
      <div className="bg-zinc-950 border-b border-zinc-800/50 lg:shrink-0 px-4 py-4 lg:px-8">
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
            
            {/* Scan buttons */}
            {hasActiveScan ? (
              <Button 
                variant="outline"
                className="border-red-500/30 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                onClick={handleCancelScan}
              >
                <Square className="w-4 h-4" />
                {isScanning ? 'Stop Scan' : 'Cancel'}
              </Button>
            ) : (
              <Button 
                disabled={queries.length === 0}
                onClick={runScan}
              >
                <Play className="w-4 h-4" />
                Run Scan
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-4 lg:px-8 lg:flex-1 lg:overflow-y-auto">
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

        {/* Scan Progress */}
        {currentJob && ['running', 'queued'].includes(currentJob.status) && (
          <Card className="mb-6 border-blue-500/30 bg-blue-500/5">
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {isScanning ? (
                    <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                  ) : (
                    <Clock className="w-4 h-4 text-zinc-400" />
                  )}
                  <span className="font-medium">
                    {isScanning ? 'Scanning in progress...' : 'Scan queued'}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                  onClick={handleCancelScan}
                >
                  <Square className="w-3 h-3 mr-1" />
                  {isScanning ? 'Stop' : 'Cancel'}
                </Button>
              </div>
              
              {currentJob.progress.total > 0 && (
                <>
                  <div className="flex items-center justify-between text-sm text-zinc-400 mb-2">
                    <span>{currentJob.progress.message || 'Processing...'}</span>
                    <span>{currentJob.progress.current}/{currentJob.progress.total}</span>
                  </div>
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 transition-all duration-300"
                      style={{ width: `${(currentJob.progress.current / currentJob.progress.total) * 100}%` }}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Stats - Averages across ALL completed scans */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card style={{ background: 'linear-gradient(to top, #18181b, rgba(24, 24, 27, 0.5))' }}>
            <CardHeader className="pb-0">
              <div className="flex items-start justify-between">
                <div className="text-2xl font-bold text-emerald-400">
                  {avgMetrics?.overall ?? '-'}%
                </div>
                <Target className="w-4 h-4 text-zinc-400" />
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="text-xs font-medium text-zinc-300 mb-1">Overall Score</div>
              <p className="text-xs text-zinc-500">Average across {completedScans.length} scan{completedScans.length !== 1 ? 's' : ''}</p>
            </CardContent>
          </Card>

          <Card style={{ background: 'linear-gradient(to top, #18181b, rgba(24, 24, 27, 0.5))' }}>
            <CardHeader className="pb-0">
              <div className="flex items-start justify-between">
                <div className="text-2xl font-bold text-blue-400">
                  {avgMetrics?.visibility ?? '-'}%
                </div>
                <Eye className="w-4 h-4 text-zinc-400" />
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="text-xs font-medium text-zinc-300 mb-1">Visibility</div>
              <p className="text-xs text-zinc-500">Brand (50) + domain (50) = 100</p>
            </CardContent>
          </Card>

          <Card style={{ background: 'linear-gradient(to top, #18181b, rgba(24, 24, 27, 0.5))' }}>
            <CardHeader className="pb-0">
              <div className="flex items-start justify-between">
                <div className="text-2xl font-bold text-amber-400">
                  {avgMetrics?.sentiment ?? '-'}%
                </div>
                <Smile className="w-4 h-4 text-zinc-400" />
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="text-xs font-medium text-zinc-300 mb-1">Sentiment</div>
              <p className="text-xs text-zinc-500">Only counted when brand is mentioned</p>
            </CardContent>
          </Card>

          <Card style={{ background: 'linear-gradient(to top, #18181b, rgba(24, 24, 27, 0.5))' }}>
            <CardHeader className="pb-0">
              <div className="flex items-start justify-between">
                <div className="text-2xl font-bold text-pink-400">
                  {avgMetrics?.ranking ?? '-'}%
                </div>
                <TrendingUp className="w-4 h-4 text-zinc-400" />
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="text-xs font-medium text-zinc-300 mb-1">Ranking</div>
              <p className="text-xs text-zinc-500">Position when AI lists recommendations</p>
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
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  Recent Scans
                </CardTitle>
                <CardDescription className="mt-1.5">
                  History of scan results
                </CardDescription>
              </div>
              {scans.length > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10 -mt-1"
                  onClick={deleteAllScans}
                >
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  Delete All
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {scans.length > 0 ? (
                <div className="space-y-2">
                  {scans.slice(0, 5).map((scan) => (
                    <Link 
                      key={scan.id}
                      href={`/dashboard/projects/${projectId}/scans/${scan.id}`}
                      className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2 lg:gap-3 p-3 bg-zinc-800/50 rounded-lg hover:bg-zinc-800 transition-colors"
                    >
                      {/* Mobile First Row / Desktop Left Section: Date, Status */}
                      <div className="flex items-center justify-between lg:justify-start gap-3 lg:flex-1">
                        <div className="flex items-center gap-3">
                          <Clock className="w-4 h-4 text-zinc-500" />
                          <span className="text-sm">
                            {new Date(scan.created_at).toLocaleDateString('en-US')}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            scan.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' :
                            scan.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                            scan.status === 'stopped' ? 'bg-red-500/20 text-red-400' :
                            'bg-yellow-500/20 text-yellow-400'
                          }`}>
                            {scan.status === 'stopped' ? 'Stopped' : scan.status}
                          </span>
                          {scan.evaluation_method === 'ai' && (
                            <Badge className="gap-1 border-0 bg-purple-500/10 text-purple-400">
                              <Cpu className="w-3 h-3" /> AI
                            </Badge>
                          )}
                        </div>
                        {/* Mobile: Overall Score on first row right */}
                        {scan.status === 'completed' && scan.overall_score !== null && (
                          <span className="lg:hidden text-sm font-semibold text-emerald-400">
                            {scan.overall_score}%
                          </span>
                        )}
                      </div>

                      {/* Mobile Second Row / Desktop Middle Section: Metrics */}
                      {scan.status === 'completed' && (
                        <div className="flex items-center justify-between lg:justify-start lg:flex-1">
                          <div className="flex items-center gap-4 text-xs text-zinc-500">
                            <span className="flex items-center gap-1">
                              {(scan.avg_visibility ?? 0) > 0 ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                              {scan.avg_visibility ?? 0}%
                            </span>
                            <span className="flex items-center gap-1">
                              <ThumbsUp className="w-3.5 h-3.5" />
                              {scan.avg_sentiment ?? 0}%
                            </span>
                            <span className="flex items-center gap-1">
                              <Award className="w-3.5 h-3.5" />
                              {scan.avg_ranking ?? 0}%
                            </span>
                          </div>
                          {/* Mobile: Cost on second row right */}
                          <span className="lg:hidden text-xs text-zinc-500">
                            ${scan.total_cost_usd.toFixed(4)}
                          </span>
                        </div>
                      )}

                      {/* Desktop Only: Right Section with Overall Score and Cost */}
                      {scan.status === 'completed' && (
                        <div className="hidden lg:flex items-center gap-4">
                          {scan.overall_score !== null && (
                            <span className="text-sm font-semibold text-emerald-400">
                              {scan.overall_score}%
                            </span>
                          )}
                          <span className="text-xs text-zinc-500">
                            ${scan.total_cost_usd.toFixed(4)}
                          </span>
                        </div>
                      )}
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <BarChart3 className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                  <p className="text-zinc-500 mb-4">No scans yet</p>
                  <Button 
                    className="bg-emerald-600 hover:bg-emerald-700"
                    disabled={queries.length === 0 || hasActiveScan}
                    onClick={runScan}
                  >
                    {hasActiveScan ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {isScanning ? 'Running...' : 'Queued'}
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
