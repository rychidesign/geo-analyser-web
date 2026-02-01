'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { 
  ArrowLeft, 
  Loader2,
  CheckCircle,
  XCircle,
  StopCircle,
  Clock,
  DollarSign,
  Eye,
  EyeOff,
  TrendingUp,
  Cpu,
  Trash2,
  Target,
  Smile,
  MessageCircle,
  ChevronRight,
  Link2
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

  // Group results by query and model to create conversation chains
  const resultsByQueryAndModel = results.reduce((acc, result) => {
    const key = `${result.query_text}|||${result.model}`
    if (!acc[key]) {
      acc[key] = []
    }
    acc[key].push(result)
    return acc
  }, {} as Record<string, ScanResult[]>)

  // Sort each group by follow_up_level
  Object.values(resultsByQueryAndModel).forEach(group => {
    group.sort((a, b) => (a.follow_up_level || 0) - (b.follow_up_level || 0))
  })

  // Group by query for display
  const resultsByQuery = results.reduce((acc, result) => {
    if (!acc[result.query_text]) {
      acc[result.query_text] = []
    }
    // Only add initial results (level 0) to avoid duplicates
    if ((result.follow_up_level || 0) === 0) {
      acc[result.query_text].push(result)
    }
    return acc
  }, {} as Record<string, ScanResult[]>)

  // Check if this scan has follow-ups
  const hasFollowUps = results.some(r => (r.follow_up_level || 0) > 0)
  const maxFollowUpLevel = Math.max(...results.map(r => r.follow_up_level || 0))

  // Follow-up level colors (gray shades - lighter for follow-ups)
  const LEVEL_COLORS = {
    0: { bg: 'bg-zinc-500', text: 'text-zinc-400', label: 'Initial' },
    1: { bg: 'bg-zinc-400', text: 'text-zinc-300', label: 'F1' },
    2: { bg: 'bg-zinc-300', text: 'text-zinc-200', label: 'F2' },
    3: { bg: 'bg-zinc-200', text: 'text-zinc-100', label: 'F3' },
  } as const

  // Get conversation chain for a result
  const getConversationChain = (queryText: string, model: string): ScanResult[] => {
    const key = `${queryText}|||${model}`
    return resultsByQueryAndModel[key] || []
  }

  // Calculate ranking only from results where ranking > 0 (not n/a)
  const calculatedRanking = (() => {
    const resultsWithRanking = results.filter(r => {
      const metrics = r.metrics_json as ScanMetrics | null
      return metrics && metrics.visibility_score > 0 && metrics.ranking_score > 0
    })
    if (resultsWithRanking.length === 0) return null
    const sum = resultsWithRanking.reduce((acc, r) => {
      const metrics = r.metrics_json as ScanMetrics
      return acc + metrics.ranking_score
    }, 0)
    return Math.round(sum / resultsWithRanking.length)
  })()

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
                  scan.status === 'failed' || scan.status === 'stopped' ? 'text-red-400' :
                  'text-yellow-400'
                }`}>
                  {scan.status === 'completed' ? <CheckCircle className="w-4 h-4" /> :
                   scan.status === 'failed' ? <XCircle className="w-4 h-4" /> :
                   scan.status === 'stopped' ? <StopCircle className="w-4 h-4" /> :
                   <Loader2 className="w-4 h-4 animate-spin" />}
                  {scan.status === 'stopped' ? 'Stopped' : scan.status}
                </span>
                <Badge className="gap-1 border-0 bg-purple-500/10 text-purple-400">
                  <Cpu className="w-3 h-3" /> AI Evaluated
                </Badge>
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
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {/* 1. Overall Score */}
        <Card style={{ background: 'linear-gradient(to top, #18181b, rgba(24, 24, 27, 0.5))' }}>
          <CardHeader className="pb-0">
            <div className="flex items-start justify-between">
              <div className="text-2xl font-bold text-emerald-400">
                {(scan.overall_score ?? 0).toFixed(1)}%
              </div>
              <Target className="w-4 h-4 text-zinc-400" />
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-xs font-medium text-zinc-300 mb-1">Overall Score</div>
            {scan.follow_up_active && scan.conversational_bonus !== null && scan.conversational_bonus !== 0 ? (
              <p className="text-xs text-zinc-500">
                Base {scan.initial_score}% {scan.conversational_bonus > 0 ? '+' : ''}{scan.conversational_bonus}% (incl. persistence)
              </p>
            ) : (
              <p className="text-xs text-zinc-500">Combined brand recommendation score.</p>
            )}
          </CardContent>
        </Card>

        {/* 2. Visibility */}
        <Card style={{ background: 'linear-gradient(to top, #18181b, rgba(24, 24, 27, 0.5))' }}>
          <CardHeader className="pb-0">
            <div className="flex items-start justify-between">
              <div className={`text-2xl font-bold ${(scan.avg_visibility ?? 0) > 0 ? 'text-blue-400' : 'text-zinc-600'}`}>
                {scan.avg_visibility ?? 0}%
              </div>
              <Eye className="w-4 h-4 text-zinc-400" />
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-xs font-medium text-zinc-300 mb-1">Visibility</div>
            <p className="text-xs text-zinc-500">Brand mention (50%) + domain mention (50%).</p>
          </CardContent>
        </Card>

        {/* 3. Persistence - upsell card when follow-ups not active */}
        {scan.follow_up_active ? (
          <Card style={{ background: 'linear-gradient(to top, #18181b, rgba(24, 24, 27, 0.5))' }}>
            <CardHeader className="pb-0">
              <div className="flex items-start justify-between">
                <div className={`text-2xl font-bold ${
                  (scan.brand_persistence ?? 0) >= 50 ? 'text-cyan-400' : 'text-zinc-600'
                }`}>
                  {scan.brand_persistence ?? 0}%
                </div>
                <Link2 className="w-4 h-4 text-zinc-400" />
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="text-xs font-medium text-zinc-300 mb-1">Persistence</div>
              <p className="text-xs text-zinc-500">
                How often brand stays mentioned in follow-ups.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Link href={`/dashboard/projects/${projectId}/settings`}>
            <Card 
              className="opacity-50 hover:opacity-75 transition-opacity cursor-pointer group h-full"
              style={{ background: 'linear-gradient(to top, #18181b, rgba(24, 24, 27, 0.3))' }}
            >
              <CardHeader className="pb-0">
                <div className="flex items-start justify-between">
                  <div className="text-2xl font-bold text-zinc-600">
                    off
                  </div>
                  <Link2 className="w-4 h-4 text-zinc-600" />
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="text-xs font-medium text-zinc-400 mb-1">Persistence</div>
                <p className="text-xs text-zinc-600 group-hover:text-zinc-500">
                  Enable follow-up queries →
                </p>
              </CardContent>
            </Card>
          </Link>
        )}

        {/* 4. Sentiment */}
        <Card style={{ background: 'linear-gradient(to top, #18181b, rgba(24, 24, 27, 0.5))' }}>
          <CardHeader className="pb-0">
            <div className="flex items-start justify-between">
              <div className={`text-2xl font-bold ${
                (scan.avg_visibility ?? 0) === 0 || scan.avg_sentiment === null ? 'text-zinc-600' : 'text-amber-400'
              }`}>
                {(scan.avg_visibility ?? 0) > 0 && scan.avg_sentiment !== null ? `${scan.avg_sentiment}%` : 'n/a'}
              </div>
              <Smile className="w-4 h-4 text-zinc-400" />
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-xs font-medium text-zinc-300 mb-1">Sentiment</div>
            <p className="text-xs text-zinc-500">How positively AI talks about brand. 50% = neutral.</p>
          </CardContent>
        </Card>

        {/* 5. Ranking */}
        <Card style={{ background: 'linear-gradient(to top, #18181b, rgba(24, 24, 27, 0.5))' }}>
          <CardHeader className="pb-0">
            <div className="flex items-start justify-between">
              <div className={`text-2xl font-bold ${
                calculatedRanking !== null ? 'text-pink-400' : 'text-zinc-600'
              }`}>
                {calculatedRanking !== null ? `${calculatedRanking}%` : 'n/a'}
              </div>
              <TrendingUp className="w-4 h-4 text-zinc-400" />
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-xs font-medium text-zinc-300 mb-1">Ranking</div>
            <p className="text-xs text-zinc-500">Position in list. 100% = 1st, 80% = 2nd, etc.</p>
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
                {queryResults.map((initialResult) => {
                  const conversationChain = getConversationChain(initialResult.query_text, initialResult.model)
                  const isExpanded = expandedResults.has(initialResult.id)
                  const totalChainCost = conversationChain.reduce((sum, r) => sum + (r.cost_usd || 0), 0)

                  // Calculate average metrics across the chain for header display
                  const chainMetrics = conversationChain
                    .filter(r => r.metrics_json)
                    .map(r => r.metrics_json as ScanMetrics)
                  
                  const avgVisibility = chainMetrics.length > 0 
                    ? Math.round(chainMetrics.reduce((sum, m) => sum + m.visibility_score, 0) / chainMetrics.length)
                    : null
                  const avgRecommendation = chainMetrics.length > 0
                    ? Math.round(chainMetrics.reduce((sum, m) => sum + m.recommendation_score, 0) / chainMetrics.length * 10) / 10
                    : null
                  const avgSentiment = chainMetrics.filter(m => m.visibility_score > 0 && m.sentiment_score !== null).length > 0
                    ? Math.round(chainMetrics.filter(m => m.visibility_score > 0).reduce((sum, m) => sum + (m.sentiment_score ?? 0), 0) / chainMetrics.filter(m => m.visibility_score > 0 && m.sentiment_score !== null).length)
                    : null
                  const avgRanking = chainMetrics.filter(m => m.visibility_score > 0 && m.ranking_score > 0).length > 0
                    ? Math.round(chainMetrics.filter(m => m.ranking_score > 0).reduce((sum, m) => sum + m.ranking_score, 0) / chainMetrics.filter(m => m.ranking_score > 0).length)
                    : null
                  
                  // Calculate persistence for this chain
                  const chainPersistence = conversationChain.length > 1
                    ? Math.round((chainMetrics.filter(m => m.visibility_score > 0).length / chainMetrics.length) * 100)
                    : null

                  return (
                    <div 
                      key={initialResult.id}
                      className="border border-zinc-800 rounded-lg overflow-hidden"
                    >
                      {/* Result Header */}
                      <div 
                        className="flex items-center justify-between p-4 bg-zinc-800/50 cursor-pointer hover:bg-zinc-800"
                        onClick={() => toggleExpand(initialResult.id)}
                      >
                        <div className="flex items-center gap-4">
                          <span className="font-medium capitalize">{initialResult.provider}</span>
                          <span className="text-sm text-zinc-500">{initialResult.model}</span>
                          {conversationChain.length > 1 && (
                            <Badge variant="secondary" className="gap-1 text-xs">
                              <MessageCircle className="w-3 h-3" />
                              {conversationChain.length} messages
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          {avgVisibility !== null && (
                            <>
                              {/* Visibility */}
                              <span className={`flex items-center gap-1 text-xs ${
                                avgVisibility > 0 ? 'text-blue-400' : 'text-zinc-500'
                              }`}>
                                {avgVisibility > 0 ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                                {avgVisibility}%
                              </span>
                              {/* Persistence (if follow-ups) */}
                              {chainPersistence !== null && (
                                <span className={`flex items-center gap-1 text-xs ${
                                  chainPersistence >= 50 ? 'text-cyan-400' : 'text-zinc-500'
                                }`}>
                                  <Link2 className="w-3.5 h-3.5" />
                                  {chainPersistence}%
                                </span>
                              )}
                              {/* Sentiment */}
                              <span className={`flex items-center gap-1 text-xs ${
                                avgSentiment !== null ? 'text-amber-400' : 'text-zinc-500'
                              }`}>
                                <Smile className="w-3.5 h-3.5" />
                                {avgSentiment !== null ? `${avgSentiment}%` : 'n/a'}
                              </span>
                              {/* Ranking */}
                              <span className={`flex items-center gap-1 text-xs ${
                                avgRanking !== null ? 'text-pink-400' : 'text-zinc-500'
                              }`}>
                                <TrendingUp className="w-3.5 h-3.5" />
                                {avgRanking !== null ? `${avgRanking}%` : 'n/a'}
                              </span>
                              {/* Overall Score */}
                              <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
                                <Target className="w-3.5 h-3.5" />
                                {avgRecommendation?.toFixed(1)}%
                              </span>
                            </>
                          )}
                          <span className="text-xs text-zinc-500">
                            ${totalChainCost.toFixed(4)}
                          </span>
                          <ChevronRight className={`w-4 h-4 text-zinc-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                        </div>
                      </div>

                      {/* Expanded Content */}
                      {isExpanded && (
                        <div className="p-4 border-t border-zinc-800">
                          {/* Conversation Chain - Chat Style */}
                          <div className="space-y-8">
                            {conversationChain.map((result, index) => {
                              const metrics = result.metrics_json as ScanMetrics | null
                              const level = result.follow_up_level || 0
                              const levelColor = LEVEL_COLORS[level as keyof typeof LEVEL_COLORS] || LEVEL_COLORS[0]
                              const isInitial = level === 0
                              const queryText = isInitial ? query : result.follow_up_query_used
                              
                              // Query bubble colors based on level (gray shades)
                              const queryBubbleColors = {
                                0: 'bg-zinc-700/50',      // Initial
                                1: 'bg-zinc-600/50',      // F1 - lighter
                                2: 'bg-zinc-500/50',      // F2 - even lighter
                                3: 'bg-zinc-400/50',      // F3 - lightest
                              } as const
                              const queryBubbleBg = queryBubbleColors[level as keyof typeof queryBubbleColors] || queryBubbleColors[0]
                              
                              return (
                                <div key={result.id} className="space-y-5">
                                  {/* User Message (Query) */}
                                  <div className="flex justify-end">
                                    <div className="max-w-[80%] flex flex-col items-end gap-2.5">
                                      <div className="flex items-center gap-2">
                                        <Badge 
                                          variant="secondary" 
                                          className={`text-xs ${levelColor.bg}/20 ${levelColor.text} border-0`}
                                        >
                                          {levelColor.label}
                                        </Badge>
                                        <span className="text-xs text-zinc-500">User</span>
                                      </div>
                                      <div className={`${queryBubbleBg} rounded-2xl rounded-tr-sm px-6 py-4`}>
                                        <p className="text-sm text-zinc-200">{queryText}</p>
                                      </div>
                                    </div>
                                  </div>
                                  
                                  {/* AI Response */}
                                  <div className="flex justify-start">
                                    <div className="max-w-[80%] flex flex-col items-start gap-2.5">
                                      <div className="flex items-center gap-3">
                                        <span className="text-xs text-zinc-500 capitalize">{initialResult.model}</span>
                                        {/* Metrics Inline */}
                                        {metrics && (
                                          <div className="flex items-center gap-2 text-xs flex-wrap">
                                            <span className={`px-2 py-1 rounded-md ${metrics.visibility_score > 0 ? 'bg-blue-500/15 text-blue-400' : 'bg-zinc-800/50 text-zinc-600'}`}>
                                              <Eye className="w-3 h-3 inline mr-1" />
                                              {metrics.visibility_score}%
                                            </span>
                                            {/* Persistence tag for follow-up responses */}
                                            {!isInitial && (
                                              <span className={`px-2 py-1 rounded-md ${metrics.visibility_score > 0 ? 'bg-cyan-500/15 text-cyan-400' : 'bg-zinc-800/50 text-zinc-600'}`}>
                                                <Link2 className="w-3 h-3 inline mr-1" />
                                                {metrics.visibility_score > 0 ? 'Persisted' : 'Lost'}
                                              </span>
                                            )}
                                            {metrics.visibility_score > 0 && (
                                              <>
                                                <span className={`px-2 py-1 rounded-md ${metrics.sentiment_score !== null ? 'bg-amber-500/15 text-amber-400' : 'bg-zinc-800/50 text-zinc-600'}`}>
                                                  <Smile className="w-3 h-3 inline mr-1" />
                                                  {metrics.sentiment_score !== null ? `${metrics.sentiment_score}%` : 'n/a'}
                                                </span>
                                                <span className={`px-2 py-1 rounded-md ${metrics.ranking_score > 0 ? 'bg-pink-500/15 text-pink-400' : 'bg-zinc-800/50 text-zinc-600'}`}>
                                                  <TrendingUp className="w-3 h-3 inline mr-1" />
                                                  {metrics.ranking_score > 0 ? `${metrics.ranking_score}%` : 'n/a'}
                                                </span>
                                              </>
                                            )}
                                            <span className={`px-2 py-1 rounded-md ${metrics.recommendation_score > 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-zinc-800/50 text-zinc-600'}`}>
                                              <Target className="w-3 h-3 inline mr-1" />
                                              {metrics.recommendation_score.toFixed(1)}%
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                      <div className="bg-zinc-800/40 rounded-2xl rounded-tl-sm px-6 py-5">
                                        <AIResponse 
                                          content={result.ai_response_raw}
                                          brandVariations={projectInfo?.brand_variations}
                                          domain={projectInfo?.domain}
                                          keywords={projectInfo?.target_keywords}
                                        />
                                        {/* Token Stats */}
                                        <div className="mt-5 pt-4 border-t border-zinc-700/30 flex items-center gap-4 text-xs text-zinc-500">
                                          <span>{result.input_tokens?.toLocaleString()} → {result.output_tokens?.toLocaleString()} tokens</span>
                                          <span>${result.cost_usd?.toFixed(4)}</span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
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
