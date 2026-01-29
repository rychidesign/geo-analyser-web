'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Loader2,
  MessageSquare,
  Sparkles,
  Settings,
  ExternalLink
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ProjectQuery } from '@/lib/db/schema'
import { useToast } from '@/components/ui/toast'
import { MODEL_PRICING } from '@/lib/llm/types'

const QUERY_TYPES = [
  { value: 'informational', label: 'Informational' },
  { value: 'transactional', label: 'Transactional' },
  { value: 'comparison', label: 'Comparison' },
]

const MODEL_LABELS: Record<string, string> = {
  'gpt-5-mini': 'GPT-5 Mini',
  'gpt-5-2': 'GPT-5.2',
  'claude-haiku-4-5': 'Claude Haiku 4.5',
  'claude-sonnet-4-5': 'Claude Sonnet 4.5',
  'claude-opus-4-5': 'Claude Opus 4.5',
  'gemini-2-5-flash-lite': 'Gemini 2.5 Flash Lite',
  'gemini-2-5-flash': 'Gemini 2.5 Flash',
  'gemini-3-flash-preview': 'Gemini 3 Flash Preview',
}

export default function QueriesPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  const { showSuccess, showError } = useToast()
  
  const [queries, setQueries] = useState<ProjectQuery[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  
  const [newQuery, setNewQuery] = useState('')
  const [newQueryType, setNewQueryType] = useState('informational')
  
  const [queryCount, setQueryCount] = useState(5)
  const [generationModel, setGenerationModel] = useState<string | null>(null)
  const [loadingSettings, setLoadingSettings] = useState(true)

  // Estimate cost for query generation
  // Estimated tokens: ~800 input (prompt), ~40 output per query
  const estimatedCost = generationModel && MODEL_PRICING[generationModel]
    ? (() => {
        const pricing = MODEL_PRICING[generationModel]
        const inputTokens = 800
        const outputTokens = queryCount * 40
        const cost = (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output
        return cost
      })()
    : null

  useEffect(() => {
    loadQueries()
    loadHelperSettings()
  }, [projectId])

  const loadQueries = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/queries`)
      if (res.ok) {
        const data = await res.json()
        setQueries(data)
      }
    } catch (error) {
      console.error('Error loading queries:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadHelperSettings = async () => {
    try {
      const res = await fetch('/api/settings/helpers')
      if (res.ok) {
        const data = await res.json()
        setGenerationModel(data.query_generation_model || 'gpt-5-mini')
      }
    } catch (error) {
      console.error('Error loading helper settings:', error)
    } finally {
      setLoadingSettings(false)
    }
  }

  const addQuery = async () => {
    if (!newQuery.trim()) return
    
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/queries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query_text: newQuery.trim(),
          query_type: newQueryType,
        }),
      })
      
      if (res.ok) {
        const query = await res.json()
        setQueries([...queries, query])
        setNewQuery('')
      }
    } catch (error) {
      console.error('Error adding query:', error)
    } finally {
      setSaving(false)
    }
  }

  const deleteQuery = async (queryId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/queries/${queryId}`, {
        method: 'DELETE',
      })
      
      if (res.ok) {
        setQueries(queries.filter(q => q.id !== queryId))
      }
    } catch (error) {
      console.error('Error deleting query:', error)
    }
  }

  const generateQueries = async () => {
    setGenerating(true)
    
    try {
      const res = await fetch(`/api/projects/${projectId}/queries/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: queryCount }),
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        showError(data.error || 'Failed to generate queries')
        return
      }
      
      setQueries([...queries, ...data.queries])
      showSuccess(`Generated ${data.queries.length} queries using ${data.generation.provider} (cost: $${data.generation.cost?.toFixed(4) || '0.0000'})`)
    } catch (err) {
      console.error('Error generating queries:', err)
      showError('Failed to generate queries. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <>
      {/* Header */}
      <div className="bg-zinc-950 border-b border-zinc-800/50 lg:shrink-0 px-4 py-4 lg:px-8">
        <div className="flex items-center gap-6">
          <Link 
            href={`/dashboard/projects/${projectId}`}
            className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Project
          </Link>
          <div>
            <h1 className="text-xl font-semibold">Test Queries</h1>
            <p className="text-sm text-zinc-400">Manage queries that will be tested against AI models.</p>
          </div>
        </div>
      </div>

      {/* Content - Two Column Layout */}
      <div className="px-4 py-4 lg:px-8 lg:flex-1 lg:overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-7xl">
          
          {/* Left Column - Generate & Add Queries */}
          <div className="lg:col-span-4 space-y-6">
            {/* Generate Queries */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-400" />
                  <CardTitle>Generate Queries</CardTitle>
                </div>
                <CardDescription>
                  Use AI to automatically generate test queries based on your project settings.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Number of Queries */}
                <div className="space-y-2">
                  <Label htmlFor="query-count">Number of queries</Label>
                  <Input
                    id="query-count"
                    type="number"
                    min={1}
                    max={20}
                    value={queryCount}
                    onChange={(e) => setQueryCount(Math.min(20, Math.max(1, parseInt(e.target.value) || 1)))}
                    className="w-full"
                  />
                  <p className="text-xs text-zinc-500">Generate between 1-20 queries at once</p>
                </div>

                {/* Model Info */}
                <div className="space-y-2">
                  <Label className="text-zinc-400">Generation model</Label>
                  <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
                    {loadingSettings ? (
                      <div className="flex items-center gap-2 text-sm text-zinc-400">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading...
                      </div>
                    ) : (
                      <span className="text-sm font-medium">
                        {generationModel ? MODEL_LABELS[generationModel] || generationModel : 'Not configured'}
                      </span>
                    )}
                    <Link 
                      href="/dashboard/settings"
                      className="inline-flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors"
                    >
                      <Settings className="w-3 h-3" />
                      Change
                    </Link>
                  </div>
                  {estimatedCost !== null && (
                    <p className="text-xs text-zinc-500">
                      Estimated cost: ~${estimatedCost < 0.0001 ? '<0.0001' : estimatedCost.toFixed(4)}
                    </p>
                  )}
                </div>

                {/* Generate Button */}
                <Button 
                  onClick={generateQueries}
                  disabled={generating || !generationModel}
                  className="w-full bg-purple-600 hover:bg-purple-700"
                  size="lg"
                >
                  {generating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      AI Generate
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Add New Query */}
            <Card>
              <CardHeader>
                <CardTitle>Add Query Manually</CardTitle>
                <CardDescription>
                  Add a custom test query
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-query">Query text</Label>
                  <Input
                    id="new-query"
                    placeholder="e.g., 'Best project management tools for startups'"
                    value={newQuery}
                    onChange={(e) => setNewQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addQuery()}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="query-type">Query type</Label>
                  <select
                    id="query-type"
                    value={newQueryType}
                    onChange={(e) => setNewQueryType(e.target.value)}
                    className="w-full h-9 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                  >
                    {QUERY_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>
                <Button onClick={addQuery} disabled={saving || !newQuery.trim()} className="w-full">
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  Add Query
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Queries List */}
          <div className="lg:col-span-8">
            {/* Queries List */}
            <Card>
              <CardHeader>
                <CardTitle>Queries ({queries.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
                  </div>
                ) : queries.length > 0 ? (
                  <div className="space-y-2">
                    {queries.map((query) => (
                      <div 
                        key={query.id}
                        className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg group"
                      >
                        <div className="flex-1">
                          <p className="text-sm">{query.query_text}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          {query.is_ai_generated && (
                            <span className="text-xs text-purple-400 px-2 py-1 bg-purple-500/10 rounded flex items-center gap-1">
                              <Sparkles className="w-3 h-3" />
                              AI
                            </span>
                          )}
                          <span className="text-xs text-zinc-500 capitalize px-2 py-1 bg-zinc-800 rounded">
                            {query.query_type}
                          </span>
                          <button
                            onClick={() => deleteQuery(query.id)}
                            className="text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <MessageSquare className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                    <p className="text-zinc-500 mb-2">No queries yet</p>
                    <p className="text-zinc-600 text-sm">
                      Add queries manually or use AI to generate them automatically.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  )
}
