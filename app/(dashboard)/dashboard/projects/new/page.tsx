'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Plus, X, Check, Cpu } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { AVAILABLE_MODELS, getModelsByProvider, type LLMProvider, type LLMModel } from '@/lib/llm/types'

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
]

export default function NewProjectPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [availableProviders, setAvailableProviders] = useState<LLMProvider[]>([])
  
  // Form state
  const [name, setName] = useState('')
  const [domain, setDomain] = useState('')
  const [language, setLanguage] = useState('en')
  const [evaluationMethod, setEvaluationMethod] = useState<'ai' | 'regex'>('ai')
  const [brandVariations, setBrandVariations] = useState<string[]>([])
  const [keywords, setKeywords] = useState<string[]>([])
  const [newBrand, setNewBrand] = useState('')
  const [newKeyword, setNewKeyword] = useState('')
  const [selectedModels, setSelectedModels] = useState<LLMModel[]>(['gpt-5-nano'])

  useEffect(() => {
    checkProviders()
  }, [])

  const checkProviders = async () => {
    try {
      const res = await fetch('/api/settings')
      if (res.ok) {
        const settings = await res.json()
        const providers: LLMProvider[] = []
        if (Array.isArray(settings)) {
          for (const s of settings) {
            if (s.has_key && ['openai', 'anthropic', 'google'].includes(s.provider)) {
              providers.push(s.provider as LLMProvider)
            }
          }
        }
        setAvailableProviders(providers)
      }
    } catch (err) {
      console.error('Error checking providers:', err)
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

  const toggleModel = (model: LLMModel) => {
    setSelectedModels(prev => 
      prev.includes(model) ? prev.filter(m => m !== model) : [...prev, model]
    )
  }

  const getEstimatedCost = () => {
    const queriesEstimate = 10
    const tokensPerQuery = 500
    
    let totalCost = 0
    for (const modelId of selectedModels) {
      const model = AVAILABLE_MODELS.find(m => m.id === modelId)
      if (model) {
        const inputCost = (tokensPerQuery / 1_000_000) * model.pricing.input * queriesEstimate
        const outputCost = (tokensPerQuery / 1_000_000) * model.pricing.output * queriesEstimate
        totalCost += inputCost + outputCost
      }
    }
    return totalCost
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    console.log('Form validation:', {
      name: name.trim(),
      domain: domain.trim(),
      brandVariations,
      keywords,
      selectedModels,
    })
    
    if (!name.trim()) {
      setError('Project Name is required')
      return
    }
    
    if (!domain.trim()) {
      setError('Domain is required')
      return
    }
    
    if (brandVariations.length === 0) {
      setError('Please add at least one Brand Name Variation (click the + button to add)')
      console.log('Validation failed: brandVariations.length =', brandVariations.length)
      return
    }
    
    if (selectedModels.length === 0) {
      setError('Please select at least one AI model')
      return
    }
    
    console.log('Validation passed, creating project...')
    setLoading(true)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          domain,
          language,
          evaluation_method: evaluationMethod,
          brand_variations: brandVariations,
          target_keywords: keywords,
          selected_models: selectedModels,
        }),
      })
      
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create project')
      }
      
      const project = await res.json()
      router.push(`/dashboard/projects/${project.id}`)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Header */}
      <div className="border-b lg:shrink-0 px-4 py-4 lg:px-8">
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
      <div className="p-4 lg:p-8 lg:flex-1 lg:overflow-y-auto">
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
                  onChange={(e) => setName(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="domain">Domain *</Label>
                <Input
                  id="domain"
                  placeholder="example.com"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  disabled={loading}
                />
                <p className="text-xs text-muted-foreground">
                  Without https:// - e.g. "mywebsite.com"
                </p>
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
                  />
                  <Button type="button" size="icon" variant="secondary" onClick={addBrand} disabled={loading}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Enter brand name variations and click + to add. You can add multiple at once separated by commas.
                </p>
                {brandVariations.length > 0 ? (
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
                ) : (
                  <p className="text-xs text-yellow-600 dark:text-yellow-500">
                    ⚠️ At least one brand variation is required
                  </p>
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

              <div className="space-y-2">
                <Label htmlFor="evaluationMethod">Evaluation Method</Label>
                <Select value={evaluationMethod} onValueChange={(value: 'ai' | 'regex') => setEvaluationMethod(value)} disabled={loading}>
                  <SelectTrigger id="evaluationMethod">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ai">
                      <div className="flex items-center gap-2">
                        <Cpu className="w-4 h-4" />
                        <span>AI Evaluation (recommended)</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="regex">
                      <div className="flex items-center gap-2">
                        <span>Regex (fast & free)</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  AI uses LLM for better sentiment analysis. Regex is faster and free but simpler.
                </p>
              </div>
            </CardContent>
          </Card>

          <Separator />

          {/* Model Selection */}
          <Card>
            <CardHeader>
              <CardTitle>AI Models</CardTitle>
              <CardDescription>
                Select which AI models to test. Each query will be sent to all selected models.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {availableProviders.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No API keys configured. Please add API keys in <Link href="/dashboard/settings" className="text-primary hover:underline">Settings</Link> first.
                </p>
              ) : (
                <div className="space-y-6">
                  {PROVIDERS.filter(provider => availableProviders.includes(provider.id)).map(provider => {
                    const models = getModelsByProvider(provider.id)
                    
                    return (
                      <div key={provider.id} className="space-y-3">
                        <h3 className="font-semibold">{provider.name}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {models.map(model => {
                            const isSelected = selectedModels.includes(model.id)
                            
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
                                  <span className="text-sm font-medium block truncate">{model.name}</span>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    ${model.pricing.input}/${model.pricing.output}
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
              )}

              <Separator className="my-6" />

              <div className="flex items-center justify-between text-sm">
                <div className="text-muted-foreground">
                  <span className="font-medium text-foreground">{selectedModels.length}</span> model{selectedModels.length !== 1 ? 's' : ''} selected
                </div>
                <div className="text-muted-foreground">
                  Est. cost per scan: ~${getEstimatedCost().toFixed(4)}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Error */}
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm p-3 rounded-lg">
              {error}
            </div>
          )}
        </form>
      </div>
    </>
  )
}
