'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { 
  ArrowLeft, 
  Loader2,
  Save,
  Trash2,
  Calendar,
  AlertTriangle,
  Check,
  Cpu,
  Plus,
  X
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { AVAILABLE_MODELS, getModelsByProvider, type LLMProvider, type LLMModel } from '@/lib/llm/types'
import type { Project } from '@/lib/db/schema'

const PROVIDERS: { id: LLMProvider; name: string }[] = [
  { id: 'openai', name: 'OpenAI' },
  { id: 'anthropic', name: 'Anthropic' },
  { id: 'google', name: 'Google AI' },
]

const DAYS = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
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

export default function ProjectSettingsPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
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
  const [scheduledEnabled, setScheduledEnabled] = useState(false)
  const [scheduledDay, setScheduledDay] = useState('1')
  const [selectedModels, setSelectedModels] = useState<LLMModel[]>(['gpt-5-nano'])
  const [modelsChanged, setModelsChanged] = useState(false)

  useEffect(() => {
    loadProject()
    checkProviders()
  }, [projectId])

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

  const loadProject = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`)
      if (res.ok) {
        const data = await res.json()
        setProject(data)
        setName(data.name)
        setDomain(data.domain)
        setLanguage(data.language || 'en')
        setEvaluationMethod(data.evaluation_method || 'ai')
        setBrandVariations(data.brand_variations || [])
        setKeywords(data.target_keywords || [])
        setScheduledEnabled(data.scheduled_scan || false)
        setScheduledDay(data.scheduled_day?.toString() || '1')
        setSelectedModels(data.selected_models || ['gpt-5-nano'])
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

  const toggleModel = (model: LLMModel) => {
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
          evaluation_method: evaluationMethod,
          brand_variations: brandVariations,
          target_keywords: keywords,
          scheduled_scan: scheduledEnabled,
          scheduled_day: parseInt(scheduledDay),
          selected_models: selectedModels,
        }),
      })
      
      if (res.ok) {
        const updated = await res.json()
        setProject(updated)
        setModelsChanged(false)
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
    <>
      {/* Header */}
      <div className="border-b lg:shrink-0 px-4 py-4 lg:px-8">
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
              <p className="text-sm text-muted-foreground">Configure project details and scheduled scans.</p>
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
      <div className="p-4 lg:p-8 lg:flex-1 lg:overflow-y-auto">
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

              <div className="space-y-2">
                <Label htmlFor="evaluationMethod">Evaluation Method</Label>
                <Select value={evaluationMethod} onValueChange={(value: 'ai' | 'regex') => setEvaluationMethod(value)}>
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

          {/* Scheduled Scan */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                <CardTitle>Scheduled Scan</CardTitle>
              </div>
              <CardDescription>Automatically run scans on a weekly schedule</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <input
                  type="checkbox"
                  id="scheduled"
                  checked={scheduledEnabled}
                  onChange={(e) => setScheduledEnabled(e.target.checked)}
                  className="w-4 h-4 rounded border-border"
                />
                <Label htmlFor="scheduled" className="cursor-pointer">Enable weekly scheduled scan</Label>
              </div>

              {scheduledEnabled && (
                <div className="space-y-2">
                  <Label htmlFor="day">Day of Week</Label>
                  <Select value={scheduledDay} onValueChange={setScheduledDay}>
                    <SelectTrigger id="day">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAYS.map((day) => (
                        <SelectItem key={day.value} value={day.value}>
                          {day.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
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
              <CardDescription>Select which LLM models to use for scanning</CardDescription>
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

              {availableProviders.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No API keys configured. <Link href="/dashboard/settings" className="text-primary hover:underline">Configure API keys</Link>
                </p>
              ) : (
                <div className="space-y-6">
                  {PROVIDERS.filter(p => availableProviders.includes(p.id)).map((provider) => {
                    const providerModels = getModelsByProvider(provider.id)
                    return (
                      <div key={provider.id} className="space-y-3">
                        <h3 className="font-semibold">{provider.name}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {providerModels.map((model) => {
                            const isSelected = selectedModels.includes(model.id)
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
                                <span className="text-sm">{model.name}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

        </div>
      </div>
    </>
  )
}
