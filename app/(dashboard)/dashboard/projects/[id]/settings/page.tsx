'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { 
  ArrowLeft, 
  Loader2,
  Save,
  Trash2,
  AlertTriangle,
  AlertCircle,
  Check,
  Cpu,
  Plus,
  X,
  Calendar,
  Clock,
  MessageCircle,
  Info,
  Lock
} from 'lucide-react'
// Note: Evaluation method removed - always uses AI evaluation
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { AVAILABLE_MODELS, getModelsByProvider, type LLMProvider } from '@/lib/ai'
import { usePricing } from '@/lib/hooks/use-pricing'
import type { Project } from '@/lib/db/schema'

// Recommended models for SCANNING - newest, most capable models for testing queries
const RECOMMENDED_SCAN_MODELS = [
  'gpt-5-2',
  'claude-sonnet-4-5',
  'claude-opus-4-5',
  'gemini-3-flash-preview',
  'sonar-reasoning-pro',
]

// Recommended models for QUERY GENERATION - newer, more capable models for quality queries
const RECOMMENDED_GENERATION_MODELS = [
  'claude-sonnet-4-5',
  'gpt-5-2',
  'sonar-reasoning-pro',
]

// Recommended models for EVALUATION - reliable models for accurate scoring
const RECOMMENDED_EVALUATION_MODELS = [
  'claude-sonnet-4-5',
  'gemini-2-5-flash',
  'sonar-reasoning-pro',
  'gpt-5-mini',
]


// Models that are unreliable for evaluation (chain-of-thought with truncation issues)
const UNRELIABLE_FOR_EVALUATION = ['gpt-5-nano']

const PROVIDERS: { id: LLMProvider; name: string }[] = [
  { id: 'openai', name: 'OpenAI' },
  { id: 'anthropic', name: 'Anthropic' },
  { id: 'google', name: 'Google AI' },
  { id: 'groq', name: 'Groq' },
  { id: 'perplexity', name: 'Perplexity' },
]

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'cs', label: 'Czech' },
  { value: 'sk', label: 'Slovak' },
  { value: 'de', label: 'German' },
  { value: 'pl', label: 'Polish' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
]

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
]


export default function ProjectSettingsPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [userTier, setUserTier] = useState<'free' | 'paid' | 'test' | 'admin'>('free')
  
  // Fetch pricing from API (centralized pricing)
  const { pricing, isLoading: pricingLoading, error: pricingError } = usePricing()
  
  // Build price map from API data
  const priceMap = useMemo(() => {
    const map: Record<string, { input: number; output: number }> = {}
    for (const p of pricing) {
      map[p.model] = {
        input: p.input_cost_cents / 100,  // Convert cents to USD
        output: p.output_cost_cents / 100,
      }
    }
    return map
  }, [pricing])

  // Build helper models list from pricing data
  const helperModelsData = useMemo(() => {
    if (pricing.length === 0) {
      // Fallback to AVAILABLE_MODELS if pricing not loaded yet
      return {
        models: AVAILABLE_MODELS
          .map(m => ({
            value: m.id,
            label: m.name,
            provider: m.provider,
            unreliableForEval: UNRELIABLE_FOR_EVALUATION.includes(m.id),
          })),
        cheapestModel: null as string | null,
      }
    }
    
    // Find the cheapest model based on total cost (input + output)
    const activeModels = pricing.filter(p => p.is_active)
    const cheapestModel = activeModels.reduce((min, p) => {
      const totalCost = p.input_cost_cents + p.output_cost_cents
      const minCost = min.input_cost_cents + min.output_cost_cents
      return totalCost < minCost ? p : min
    }, activeModels[0])
    
    return {
      models: activeModels.map(p => {
        const modelInfo = AVAILABLE_MODELS.find(m => m.id === p.model)
        return {
          value: p.model,
          label: modelInfo?.name || p.model,
          provider: p.provider,
          unreliableForEval: UNRELIABLE_FOR_EVALUATION.includes(p.model),
        }
      }),
      cheapestModel: cheapestModel?.model || null,
    }
  }, [pricing])
  
  // Models for query generation (sorted: recommended first)
  const generationModels = useMemo(() => {
    return helperModelsData.models
      .map(m => ({
        ...m,
        cheapest: m.value === helperModelsData.cheapestModel,
        recommended: RECOMMENDED_GENERATION_MODELS.includes(m.value),
      }))
      .sort((a, b) => {
        if (a.recommended !== b.recommended) return a.recommended ? -1 : 1
        if (a.cheapest !== b.cheapest) return a.cheapest ? -1 : 1
        return a.provider.localeCompare(b.provider)
      })
  }, [helperModelsData])
  
  // Models for evaluation (sorted: recommended first, exclude unreliable)
  const evaluationModels = useMemo(() => {
    return helperModelsData.models
      .map(m => ({
        ...m,
        cheapest: m.value === helperModelsData.cheapestModel,
        recommended: RECOMMENDED_EVALUATION_MODELS.includes(m.value),
      }))
      .sort((a, b) => {
        if (a.recommended !== b.recommended) return a.recommended ? -1 : 1
        if (a.cheapest !== b.cheapest) return a.cheapest ? -1 : 1
        return a.provider.localeCompare(b.provider)
      })
  }, [helperModelsData])
  
  // Get price for a model (from API or fallback to hardcoded)
  const getDisplayPrice = (modelId: string) => {
    const apiPrice = priceMap[modelId]
    if (apiPrice) return apiPrice
    const model = AVAILABLE_MODELS.find(m => m.id === modelId)
    return model?.pricing || { input: 0, output: 0 }
  }
  
  // All providers are available since we use centralized API keys via Vercel AI Gateway
  const availableProviders: LLMProvider[] = ['openai', 'anthropic', 'google', 'groq', 'perplexity']
  
  // Form state
  const [name, setName] = useState('')
  const [domain, setDomain] = useState('')
  const [language, setLanguage] = useState('en')
  const [brandVariations, setBrandVariations] = useState<string[]>([])
  const [keywords, setKeywords] = useState<string[]>([])
  const [newBrand, setNewBrand] = useState('')
  const [newKeyword, setNewKeyword] = useState('')
  const [selectedModels, setSelectedModels] = useState<string[]>(['gpt-5-nano'])
  const [modelsChanged, setModelsChanged] = useState(false)
  
  // Scheduled scan state
  const [scheduledScanEnabled, setScheduledScanEnabled] = useState(false)
  const [scheduledFrequency, setScheduledFrequency] = useState<'daily' | 'weekly' | 'monthly'>('weekly')
  const [scheduledHour, setScheduledHour] = useState<number>(6)
  const [scheduledScanDay, setScheduledScanDay] = useState<number>(1) // Monday (for weekly)
  const [scheduledDayOfMonth, setScheduledDayOfMonth] = useState<number>(1) // 1st (for monthly)
  const [nextScheduledScan, setNextScheduledScan] = useState<string | null>(null)
  const [userTimezone, setUserTimezone] = useState<string>('UTC')
  
  // Follow-up queries state
  const [followUpEnabled, setFollowUpEnabled] = useState(false)
  const [followUpDepth, setFollowUpDepth] = useState<number>(1)
  
  // AI Helper models state
  const [queryGenerationModel, setQueryGenerationModel] = useState('gpt-5-mini')
  const [evaluationModel, setEvaluationModel] = useState('gpt-5-mini')

  useEffect(() => {
    loadProject()
  }, [projectId])

  const loadProject = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`)
      if (res.ok) {
        const data = await res.json()
        setProject(data)
        setName(data.name)
        setDomain(data.domain)
        setLanguage(data.language || 'en')
        setBrandVariations(data.brand_variations || [])
        setKeywords(data.target_keywords || [])
        setSelectedModels(data.selected_models || ['gpt-5-mini'])
        // Scheduled scan settings
        setScheduledScanEnabled(data.scheduled_scan_enabled || false)
        setScheduledFrequency(data.scheduled_scan_frequency || 'weekly')
        setScheduledHour(data.scheduled_scan_hour ?? 6)
        setScheduledScanDay(data.scheduled_scan_day ?? 1)
        setScheduledDayOfMonth(data.scheduled_scan_day_of_month ?? 1)
        setNextScheduledScan(data.next_scheduled_scan_at || null)
        // Follow-up settings
        setFollowUpEnabled(data.follow_up_enabled || false)
        setFollowUpDepth(data.follow_up_depth ?? 1)
        // AI Helper models
        setQueryGenerationModel(data.query_generation_model || 'gpt-5-mini')
        setEvaluationModel(data.evaluation_model || 'gpt-5-mini')
      }
      
      // Load user timezone and tier
      const profileRes = await fetch('/api/settings')
      if (profileRes.ok) {
        const profileData = await profileRes.json()
        setUserTimezone(profileData.timezone || 'UTC')
      }
      
      // Load user tier from credits API
      const creditsRes = await fetch('/api/credits')
      if (creditsRes.ok) {
        const creditsData = await creditsRes.json()
        setUserTier(creditsData.credits?.tier || 'free')
      }
    } catch (error) {
      console.error('Error loading project:', error)
    } finally {
      setLoading(false)
    }
  }

  const addBrand = () => {
    if (!newBrand.trim()) return
    const values = newBrand.split(',').map(v => v.trim()).filter(v => v.length > 0)
    setBrandVariations(prev => [...new Set([...prev, ...values])])
    setNewBrand('')
  }

  const removeBrand = (brand: string) => {
    setBrandVariations(prev => prev.filter(b => b !== brand))
  }

  const addKeyword = () => {
    if (!newKeyword.trim()) return
    const values = newKeyword.split(',').map(v => v.trim()).filter(v => v.length > 0)
    setKeywords(prev => [...new Set([...prev, ...values])])
    setNewKeyword('')
  }

  const removeKeyword = (keyword: string) => {
    setKeywords(prev => prev.filter(k => k !== keyword))
  }

  const toggleModel = (model: string) => {
    setSelectedModels(prev => {
      const newModels = prev.includes(model)
        ? prev.filter(m => m !== model)
        : [...prev, model]
      setModelsChanged(true)
      return newModels
    })
  }

  const saveSettings = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          domain,
          language,
          brand_variations: brandVariations,
          target_keywords: keywords,
          llm_models: selectedModels,
          scheduled_scan_enabled: scheduledScanEnabled,
          scheduled_scan_frequency: scheduledFrequency,
          scheduled_scan_hour: scheduledHour,
          scheduled_scan_day: scheduledScanDay,
          scheduled_scan_day_of_month: scheduledDayOfMonth,
          follow_up_enabled: followUpEnabled,
          follow_up_depth: followUpDepth,
          query_generation_model: queryGenerationModel,
          evaluation_model: evaluationModel,
        }),
      })
      
      if (res.ok) {
        const updated = await res.json()
        setProject(updated)
        setModelsChanged(false)
        setNextScheduledScan(updated.next_scheduled_scan_at || null)
      }
    } catch (error) {
      console.error('Error saving settings:', error)
    } finally {
      setSaving(false)
    }
  }

  const deleteProject = async () => {
    if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      return
    }
    
    setDeleting(true)
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE',
      })
      
      if (res.ok) {
        router.push('/dashboard/projects')
      }
    } catch (error) {
      console.error('Error deleting project:', error)
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Project not found</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b shrink-0 px-4 py-4 lg:px-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link 
              href={`/dashboard/projects/${projectId}`}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Project
            </Link>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Project Settings</h1>
              <p className="text-sm text-muted-foreground">Configure project details and AI models.</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button
              variant="destructive"
              onClick={deleteProject}
              disabled={deleting}
              className="bg-transparent border-0 text-red-500 hover:bg-red-500/10 hover:text-red-600"
            >
              {deleting ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Deleting...</>
              ) : (
                <><Trash2 className="w-4 h-4 mr-2" /> Delete Project</>
              )}
            </Button>
            <Button size="default" onClick={saveSettings} disabled={saving}>
              {saving ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Saving...</>
              ) : (
                <><Save className="w-4 h-4 mr-2" /> Save Changes</>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 lg:px-8">
        <div className="container mx-auto space-y-8">

          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Configure your project's core details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Project Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="domain">Domain</Label>
                <Input
                  id="domain"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="example.com"
                />
              </div>

              {/* Brand Variations */}
              <div className="space-y-2">
                <Label>Brand Name Variations</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Add brand variation..."
                    value={newBrand}
                    onChange={(e) => setNewBrand(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addBrand())}
                  />
                  <Button type="button" size="icon" variant="secondary" onClick={addBrand}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {brandVariations.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {brandVariations.map((brand, i) => (
                      <Badge key={i} variant="secondary" className="gap-1">
                        {brand}
                        <button type="button" onClick={() => removeBrand(brand)} className="text-muted-foreground hover:text-foreground">
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Keywords */}
              <div className="space-y-2">
                <Label>Keywords</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Add keyword..."
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
                  />
                  <Button type="button" size="icon" variant="secondary" onClick={addKeyword}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {keywords.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {keywords.map((keyword, i) => (
                      <Badge key={i} variant="secondary" className="gap-1">
                        {keyword}
                        <button type="button" onClick={() => removeKeyword(keyword)} className="text-muted-foreground hover:text-foreground">
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="language">Query Language</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger id="language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((lang) => (
                      <SelectItem key={lang.value} value={lang.value}>
                        {lang.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

            </CardContent>
          </Card>

          <Separator />

          {/* AI Models */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5" />
                <CardTitle>AI Models</CardTitle>
              </div>
              <CardDescription>
                Select which LLM models to use for scanning
                {pricingLoading && <span className="ml-2 text-xs">(Loading prices...)</span>}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {modelsChanged && (
                <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5" />
                  <p className="text-sm text-yellow-500">
                    Changing models will affect data consistency for this project.
                  </p>
                </div>
              )}
              
              {pricingError && (
                <div className="flex items-center gap-2 text-amber-500 text-sm mb-4 p-2 bg-amber-500/10 rounded">
                  <AlertCircle className="w-4 h-4" />
                  Using cached prices. {pricingError}
                </div>
              )}

              <div className="space-y-6">
                {PROVIDERS.map((provider) => {
                  const providerModels = getModelsByProvider(provider.id)
                  return (
                    <div key={provider.id} className="space-y-3">
                      <h3 className="font-semibold">{provider.name}</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {providerModels.map((model) => {
                          const isSelected = selectedModels.includes(model.id)
                          const price = getDisplayPrice(model.id)
                          return (
                            <div
                              key={model.id}
                              onClick={() => toggleModel(model.id)}
                              className={`
                                flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                                ${isSelected ? 'bg-primary/10 border-primary' : 'border-border hover:bg-muted'}
                              `}
                            >
                              <div className={`
                                w-4 h-4 rounded border flex items-center justify-center
                                ${isSelected ? 'bg-primary border-primary' : 'border-border'}
                              `}>
                                {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium truncate">{model.name}</span>
                                  {RECOMMENDED_SCAN_MODELS.includes(model.id) && (
                                    <Badge variant="secondary" className="text-xs bg-emerald-500/20 text-emerald-400 shrink-0">Recommended</Badge>
                                  )}
                                  {model.id === helperModelsData.cheapestModel && !RECOMMENDED_SCAN_MODELS.includes(model.id) && (
                                    <Badge variant="secondary" className="text-xs text-zinc-500 shrink-0">Cheapest</Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {pricingLoading ? (
                                    <span className="animate-pulse">Loading...</span>
                                  ) : (
                                    <>${price.input.toFixed(2)} / ${price.output.toFixed(2)} per 1M tokens</>
                                  )}
                                </p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Separator />

          {/* AI Helper Models */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5" />
                <CardTitle>AI Helper Models</CardTitle>
              </div>
              <CardDescription>
                Configure which models to use for query generation and response evaluation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Query Generation Model */}
              <div className="space-y-2">
                <Label htmlFor="query-gen-model">Query Generation Model</Label>
                <p className="text-sm text-muted-foreground mb-2">
                  Used when generating AI-suggested test queries for this project
                </p>
                <Select value={queryGenerationModel} onValueChange={setQueryGenerationModel}>
                  <SelectTrigger id="query-gen-model" className="w-full md:w-96">
                    <SelectValue />
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
              </div>

              <Separator />

              {/* Evaluation Model */}
              <div className="space-y-2">
                <Label htmlFor="eval-model">Evaluation Model</Label>
                <p className="text-sm text-muted-foreground mb-2">
                  Used for analyzing AI responses and calculating metrics (visibility, sentiment, ranking)
                </p>
                <Select 
                  value={evaluationModel} 
                  onValueChange={(value) => {
                    // Warn if selecting unreliable model
                    const model = evaluationModels.find(m => m.value === value)
                    if (model?.unreliableForEval) {
                      if (!confirm(`${model.label} may produce inconsistent evaluation results. Are you sure?`)) {
                        return
                      }
                    }
                    setEvaluationModel(value)
                  }}
                >
                  <SelectTrigger id="eval-model" className="w-full md:w-96">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {evaluationModels.map((model) => (
                      <SelectItem key={model.value} value={model.value}>
                        <div className="flex items-center gap-2">
                          <span>{model.label}</span>
                          {model.recommended && !model.unreliableForEval && (
                            <Badge variant="secondary" className="text-xs bg-emerald-500/20 text-emerald-400">Recommended</Badge>
                          )}
                          {model.cheapest && !model.recommended && !model.unreliableForEval && (
                            <Badge variant="secondary" className="text-xs text-zinc-500">Cheapest</Badge>
                          )}
                          {model.unreliableForEval && (
                            <Badge variant="outline" className="text-xs text-amber-500 border-amber-500/30">Unstable</Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Info box */}
              <div className="p-3 bg-muted/50 rounded-lg flex items-start gap-2">
                <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground">
                  These models run in the background during scans and query generation. 
                  Cheaper, faster models are recommended to minimize costs.
                </p>
              </div>
            </CardContent>
          </Card>

          <Separator />

          {/* Follow-up Queries */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5" />
                <CardTitle>Follow-up Queries</CardTitle>
              </div>
              <CardDescription>
                Test organic brand visibility through conversation depth
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="follow-up-toggle">Enable Follow-up Conversations</Label>
                  <p className="text-sm text-muted-foreground">
                    After each query, AI will ask follow-up questions to test brand persistence
                  </p>
                </div>
                <Switch
                  id="follow-up-toggle"
                  checked={followUpEnabled}
                  onCheckedChange={setFollowUpEnabled}
                />
              </div>

              {followUpEnabled && (
                <>
                  <Separator />
                  
                  {/* Cost Warning */}
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-amber-600 dark:text-amber-400">
                      <strong>Cost impact:</strong> Follow-up queries will increase scan cost by approximately {followUpDepth + 1}× 
                      (1 initial + {followUpDepth} follow-up{followUpDepth > 1 ? 's' : ''} per query).
                    </p>
                  </div>

                  {/* Depth Selection */}
                  <div className="space-y-4">
                    <Label>Conversation Depth</Label>
                    <div className="grid grid-cols-3 gap-3">
                      {[1, 2, 3].map((depth) => (
                        <div
                          key={depth}
                          onClick={() => setFollowUpDepth(depth)}
                          className={`
                            flex flex-col items-center gap-2 p-4 rounded-lg border cursor-pointer transition-colors text-center
                            ${followUpDepth === depth ? 'bg-primary/10 border-primary' : 'border-border hover:bg-muted'}
                          `}
                        >
                          <div className={`
                            w-5 h-5 rounded-full border-2 flex items-center justify-center
                            ${followUpDepth === depth ? 'border-primary bg-primary' : 'border-muted-foreground'}
                          `}>
                            {followUpDepth === depth && <Check className="w-3 h-3 text-primary-foreground" />}
                          </div>
                          <div>
                            <span className="text-lg font-semibold">{depth}</span>
                            <p className="text-xs text-muted-foreground">
                              {depth === 1 ? 'Basic' : depth === 2 ? 'Standard' : 'Deep'}
                            </p>
                          </div>
                          <Badge variant="secondary" className="text-xs">
                            {depth + 1}× cost
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* How it works */}
                  <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Info className="w-4 h-4" />
                      How it works
                    </div>
                    <div className="text-sm text-muted-foreground space-y-2">
                      <p>
                        <strong>Organic testing:</strong> Follow-up questions never mention your brand directly. 
                        Instead, they ask the AI to elaborate, compare, or recommend—testing whether your brand 
                        naturally persists in the conversation.
                      </p>
                      <div className="pl-4 border-l-2 border-muted space-y-1">
                        <p><span className="font-mono text-xs bg-blue-500/20 text-blue-400 px-1 rounded">Initial</span> "What's the best e-shop for electronics?"</p>
                        <p><span className="font-mono text-xs bg-green-500/20 text-green-400 px-1 rounded">F1</span> "Which would you recommend to buy and why?"</p>
                        {followUpDepth >= 2 && (
                          <p><span className="font-mono text-xs bg-orange-500/20 text-orange-400 px-1 rounded">F2</span> "What should I consider before purchasing?"</p>
                        )}
                        {followUpDepth >= 3 && (
                          <p><span className="font-mono text-xs bg-purple-500/20 text-purple-400 px-1 rounded">F3</span> "Can you compare the top options?"</p>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Separator />

          {/* Scheduled Scans */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                <CardTitle>Scheduled Scans</CardTitle>
                {userTier === 'free' && (
                  <Badge variant="secondary" className="ml-auto">
                    <Lock className="w-3 h-3 mr-1" />
                    Pro Feature
                  </Badge>
                )}
              </div>
              <CardDescription>
                Automatically run scans on a schedule (daily, weekly, or monthly)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {userTier === 'free' ? (
                /* Free User Locked State */
                <div className="relative">
                  <div className="p-6 bg-muted/30 border-2 border-dashed border-muted-foreground/20 rounded-lg text-center space-y-4">
                    <div className="flex justify-center">
                      <div className="p-3 bg-primary/10 rounded-full">
                        <Lock className="w-8 h-8 text-primary" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold">Scheduled Scans — Pro Feature</h3>
                      <p className="text-sm text-muted-foreground max-w-md mx-auto">
                        Automatically run scans on a schedule to track your brand visibility over time. 
                        Perfect for monitoring your GEO performance without manual intervention.
                      </p>
                    </div>
                    <div className="flex justify-center pt-2">
                      <Button asChild>
                        <Link href="/dashboard/costs">
                          Upgrade to Pro →
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Paid User Normal UI */
                <>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="scheduled-scan-toggle">Enable Scheduled Scans</Label>
                      <p className="text-sm text-muted-foreground">
                        Automatically run scans on your preferred schedule
                      </p>
                    </div>
                    <Switch
                      id="scheduled-scan-toggle"
                      checked={scheduledScanEnabled}
                      onCheckedChange={setScheduledScanEnabled}
                    />
                  </div>

              {scheduledScanEnabled && (
                <>
                  <Separator />
                  
                  {/* Frequency Selection */}
                  <div className="space-y-4">
                    <Label>Scan Frequency</Label>
                    <div className="grid grid-cols-3 gap-3">
                      {(['daily', 'weekly', 'monthly'] as const).map((freq) => (
                        <div
                          key={freq}
                          onClick={() => setScheduledFrequency(freq)}
                          className={`
                            flex flex-col items-center gap-2 p-4 rounded-lg border cursor-pointer transition-colors text-center
                            ${scheduledFrequency === freq ? 'bg-primary/10 border-primary' : 'border-border hover:bg-muted'}
                          `}
                        >
                          <div className={`
                            w-5 h-5 rounded-full border-2 flex items-center justify-center
                            ${scheduledFrequency === freq ? 'border-primary bg-primary' : 'border-muted-foreground'}
                          `}>
                            {scheduledFrequency === freq && <Check className="w-3 h-3 text-primary-foreground" />}
                          </div>
                          <div>
                            <span className="text-lg font-semibold capitalize">{freq}</span>
                            <p className="text-xs text-muted-foreground">
                              {freq === 'daily' ? 'Every day' : freq === 'weekly' ? 'Once a week' : 'Once a month'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Separator />

                  {/* Hour Selection */}
                  <div className="space-y-2">
                    <Label htmlFor="scan-hour">Time of Day</Label>
                    <Select 
                      value={scheduledHour.toString()} 
                      onValueChange={(v) => setScheduledHour(parseInt(v))}
                    >
                      <SelectTrigger id="scan-hour" className="w-full md:w-64">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 24 }, (_, i) => {
                          const hour12 = i % 12 || 12
                          const ampm = i < 12 ? 'AM' : 'PM'
                          return (
                            <SelectItem key={i} value={i.toString()}>
                              {hour12}:00 {ampm}
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Time in your timezone: {userTimezone} (<Link href="/dashboard/settings" className="text-primary hover:underline">change</Link>)
                    </p>
                  </div>

                  {/* Day of Week (for weekly) */}
                  {scheduledFrequency === 'weekly' && (
                    <div className="space-y-2">
                      <Label htmlFor="scan-day">Day of Week</Label>
                      <Select 
                        value={scheduledScanDay.toString()} 
                        onValueChange={(v) => setScheduledScanDay(parseInt(v))}
                      >
                        <SelectTrigger id="scan-day" className="w-full md:w-64">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DAYS_OF_WEEK.map((day) => (
                            <SelectItem key={day.value} value={day.value.toString()}>
                              {day.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Day of Month (for monthly) */}
                  {scheduledFrequency === 'monthly' && (
                    <div className="space-y-2">
                      <Label htmlFor="scan-day-of-month">Day of Month</Label>
                      <Select 
                        value={scheduledDayOfMonth.toString()} 
                        onValueChange={(v) => setScheduledDayOfMonth(parseInt(v))}
                      >
                        <SelectTrigger id="scan-day-of-month" className="w-full md:w-64">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 28 }, (_, i) => {
                            const day = i + 1
                            const suffix = day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'
                            return (
                              <SelectItem key={day} value={day.toString()}>
                                {day}{suffix}
                              </SelectItem>
                            )
                          })}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Limited to day 1-28 to ensure the day exists in all months
                      </p>
                    </div>
                  )}

                  {/* Next Scan Display */}
                  {nextScheduledScan && (
                    <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                      <Clock className="w-4 h-4 text-primary" />
                      <div className="text-sm">
                        <span className="text-muted-foreground">Next scan: </span>
                        <span className="font-medium">
                          {new Date(nextScheduledScan).toLocaleString('en-US', {
                            timeZone: userTimezone,
                            weekday: 'long',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true,
                          })}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                    <p className="text-sm text-amber-600 dark:text-amber-400">
                      <strong>Note:</strong> Scheduled scans will use credits from your balance. 
                      Make sure you have sufficient credits to avoid skipped scans.
                    </p>
                  </div>
                </>
              )}
                </>
              )}
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  )
}
