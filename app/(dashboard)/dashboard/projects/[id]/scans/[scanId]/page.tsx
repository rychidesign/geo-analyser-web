'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { 
  ArrowLeft, 
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  DollarSign,
  Eye,
  EyeOff,
  Quote,
  TrendingUp,
  Award,
  Cpu,
  Trash2
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AIResponse } from '@/components/ui/ai-response'
import type { Scan, ScanResult, ScanMetrics } from '@/lib/db/schema'

interface ProjectInfo {
  brand_variations: string[]
  domain: string
  target_keywords: string[]
}

export default function ScanResultsPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  const scanId = params.scanId as string
  
  const [scan, setScan] = useState<Scan | null>(null)
  const [results, setResults] = useState<ScanResult[]>([])
  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadScan()
  }, [projectId, scanId])

  const loadScan = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/scans/${scanId}`)
      if (res.ok) {
        const data = await res.json()
        setScan(data.scan)
        setResults(data.results)
        setProjectInfo(data.project)
      }
    } catch (error) {
      console.error('Error loading scan:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleExpand = (resultId: string) => {
    setExpandedResults(prev => {
      const newSet = new Set(prev)
      if (newSet.has(resultId)) {
        newSet.delete(resultId)
      } else {
        newSet.add(resultId)
      }
      return newSet
    })
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this scan? This action cannot be undone.')) {
      return
    }

    setDeleting(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/scans/${scanId}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        // Redirect back to project page
        router.push(`/dashboard/projects/${projectId}`)
      } else {
        alert('Failed to delete scan')
        setDeleting(false)
      }
    } catch (error) {
      console.error('Error deleting scan:', error)
      alert('Failed to delete scan')
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    )
  }

  if (!scan) {
    return (
      <div className="p-8">
        <p className="text-zinc-500">Scan not found</p>
      </div>
    )
  }

  // Group results by query
  const resultsByQuery = results.reduce((acc, result) => {
    if (!acc[result.query_text]) {
      acc[result.query_text] = []
    }
    acc[result.query_text].push(result)
    return acc
  }, {} as Record<string, ScanResult[]>)

  return (
    <>
      {/* Header */}
      <div className="bg-zinc-950 border-b border-zinc-800/50 lg:shrink-0 px-4 py-4 lg:px-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link 
              href={`/dashboard/projects/${projectId}`}
              className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Project
            </Link>
            <div>
              <h1 className="text-xl font-semibold">Scan Results</h1>
              <div className="flex items-center gap-4 text-sm text-zinc-400">
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {new Date(scan.created_at).toLocaleString('en-US')}
                </span>
                <span className={`flex items-center gap-1 ${
                  scan.status === 'completed' ? 'text-emerald-400' :
                  scan.status === 'failed' ? 'text-red-400' :
                  'text-yellow-400'
                }`}>
                  {scan.status === 'completed' ? <CheckCircle className="w-4 h-4" /> :
                   scan.status === 'failed' ? <XCircle className="w-4 h-4" /> :
                   <Loader2 className="w-4 h-4 animate-spin" />}
                  {scan.status}
                </span>
                {scan.evaluation_method === 'ai' && (
                  <Badge className="gap-1 border-0 bg-purple-500/10 text-purple-400">
                    <Cpu className="w-3 h-3" /> AI Evaluated
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Scan
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-4 lg:px-8 lg:flex-1 lg:overflow-y-auto">

      {/* Score Metrics */}
      <div className="grid grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <div className="text-xs text-zinc-500 mb-1">Overall</div>
            <div className="text-2xl font-bold text-emerald-400">
              {scan.overall_score ?? 0}%
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <div className="text-xs text-zinc-500 mb-1">Visibility</div>
            <div className={`text-2xl font-bold ${(scan.avg_visibility ?? 0) > 0 ? 'text-emerald-400' : 'text-zinc-600'}`}>
              {scan.avg_visibility ?? 0}%
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <div className="text-xs text-zinc-500 mb-1">Sentiment</div>
            <div className={`text-2xl font-bold ${
              (scan.avg_sentiment ?? 50) > 60 ? 'text-emerald-400' :
              (scan.avg_sentiment ?? 50) < 40 ? 'text-red-400' : 'text-zinc-400'
            }`}>
              {scan.avg_sentiment ?? 50}%
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <div className="text-xs text-zinc-500 mb-1">Citation</div>
            <div className={`text-2xl font-bold ${(scan.avg_citation ?? 0) > 0 ? 'text-blue-400' : 'text-zinc-600'}`}>
              {scan.avg_citation ?? 0}%
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <div className="text-xs text-zinc-500 mb-1">Ranking</div>
            <div className={`text-2xl font-bold ${(scan.avg_ranking ?? 0) > 0 ? 'text-yellow-400' : 'text-zinc-600'}`}>
              {scan.avg_ranking ?? 0}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cost Stats */}
      <div className="flex items-center gap-6 mb-8 text-sm text-zinc-400">
        <span className="flex items-center gap-1">
          <DollarSign className="w-4 h-4" />
          Cost: ${scan.total_cost_usd.toFixed(4)}
        </span>
        <span>Input: {scan.total_input_tokens.toLocaleString()} tokens</span>
        <span>Output: {scan.total_output_tokens.toLocaleString()} tokens</span>
      </div>

      {/* Results by Query */}
      <div className="space-y-6">
        {Object.entries(resultsByQuery).map(([query, queryResults]) => (
          <Card key={query}>
            <CardHeader>
              <CardTitle className="text-base font-medium">
                "{query}"
              </CardTitle>
              <CardDescription>
                {queryResults.length} provider{queryResults.length !== 1 ? 's' : ''} tested
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {queryResults.map((result) => {
                  const metrics = result.metrics_json as ScanMetrics | null
                  const isExpanded = expandedResults.has(result.id)

                  return (
                    <div 
                      key={result.id}
                      className="border border-zinc-800 rounded-lg overflow-hidden"
                    >
                      {/* Result Header */}
                      <div 
                        className="flex items-center justify-between p-4 bg-zinc-800/50 cursor-pointer hover:bg-zinc-800"
                        onClick={() => toggleExpand(result.id)}
                      >
                        <div className="flex items-center gap-4">
                          <span className="font-medium capitalize">{result.provider}</span>
                          <span className="text-sm text-zinc-500">{result.model}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          {metrics && (
                            <>
                              <span className={`flex items-center gap-1 text-sm ${
                                metrics.visibility_score > 0 ? 'text-emerald-400' : 'text-zinc-500'
                              }`}>
                                {metrics.visibility_score > 0 ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                {metrics.visibility_score}%
                              </span>
                              <span className={`flex items-center gap-1 text-sm ${
                                metrics.citation_score > 0 ? 'text-blue-400' : 'text-zinc-500'
                              }`}>
                                <Quote className="w-4 h-4" />
                                {metrics.citation_score}%
                              </span>
                              <span className={`flex items-center gap-1 text-sm ${
                                metrics.ranking_score > 0 ? 'text-yellow-400' : 'text-zinc-500'
                              }`}>
                                <Award className="w-4 h-4" />
                                {metrics.ranking_score}%
                              </span>
                              <span className="flex items-center gap-1 text-sm text-emerald-400 font-medium">
                                <TrendingUp className="w-4 h-4" />
                                {metrics.recommendation_score}%
                              </span>
                            </>
                          )}
                          <span className="text-xs text-zinc-500">
                            ${result.cost_usd?.toFixed(4)}
                          </span>
                        </div>
                      </div>

                      {/* Expanded Content */}
                      {isExpanded && (
                        <div className="p-4 border-t border-zinc-800">
                          {/* Metrics Grid */}
                          {metrics && (
                            <div className="grid grid-cols-5 gap-4 mb-4 p-3 bg-zinc-900 rounded-lg">
                              <div className="text-center">
                                <div className="text-xs text-zinc-500 mb-1">Visibility</div>
                                <div className={`text-lg font-bold ${metrics.visibility_score > 0 ? 'text-emerald-400' : 'text-zinc-600'}`}>
                                  {metrics.visibility_score}%
                                </div>
                              </div>
                              <div className="text-center">
                                <div className="text-xs text-zinc-500 mb-1">Sentiment</div>
                                <div className={`text-lg font-bold ${
                                  metrics.sentiment_score > 60 ? 'text-emerald-400' :
                                  metrics.sentiment_score < 40 ? 'text-red-400' : 'text-zinc-400'
                                }`}>
                                  {metrics.sentiment_score}%
                                </div>
                              </div>
                              <div className="text-center">
                                <div className="text-xs text-zinc-500 mb-1">Citation</div>
                                <div className={`text-lg font-bold ${metrics.citation_score > 0 ? 'text-blue-400' : 'text-zinc-600'}`}>
                                  {metrics.citation_score}%
                                </div>
                              </div>
                              <div className="text-center">
                                <div className="text-xs text-zinc-500 mb-1">Ranking</div>
                                <div className={`text-lg font-bold ${metrics.ranking_score > 0 ? 'text-yellow-400' : 'text-zinc-600'}`}>
                                  {metrics.ranking_score}%
                                </div>
                              </div>
                              <div className="text-center">
                                <div className="text-xs text-zinc-500 mb-1">Overall</div>
                                <div className="text-lg font-bold text-emerald-400">
                                  {metrics.recommendation_score}%
                                </div>
                              </div>
                            </div>
                          )}
                          
                          {/* AI Response */}
                          <AIResponse 
                            content={result.ai_response_raw}
                            brandVariations={projectInfo?.brand_variations}
                            domain={projectInfo?.domain}
                            keywords={projectInfo?.target_keywords}
                          />
                          
                          {/* Token Stats */}
                          <div className="mt-4 pt-4 border-t border-zinc-800 flex items-center gap-4 text-xs text-zinc-500">
                            <span>Input: {result.input_tokens?.toLocaleString()} tokens</span>
                            <span>Output: {result.output_tokens?.toLocaleString()} tokens</span>
                            <span>Cost: ${result.cost_usd?.toFixed(4)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      </div>
    </>
  )
}
