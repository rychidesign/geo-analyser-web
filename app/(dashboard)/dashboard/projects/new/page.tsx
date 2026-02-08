'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Plus, X, Check, Cpu, AlertCircle, MessageCircle, Calendar, AlertTriangle, Lock } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { AVAILABLE_MODELS, getModelsByProvider, type LLMProvider } from '@/lib/ai'
import { useToast } from '@/components/ui/toast'
import { usePricing, formatPrice } from '@/lib/hooks/use-pricing'

// Recommended models for different tasks
const RECOMMENDED_GENERATION_MODELS = ['claude-sonnet-4-20250514', 'gpt-5-2', 'sonar-pro']
const RECOMMENDED_EVALUATION_MODELS = ['claude-sonnet-4-20250514', 'gemini-2-5-flash', 'sonar-pro', 'gpt-5-mini']

// Recommended models for SCANNING - newest, most capable models for testing queries
const RECOMMENDED_SCAN_MODELS = [
  'gpt-5-2',
  'claude-sonnet-4-5',
  'claude-opus-4-5',
  'gemini-3-flash-preview',
  'sonar-reasoning-pro',
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

const PROVIDERS: { id: LLMProvider; name: string }[] = [
  { id: 'openai', name: 'OpenAI' },
  { id: 'anthropic', name: 'Anthropic' },
  { id: 'google', name: 'Google AI' },
  { id: 'groq', name: 'Groq' },
  { id: 'perplexity', name: 'Perplexity' },
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

interface FieldErrors {
  name?: string
  domain?: string
  brandVariations?: string
  selectedModels?: string
}

export default function NewProjectPage() {
  const router = useRouter()
  const { showError } = useToast()
  const [loading, setLoading] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [userTier, setUserTier] = useState<'free' | 'paid' | 'test' | 'admin'>('free')
  
  // Fetch pricing from API (centralized pricing)
  const { pricing, isLoading: pricingLoading, error: pricingError, getModelPrice, getEstimatedCost } = usePricing()
  
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
  const [selectedModels, setSelectedModels] = useState<string[]>(['gpt-5-2'])
  
  // AI Helper models state
  const [queryGenerationModel, setQueryGenerationModel] = useState('gpt-5-mini')
  const [evaluationModel, setEvaluationModel] = useState('gpt-5-mini')
  
  // Follow-up queries state
  const [followUpEnabled, setFollowUpEnabled] = useState(false)
  const [followUpDepth, setFollowUpDepth] = useState(1)
  
  // Scheduled scans state
  const [scheduledScanEnabled, setScheduledScanEnabled] = useState(false)
  const [scheduledScanDay, setScheduledScanDay] = useState(1) // Monday by default
  
  const [helperModelsData, setHelperModelsData] = useState<{
    models: Array<{ value: string; label: string; provider: string }>
    cheapestModel: string | null
  }>({ models: [], cheapestModel: null })
  
  // Fetch helper models from API
  useEffect(() => {
    async function fetchHelperModels() {
      try {
        const res = await fetch('/api/credits/pricing')
        if (res.ok) {
          const data = await res.json()
          if (data.pricing && Array.isArray(data.pricing)) {
            // Find cheapest model
            let cheapestModel: string | null = null
            let lowestCost = Infinity
            
            const models = data.pricing
              .filter((p: { is_active: boolean }) => p.is_active)
              .map((p: { model: string; display_name: string; provider: string; input_cost_cents: number; output_cost_cents: number }) => {
                const totalCost = p.input_cost_cents + p.output_cost_cents
                if (totalCost < lowestCost) {
                  lowestCost = totalCost
                  cheapestModel = p.model
                }
                return {
                  value: p.model,
                  label: p.display_name || p.model,
                  provider: p.provider,
                }
              })
            
            setHelperModelsData({ models, cheapestModel })
          }
        }
      } catch (error) {
        console.error('Failed to fetch helper models:', error)
      }
    }
    fetchHelperModels()
  }, [])
  
  // Fetch user tier
  useEffect(() => {
    async function fetchUserTier() {
      try {
        const res = await fetch('/api/credits')
        if (res.ok) {
          const data = await res.json()
          setUserTier(data.tier || 'free')
        }
      } catch (error) {
        console.error('Failed to fetch user tier:', error)
      }
    }
    fetchUserTier()
  }, [])
  
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
  
  // Models for query generation (sorted: recommended first)
  const generationModels = useMemo(() => {
    return helperModelsData.models
      .map(m => ({
        ...m,
        cheapest: m.value === helperModelsData.cheapestModel,
        recommended: RECOMMENDED_GENERATION_MODELS.includes(m.value),
      }))
      .sort((a, b) => {
        if (a.recommended && !b.recommended) return -1
        if (!a.recommended && b.recommended) return 1
        if (a.cheapest && !b.cheapest) return -1
        if (!a.cheapest && b.cheapest) return 1
        return a.provider.localeCompare(b.provider)
      })
  }, [helperModelsData])
  
  // Models for evaluation (sorted: recommended first)
  const evaluationModels = useMemo(() => {
    return helperModelsData.models
      .map(m => ({
        ...m,
        cheapest: m.value === helperModelsData.cheapestModel,
        recommended: RECOMMENDED_EVALUATION_MODELS.includes(m.value),
      }))
      .sort((a, b) => {
        if (a.recommended && !b.recommended) return -1
        if (!a.recommended && b.recommended) return 1
        if (a.cheapest && !b.cheapest) return -1
        if (!a.cheapest && b.cheapest) return 1
        return a.provider.localeCompare(b.provider)
      })
  }, [helperModelsData])

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
    setSelectedModels(prev => 
      prev.includes(model) ? prev.filter(m => m !== model) : [...prev, model]
    )
    if (fieldErrors.selectedModels) {
      setFieldErrors(prev => ({ ...prev, selectedModels: undefined }))
    }
  }

  // Calculate estimated cost using API prices
  const estimatedCost = useMemo(() => {
    return getEstimatedCost(selectedModels, 10, 500)
  }, [selectedModels, getEstimatedCost])
  
  // Get price for a model (from API or fallback to hardcoded)
  const getDisplayPrice = (modelId: string) => {
    const apiPrice = priceMap[modelId]
    if (apiPrice) {
      return apiPrice
    }
    // Fallback to hardcoded if API doesn't have this model
    const model = AVAILABLE_MODELS.find(m => m.id === modelId)
    return model?.pricing || { input: 0, output: 0 }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate all fields
    const errors: FieldErrors = {}
    
    if (!name.trim()) {
      errors.name = 'Project name is required'
    }
    
    if (!domain.trim()) {
      errors.domain = 'Domain is required'
    }
    
    if (brandVariations.length === 0) {
      errors.brandVariations = 'Add at least one brand variation'
    }
    
    if (selectedModels.length === 0) {
      errors.selectedModels = 'Select at least one AI model'
    }
    
    // If there are errors, show them and don't submit
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    
    setFieldErrors({})
    setLoading(true)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          domain,
          language,
          brand_variations: brandVariations,
          target_keywords: keywords,
          llm_models: selectedModels,
          query_generation_model: queryGenerationModel,
          evaluation_model: evaluationModel,
          follow_up_enabled: followUpEnabled,
          follow_up_depth: followUpDepth,
          scheduled_scan_enabled: scheduledScanEnabled,
          scheduled_scan_day: scheduledScanDay,
        }),
      })
      
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create project')
      }
      
      const project = await res.json()
      router.push(`/dashboard/projects/${project.id}`)
    } catch (err: any) {
      showError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b shrink-0 px-4 py-4 lg:px-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link 
              href="/dashboard/projects"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Projects
            </Link>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">New Project</h1>
              <p className="text-sm text-muted-foreground">Create a new project to track your brand visibility.</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button 
              type="button" 
              variant="secondary" 
              onClick={() => router.push('/dashboard/projects')}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading} form="new-project-form">
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Creating...</>
              ) : (
                'Create Project'
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 lg:px-8">
        <form id="new-project-form" onSubmit={handleSubmit} className="container mx-auto space-y-8">

          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Enter information about your project and brand</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Project Name *</Label>
                <Input
                  id="name"
                  placeholder="My Project"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value)
                    if (fieldErrors.name) setFieldErrors(prev => ({ ...prev, name: undefined }))
                  }}
                  disabled={loading}
                  className={fieldErrors.name ? 'border-red-500' : ''}
                />
                {fieldErrors.name && (
                  <p className="text-xs text-red-500">{fieldErrors.name}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="domain">Domain *</Label>
                <Input
                  id="domain"
                  placeholder="example.com"
                  value={domain}
                  onChange={(e) => {
                    setDomain(e.target.value)
                    if (fieldErrors.domain) setFieldErrors(prev => ({ ...prev, domain: undefined }))
                  }}
                  disabled={loading}
                  className={fieldErrors.domain ? 'border-red-500' : ''}
                />
                {fieldErrors.domain ? (
                  <p className="text-xs text-red-500">{fieldErrors.domain}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Without https:// - e.g. "mywebsite.com"
                  </p>
                )}
              </div>

              {/* Brand Variations */}
              <div className="space-y-2">
                <Label>Brand Name Variations *</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Add brand variation (comma separated)..."
                    value={newBrand}
                    onChange={(e) => setNewBrand(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addBrand())}
                    disabled={loading}
                    className={fieldErrors.brandVariations && brandVariations.length === 0 ? 'border-red-500' : ''}
                  />
                  <Button 
                    type="button" 
                    size="icon" 
                    variant="secondary" 
                    onClick={() => {
                      addBrand()
                      if (fieldErrors.brandVariations) setFieldErrors(prev => ({ ...prev, brandVariations: undefined }))
                    }} 
                    disabled={loading}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {fieldErrors.brandVariations && brandVariations.length === 0 ? (
                  <p className="text-xs text-red-500">{fieldErrors.brandVariations}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Enter brand name variations and click + to add. You can add multiple at once separated by commas.
                  </p>
                )}
                {brandVariations.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {brandVariations.map((brand, i) => (
                      <Badge key={i} variant="secondary" className="gap-1">
                        {brand}
                        <button 
                          type="button" 
                          onClick={() => removeBrand(brand)} 
                          className="text-muted-foreground hover:text-foreground"
                          disabled={loading}
                        >
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
                    placeholder="Add keyword (comma separated)..."
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
                    disabled={loading}
                  />
                  <Button type="button" size="icon" variant="secondary" onClick={addKeyword} disabled={loading}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {keywords.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {keywords.map((keyword, i) => (
                      <Badge key={i} variant="secondary" className="gap-1">
                        {keyword}
                        <button 
                          type="button" 
                          onClick={() => removeKeyword(keyword)} 
                          className="text-muted-foreground hover:text-foreground"
                          disabled={loading}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Used for generating test queries
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="language">Query Language</Label>
                <Select value={language} onValueChange={setLanguage} disabled={loading}>
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

          {/* Model Selection */}
          <Card className={fieldErrors.selectedModels ? 'border-red-500/50' : ''}>
            <CardHeader>
              <CardTitle>AI Models *</CardTitle>
              <CardDescription>
                Select which AI models to test. Each query will be sent to all selected models.
                {pricingLoading && <span className="ml-2 text-xs">(Loading prices...)</span>}
              </CardDescription>
              {fieldErrors.selectedModels && (
                <p className="text-xs text-red-500 mt-2">{fieldErrors.selectedModels}</p>
              )}
            </CardHeader>
            <CardContent>
              {pricingError && (
                <div className="flex items-center gap-2 text-amber-500 text-sm mb-4 p-2 bg-amber-500/10 rounded">
                  <AlertCircle className="w-4 h-4" />
                  Using cached prices. {pricingError}
                </div>
              )}
              
              <div className="space-y-6">
                {PROVIDERS.map(provider => {
                  const models = getModelsByProvider(provider.id)
                  
                  return (
                    <div key={provider.id} className="space-y-3">
                      <h3 className="font-semibold">{provider.name}</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {models.map(model => {
                          const isSelected = selectedModels.includes(model.id)
                          const price = getDisplayPrice(model.id)
                          
                          return (
                            <div
                              key={model.id}
                              onClick={() => !loading && toggleModel(model.id)}
                              className={`
                                flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                                ${isSelected ? 'bg-primary/10 border-primary' : 'border-border hover:bg-muted'}
                                ${loading ? 'opacity-50 cursor-not-allowed' : ''}
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
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
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

              <Separator className="my-6" />

              <div className="flex items-center justify-between text-sm">
                <div className="text-muted-foreground">
                  <span className="font-medium text-foreground">{selectedModels.length}</span> model{selectedModels.length !== 1 ? 's' : ''} selected
                </div>
                <div className="text-muted-foreground">
                  Est. cost per scan: ~${estimatedCost.toFixed(4)}
                </div>
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
                <Select value={queryGenerationModel} onValueChange={setQueryGenerationModel} disabled={loading}>
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

              {/* Evaluation Model */}
              <div className="space-y-2">
                <Label htmlFor="eval-model">Evaluation Model</Label>
                <p className="text-sm text-muted-foreground mb-2">
                  Used for analyzing AI responses and calculating metrics (visibility, sentiment, ranking)
                </p>
                <Select value={evaluationModel} onValueChange={setEvaluationModel} disabled={loading}>
                  <SelectTrigger id="eval-model" className="w-full md:w-96">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {evaluationModels.map((model) => (
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
                  disabled={loading}
                />
              </div>

              {followUpEnabled && (
                <>
                  <Separator />
                  
                  {/* Cost Warning */}
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-amber-600 dark:text-amber-400">
                      Enabling follow-ups will increase scan cost by {followUpDepth + 1}x
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
                          onClick={() => !loading && setFollowUpDepth(depth)}
                          className={`
                            flex flex-col items-center gap-2 p-4 rounded-lg border cursor-pointer transition-colors text-center
                            ${followUpDepth === depth ? 'bg-primary/10 border-primary' : 'border-border hover:bg-muted'}
                            ${loading ? 'opacity-50 cursor-not-allowed' : ''}
                          `}
                        >
                          <div className={`
                            w-5 h-5 rounded-full border-2 flex items-center justify-center
                            ${followUpDepth === depth ? 'border-primary bg-primary' : 'border-muted-foreground'}
                          `}>
                            {followUpDepth === depth && <Check className="w-3 h-3 text-primary-foreground" />}
                          </div>
                          <div>
                            <p className="font-medium">{depth} Follow-up{depth > 1 ? 's' : ''}</p>
                            <p className="text-xs text-muted-foreground">{depth + 1}x cost</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Higher depth provides more thorough testing but increases cost proportionally.
                    </p>
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
                Automatically run scans on a weekly schedule
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
                /* Paid/Admin/Test User Normal UI */
                <>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="scheduled-scan-toggle">Enable Weekly Scans</Label>
                      <p className="text-sm text-muted-foreground">
                        Automatically run a scan every week at the scheduled time
                      </p>
                    </div>
                    <Switch
                      id="scheduled-scan-toggle"
                      checked={scheduledScanEnabled}
                      onCheckedChange={setScheduledScanEnabled}
                      disabled={loading}
                    />
                  </div>

                  {scheduledScanEnabled && (
                    <>
                      <Separator />
                      
                      <div className="space-y-2">
                        <Label htmlFor="scan-day">Day of Week</Label>
                        <Select 
                          value={scheduledScanDay.toString()} 
                          onValueChange={(v) => setScheduledScanDay(parseInt(v))}
                          disabled={loading}
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
                        <p className="text-xs text-muted-foreground">
                          Scans run automatically around 6:00 AM UTC on the selected day.
                        </p>
                      </div>
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>

        </form>
      </div>
    </div>
  )
}
