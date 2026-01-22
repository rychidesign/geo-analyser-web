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
  Sparkles
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ProjectQuery } from '@/lib/db/schema'

const QUERY_TYPES = [
  { value: 'informational', label: 'Informational' },
  { value: 'transactional', label: 'Transactional' },
  { value: 'comparison', label: 'Comparison' },
]

export default function QueriesPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  
  const [queries, setQueries] = useState<ProjectQuery[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  
  const [newQuery, setNewQuery] = useState('')
  const [newQueryType, setNewQueryType] = useState('informational')

  useEffect(() => {
    loadQueries()
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
    setError(null)
    setSuccess(null)
    
    try {
      const res = await fetch(`/api/projects/${projectId}/queries/generate`, {
        method: 'POST',
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        setError(data.error || 'Failed to generate queries')
        return
      }
      
      setQueries([...queries, ...data.queries])
      setSuccess(`Generated ${data.queries.length} queries using ${data.generation.provider} (cost: $${data.generation.cost?.toFixed(4) || '0.0000'})`)
      
      // Clear success message after 5 seconds
      setTimeout(() => setSuccess(null), 5000)
    } catch (err) {
      console.error('Error generating queries:', err)
      setError('Failed to generate queries. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <>
      {/* Header */}
      <div className="shrink-0 bg-zinc-950 border-b border-zinc-800/50" style={{ padding: '16px 32px' }}>
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
              <h1 className="text-xl font-semibold">Test Queries</h1>
              <p className="text-sm text-zinc-400">Manage queries that will be tested against AI models.</p>
            </div>
          </div>
          <Button 
            variant="outline" 
            onClick={generateQueries}
            disabled={generating}
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
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-4xl">

      {/* Error message */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-4 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Success message */}
      {success && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm p-4 rounded-lg mb-6">
          {success}
        </div>
      )}

      {/* Add New Query */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Add Query</CardTitle>
          <CardDescription>
            Add a new test query manually
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                placeholder="Enter a query, e.g., 'Best project management tools for startups'"
                value={newQuery}
                onChange={(e) => setNewQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addQuery()}
              />
            </div>
            <select
              value={newQueryType}
              onChange={(e) => setNewQueryType(e.target.value)}
              className="h-9 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-600"
            >
              {QUERY_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            <Button onClick={addQuery} disabled={saving || !newQuery.trim()}>
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

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
    </>
  )
}
