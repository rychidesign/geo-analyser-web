'use client'

import React, { useState, useEffect } from 'react'
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
  ExternalLink,
  Save
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import type { ProjectQuery, Project } from '@/lib/db/schema'
import { useToast } from '@/components/ui/toast'
import { MODEL_PRICING, AVAILABLE_MODELS } from '@/lib/ai'
import { usePricing } from '@/lib/hooks/use-pricing'

const QUERY_TYPES = [
  { value: 'informational', label: 'Informational' },
  { value: 'transactional', label: 'Transactional' },
  { value: 'comparison', label: 'Comparison' },
]

// Recommended models for QUERY GENERATION - newer, more capable models for quality queries
const RECOMMENDED_GENERATION_MODELS = [
  'claude-sonnet-4-5',
  'gpt-5-2',
  'sonar-reasoning-pro',
]


export default function QueriesPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  const { showSuccess, showError } = useToast()
  
  const [queries, setQueries] = useState<ProjectQuery[]>([])
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingModel, setSavingModel] = useState(false)
  const [generating, setGenerating] = useState(false)
  
  const [newQuery, setNewQuery] = useState('')
  const [newQueryType, setNewQueryType] = useState('informational')
  
  const [queryCount, setQueryCount] = useState(5)
  const [generationModel, setGenerationModel] = useState<string>('gpt-5-mini')

  // Fetch pricing from API
  const { pricing, isLoading: pricingLoading } = usePricing()

  // Build helper models list from pricing data (for query generation)
  const generationModels = React.useMemo(() => {
    if (pricing.length === 0) {
      return AVAILABLE_MODELS
        .map(m => ({
          value: m.id,
          label: m.name,
          cheapest: false,
          recommended: RECOMMENDED_GENERATION_MODELS.includes(m.id),
        }))
    }
    
    // Find the cheapest model based on total cost (input + output)
    const activeModels = pricing.filter(p => p.is_active)
    const cheapestModel = activeModels.reduce((min, p) => {
      const totalCost = p.input_cost_cents + p.output_cost_cents
      const minCost = min.input_cost_cents + min.output_cost_cents
      return totalCost < minCost ? p : min
    }, activeModels[0])
    
    return activeModels
      .map(p => {
        const modelInfo = AVAILABLE_MODELS.find(m => m.id === p.model)
        return {
          value: p.model,
          label: modelInfo?.name || p.model,
          cheapest: p.model === cheapestModel?.model,
          recommended: RECOMMENDED_GENERATION_MODELS.includes(p.model),
        }
      })
      .sort((a, b) => {
        // Sort: recommended first, then cheapest, then by label
        if (a.recommended !== b.recommended) return a.recommended ? -1 : 1
        if (a.cheapest !== b.cheapest) return a.cheapest ? -1 : 1
        return a.label.localeCompare(b.label)
      })
  }, [pricing])

  // Estimate cost for query generation
  const estimatedCost = React.useMemo(() => {
    if (!generationModel || !MODEL_PRICING[generationModel]) return null
    const pricing = MODEL_PRICING[generationModel]
    const inputTokens = 800
    const outputTokens = queryCount * 40
    return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output
  }, [generationModel, queryCount])

  useEffect(() => {
    loadProjectAndQueries()
  }, [projectId])

  const loadProjectAndQueries = async () => {
    try {
      // Load project settings and queries in parallel
      const [projectRes, queriesRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/projects/${projectId}/queries`)
      ])
      
      if (projectRes.ok) {
        const projectData = await projectRes.json()
        setProject(projectData)
        setGenerationModel(projectData.query_generation_model || 'gpt-5-mini')
      }
      
      if (queriesRes.ok) {
        const queriesData = await queriesRes.json()
        setQueries(queriesData)
      }
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const saveGenerationModel = async (model: string) => {
    setSavingModel(true)
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query_generation_model: model }),
      })
      
      if (res.ok) {
        setGenerationModel(model)
        showSuccess('Query generation model updated')
      } else {
        showError('Failed to save model setting')
      }
    } catch (error) {
      console.error('Error saving model:', error)
      showError('Failed to save model setting')
    } finally {
      setSavingModel(false)
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
      showSuccess(`Generated ${data.queries.length} queries using ${data.generation.provider} (cost: $${data.generation.costUsd?.toFixed(4) || '0.0000'})`)
      
      // Refresh credits in sidebar
      window.dispatchEvent(new Event('credits-updated'))
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

                {/* Model Selector */}
                <div className="space-y-2">
                  <Label htmlFor="gen-model">Generation model</Label>
                  <Select 
                    value={generationModel} 
                    onValueChange={saveGenerationModel}
                    disabled={savingModel || pricingLoading}
                  >
                    <SelectTrigger id="gen-model" className="w-full">
                      <SelectValue placeholder="Select model..." />
                    </SelectTrigger>
                    <SelectContent>
                      {generationModels.map((model) => (
                        <SelectItem key={model.value} value={model.value}>
                          <div className="flex items-center gap-2">
                            <span>{model.label}</span>
                            {model.recommended && (
                              <Badge variant="secondary" className="text-xs bg-emerald-500/20 text-emerald-400">Recommended</Badge>
                            )}
                            {model.cheapest && !model.recommended && (
                              <Badge variant="secondary" className="text-xs text-zinc-500">Cheapest</Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center justify-between">
                    {estimatedCost !== null && (
                      <p className="text-xs text-zinc-500">
                        Estimated cost: ~${estimatedCost < 0.0001 ? '<0.0001' : estimatedCost.toFixed(4)}
                      </p>
                    )}
                    {savingModel && (
                      <div className="flex items-center gap-1 text-xs text-zinc-400">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Saving...
                      </div>
                    )}
                  </div>
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
