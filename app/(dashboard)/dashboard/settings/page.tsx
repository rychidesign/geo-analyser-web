'use client'

import { useState, useEffect } from 'react'
import { Loader2, Save, Key, Check, Cpu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

interface ApiKeyConfig {
  provider: string
  label: string
  placeholder: string
  key: string
  hasKey: boolean
}

const ALL_MODELS = [
  { value: 'gpt-5-nano', label: 'GPT-5 Nano (cheapest)', provider: 'openai' },
  { value: 'gpt-5-mini', label: 'GPT-5 Mini', provider: 'openai' },
  { value: 'gpt-5', label: 'GPT-5', provider: 'openai' },
  { value: 'claude-haiku-4.5', label: 'Claude Haiku 4.5 (cheapest)', provider: 'anthropic' },
  { value: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5', provider: 'anthropic' },
  { value: 'claude-opus-4.5', label: 'Claude Opus 4.5', provider: 'anthropic' },
  { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (cheapest)', provider: 'google' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'google' },
  { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview', provider: 'google' },
]

const DEFAULT_CONFIGS: ApiKeyConfig[] = [
  { provider: 'openai', label: 'OpenAI', placeholder: 'sk-...', key: '', hasKey: false },
  { provider: 'anthropic', label: 'Anthropic', placeholder: 'sk-ant-...', key: '', hasKey: false },
  { provider: 'google', label: 'Google AI', placeholder: 'AIza...', key: '', hasKey: false },
]

const TIMEZONES = [
  { value: 'Europe/Prague', label: 'Prague (CET/CEST, UTC+1/+2)' },
  { value: 'Europe/London', label: 'London (GMT/BST, UTC+0/+1)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET/CEST, UTC+1/+2)' },
  { value: 'America/New_York', label: 'New York (EST/EDT, UTC-5/-4)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (PST/PDT, UTC-8/-7)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST, UTC+9)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT, UTC+8)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEDT/AEST, UTC+11/+10)' },
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
]

export default function SettingsPage() {
  const [configs, setConfigs] = useState<ApiKeyConfig[]>(DEFAULT_CONFIGS)
  const [saving, setSaving] = useState<string | null>(null)
  const [savingHelpers, setSavingHelpers] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [loading, setLoading] = useState(true)
  const [timezone, setTimezone] = useState('Europe/Prague')
  const [queryGenerationModel, setQueryGenerationModel] = useState('gpt-5-nano')
  const [evaluationModel, setEvaluationModel] = useState('gpt-5-nano')

  useEffect(() => {
    loadSettings()
  }, [])

  const getAvailableModels = () => {
    const configuredProviders = configs.filter(c => c.hasKey).map(c => c.provider)
    return ALL_MODELS.filter(m => configuredProviders.includes(m.provider))
  }

  const loadSettings = async () => {
    try {
      // Load API key settings
      const res = await fetch('/api/settings')
      if (res.ok) {
        const settings = await res.json()
        setConfigs(prev => prev.map(config => {
          const saved = settings.find((s: any) => s.provider === config.provider)
          return saved ? { ...config, hasKey: saved.has_key, key: '' } : config
        }))
      }

      // Load helper model settings
      const helperRes = await fetch('/api/settings/helpers')
      if (helperRes.ok) {
        const helperSettings = await helperRes.json()
        setQueryGenerationModel(helperSettings.query_generation_model || 'gpt-5-nano')
        setEvaluationModel(helperSettings.evaluation_model || 'gpt-5-nano')
      }

      // Load profile settings (timezone)
      const profileRes = await fetch('/api/settings/profile')
      if (profileRes.ok) {
        const profileSettings = await profileRes.json()
        setTimezone(profileSettings.timezone || 'Europe/Prague')
      }
    } catch (error) {
      console.error('Error loading settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateConfig = (provider: string, value: string) => {
    setConfigs(prev => prev.map(c => c.provider === provider ? { ...c, key: value } : c))
  }

  const saveConfig = async (provider: string) => {
    const config = configs.find(c => c.provider === provider)
    if (!config) return
    setSaving(provider)
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, api_key: config.key || undefined }),
      })
      if (res.ok) {
        const saved = await res.json()
        setConfigs(prev => prev.map(c => 
          c.provider === provider ? { ...c, hasKey: saved.has_key, key: '' } : c
        ))
      }
    } catch (error) {
      console.error('Error saving config:', error)
    } finally {
      setSaving(null)
    }
  }

  const saveProfile = async () => {
    setSavingProfile(true)
    try {
      await fetch('/api/settings/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone }),
      })
    } catch (error) {
      console.error('Error saving profile:', error)
    } finally {
      setSavingProfile(false)
    }
  }

  const saveHelperModels = async () => {
    setSavingHelpers(true)
    try {
      await fetch('/api/settings/helpers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query_generation_model: queryGenerationModel,
          evaluation_model: evaluationModel,
        }),
      })
    } catch (error) {
      console.error('Error saving helper models:', error)
    } finally {
      setSavingHelpers(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const availableModels = getAvailableModels()

  return (
    <>
      {/* Header */}
      <div className="border-b lg:shrink-0" style={{ padding: '16px 32px' }}>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Configure your LLM provider API keys and helper models.</p>
      </div>

      {/* Content */}
      <div className="p-8 space-y-8 lg:flex-1 lg:overflow-y-auto">

        {/* Helper Models Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Helper Models</h2>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>AI Helper Configuration</CardTitle>
              <CardDescription>
                Select which models to use for generating queries and evaluating scan results.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {availableModels.length === 0 ? (
                <p className="text-sm text-muted-foreground">Configure at least one API key below to select helper models.</p>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="query-model">Query Generation Model</Label>
                      <Select value={queryGenerationModel} onValueChange={setQueryGenerationModel}>
                        <SelectTrigger id="query-model">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {availableModels.map(m => (
                            <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">Used when generating test queries with AI</p>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="eval-model">Evaluation Model</Label>
                      <Select value={evaluationModel} onValueChange={setEvaluationModel}>
                        <SelectTrigger id="eval-model">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {availableModels.map(m => (
                            <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">Used to analyze and score AI responses</p>
                    </div>
                  </div>
                  
                  <div className="flex justify-end">
                    <Button onClick={saveHelperModels} disabled={savingHelpers}>
                      {savingHelpers ? (
                        <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Saving...</>
                      ) : (
                        <><Save className="w-4 h-4 mr-2" /> Save Helper Settings</>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Separator />

        {/* API Keys Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">API Keys</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {configs.map((config) => (
              <Card key={config.provider}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{config.label}</CardTitle>
                    {config.hasKey && (
                      <Badge className="gap-1 border-0 bg-emerald-500/10 text-emerald-400">
                        <Check className="w-3 h-3 text-emerald-400" /> Configured
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor={`key-${config.provider}`}>API Key</Label>
                    <Input
                      id={`key-${config.provider}`}
                      type="password"
                      placeholder={config.hasKey ? '••••••••' : config.placeholder}
                      value={config.key}
                      onChange={(e) => updateConfig(config.provider, e.target.value)}
                    />
                    {config.hasKey && !config.key && (
                      <p className="text-xs text-muted-foreground">Leave empty to keep existing key</p>
                    )}
                  </div>

                  <div className="flex justify-end">
                    <Button
                      onClick={() => saveConfig(config.provider)}
                      disabled={saving === config.provider}
                    >
                      {saving === config.provider ? (
                        <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Saving...</>
                      ) : (
                        <><Save className="w-4 h-4 mr-2" /> Save</>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <Separator />

        {/* User Profile Section */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">User Profile</h2>

          <Card>
            <CardHeader>
              <CardTitle>Timezone</CardTitle>
              <CardDescription>
                Select your timezone for displaying dates and times correctly.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger id="timezone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map(tz => (
                        <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">All scan times and scheduled scans will use this timezone</p>
                </div>
                
                <div className="flex justify-end">
                  <Button onClick={saveProfile} disabled={savingProfile}>
                    {savingProfile ? (
                      <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Saving...</>
                    ) : (
                      <><Save className="w-4 h-4 mr-2" /> Save Timezone</>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
