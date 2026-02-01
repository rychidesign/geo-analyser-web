'use client'

import { useState, useEffect } from 'react'
import { 
  Megaphone, 
  Plus, 
  Edit2, 
  Trash2, 
  Check, 
  X, 
  ExternalLink,
  Info,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  Palette,
  Zap,
  Bell,
  Star,
  Gift,
  Rocket,
  Heart,
  Sparkles
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface Announcement {
  id: string
  message: string
  color_type: 'info' | 'success' | 'warning' | 'error' | 'custom'
  custom_color: string | null
  icon: string
  link_url: string | null
  link_text: string | null
  is_active: boolean
  is_dismissible: boolean
  show_to_tiers: string[]
  created_at: string
}

const COLOR_PRESETS = {
  info: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', label: 'Info' },
  success: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', label: 'Success' },
  warning: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', label: 'Warning' },
  error: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', label: 'Error' },
  custom: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400', label: 'Custom' },
}

const ICON_OPTIONS = [
  { value: 'info', icon: Info, label: 'Info' },
  { value: 'check', icon: CheckCircle, label: 'Check' },
  { value: 'warning', icon: AlertTriangle, label: 'Warning' },
  { value: 'error', icon: AlertCircle, label: 'Error' },
  { value: 'megaphone', icon: Megaphone, label: 'Megaphone' },
  { value: 'bell', icon: Bell, label: 'Bell' },
  { value: 'star', icon: Star, label: 'Star' },
  { value: 'gift', icon: Gift, label: 'Gift' },
  { value: 'rocket', icon: Rocket, label: 'Rocket' },
  { value: 'heart', icon: Heart, label: 'Heart' },
  { value: 'sparkles', icon: Sparkles, label: 'Sparkles' },
  { value: 'zap', icon: Zap, label: 'Zap' },
]

const TIER_OPTIONS = [
  { value: 'free', label: 'Free' },
  { value: 'paid', label: 'Paid' },
  { value: 'test', label: 'Test' },
  { value: 'admin', label: 'Admin' },
]

export function AnnouncementManager() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  
  // Form state
  const [formData, setFormData] = useState({
    message: '',
    color_type: 'info' as Announcement['color_type'],
    custom_color: '#6366f1',
    icon: 'info',
    link_url: '',
    link_text: '',
    show_to_tiers: ['free', 'paid', 'test', 'admin'],
    is_dismissible: true,
  })

  useEffect(() => {
    fetchAnnouncements()
  }, [])

  async function fetchAnnouncements() {
    try {
      const res = await fetch('/api/admin/announcements')
      if (res.ok) {
        const data = await res.json()
        setAnnouncements(data.announcements || [])
      }
    } catch (error) {
      console.error('Failed to fetch announcements:', error)
    } finally {
      setLoading(false)
    }
  }

  function resetForm() {
    setFormData({
      message: '',
      color_type: 'info',
      custom_color: '#6366f1',
      icon: 'info',
      link_url: '',
      link_text: '',
      show_to_tiers: ['free', 'paid', 'test', 'admin'],
      is_dismissible: true,
    })
  }

  function startEditing(announcement: Announcement) {
    setEditingId(announcement.id)
    setFormData({
      message: announcement.message,
      color_type: announcement.color_type,
      custom_color: announcement.custom_color || '#6366f1',
      icon: announcement.icon,
      link_url: announcement.link_url || '',
      link_text: announcement.link_text || '',
      show_to_tiers: announcement.show_to_tiers || ['free', 'paid', 'admin'],
      is_dismissible: announcement.is_dismissible ?? true,
    })
    setIsCreating(false)
  }

  function cancelEditing() {
    setEditingId(null)
    setIsCreating(false)
    resetForm()
  }

  async function saveAnnouncement(isActive: boolean = false) {
    if (!formData.message.trim()) {
      alert('Message is required')
      return
    }

    setActionLoading(true)
    try {
      const payload = {
        ...formData,
        is_active: isActive,
        custom_color: formData.color_type === 'custom' ? formData.custom_color : null,
      }

      let res
      if (editingId) {
        res = await fetch(`/api/admin/announcements/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        res = await fetch('/api/admin/announcements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      if (res.ok) {
        await fetchAnnouncements()
        cancelEditing()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to save announcement')
      }
    } catch (error) {
      console.error('Failed to save announcement:', error)
      alert('Failed to save announcement')
    } finally {
      setActionLoading(false)
    }
  }

  async function toggleActive(announcement: Announcement) {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/admin/announcements/${announcement.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !announcement.is_active }),
      })

      if (res.ok) {
        await fetchAnnouncements()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to update announcement')
      }
    } catch (error) {
      console.error('Failed to toggle announcement:', error)
    } finally {
      setActionLoading(false)
    }
  }

  async function deleteAnnouncement(id: string) {
    if (!confirm('Are you sure you want to delete this announcement?')) return

    setActionLoading(true)
    try {
      const res = await fetch(`/api/admin/announcements/${id}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        await fetchAnnouncements()
      } else {
        alert('Failed to delete announcement')
      }
    } catch (error) {
      console.error('Failed to delete announcement:', error)
    } finally {
      setActionLoading(false)
    }
  }

  function getIconComponent(iconName: string) {
    const iconOption = ICON_OPTIONS.find(i => i.value === iconName)
    return iconOption?.icon || Info
  }

  const colorStyles = formData.color_type === 'custom' 
    ? { 
        backgroundColor: `${formData.custom_color}15`, 
        borderColor: `${formData.custom_color}50`,
        color: formData.custom_color 
      }
    : undefined

  return (
    <Card className="mb-8">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="w-5 h-5" />
              Announcements
            </CardTitle>
            <CardDescription>Display important messages to users</CardDescription>
          </div>
          {!isCreating && !editingId && (
            <Button 
              onClick={() => { setIsCreating(true); resetForm() }}
              size="sm"
            >
              <Plus className="w-4 h-4 mr-1" />
              New Announcement
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Create/Edit Form */}
        {(isCreating || editingId) && (
          <div className="mb-6 p-4 bg-zinc-900/50 rounded-lg border border-zinc-800">
            <h4 className="font-medium mb-4">
              {editingId ? 'Edit Announcement' : 'Create New Announcement'}
            </h4>
            
            {/* Message */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-zinc-400 mb-1">Message *</label>
              <Input
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                placeholder="Enter announcement message..."
                className="bg-zinc-800"
              />
            </div>

            {/* Color Type */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-zinc-400 mb-2">Color</label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(COLOR_PRESETS) as Array<keyof typeof COLOR_PRESETS>).map((type) => (
                  <button
                    key={type}
                    onClick={() => setFormData({ ...formData, color_type: type })}
                    className={cn(
                      'px-3 py-1.5 rounded-md text-sm border transition-all',
                      COLOR_PRESETS[type].bg,
                      COLOR_PRESETS[type].border,
                      COLOR_PRESETS[type].text,
                      formData.color_type === type && 'ring-2 ring-offset-2 ring-offset-zinc-900'
                    )}
                  >
                    {COLOR_PRESETS[type].label}
                  </button>
                ))}
              </div>
              {formData.color_type === 'custom' && (
                <div className="mt-2 flex items-center gap-2">
                  <Palette className="w-4 h-4 text-zinc-400" />
                  <input
                    type="color"
                    value={formData.custom_color}
                    onChange={(e) => setFormData({ ...formData, custom_color: e.target.value })}
                    className="w-10 h-8 rounded cursor-pointer"
                  />
                  <Input
                    value={formData.custom_color}
                    onChange={(e) => setFormData({ ...formData, custom_color: e.target.value })}
                    placeholder="#6366f1"
                    className="w-28 bg-zinc-800"
                  />
                </div>
              )}
            </div>

            {/* Icon */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-zinc-400 mb-2">Icon</label>
              <div className="flex flex-wrap gap-2">
                {ICON_OPTIONS.map((option) => {
                  const IconComp = option.icon
                  return (
                    <button
                      key={option.value}
                      onClick={() => setFormData({ ...formData, icon: option.value })}
                      className={cn(
                        'p-2 rounded-md border border-zinc-700 transition-all',
                        formData.icon === option.value 
                          ? 'bg-zinc-700 text-white' 
                          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                      )}
                      title={option.label}
                    >
                      <IconComp className="w-4 h-4" />
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Link */}
            <div className="mb-4 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Link URL (optional)</label>
                <Input
                  value={formData.link_url}
                  onChange={(e) => setFormData({ ...formData, link_url: e.target.value })}
                  placeholder="https://..."
                  className="bg-zinc-800"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Link Text</label>
                <Input
                  value={formData.link_text}
                  onChange={(e) => setFormData({ ...formData, link_text: e.target.value })}
                  placeholder="Learn more"
                  className="bg-zinc-800"
                />
              </div>
            </div>

            {/* Show to Tiers */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-zinc-400 mb-2">Show to</label>
              <div className="flex gap-2">
                {TIER_OPTIONS.map((tier) => (
                  <button
                    key={tier.value}
                    onClick={() => {
                      const tiers = formData.show_to_tiers.includes(tier.value)
                        ? formData.show_to_tiers.filter(t => t !== tier.value)
                        : [...formData.show_to_tiers, tier.value]
                      setFormData({ ...formData, show_to_tiers: tiers })
                    }}
                    className={cn(
                      'px-3 py-1.5 rounded-md text-sm border transition-all',
                      formData.show_to_tiers.includes(tier.value)
                        ? 'bg-zinc-700 border-zinc-600 text-white'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                    )}
                  >
                    {tier.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Dismissible */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-zinc-400 mb-2">Options</label>
              <button
                onClick={() => setFormData({ ...formData, is_dismissible: !formData.is_dismissible })}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm border transition-all',
                  formData.is_dismissible
                    ? 'bg-zinc-700 border-zinc-600 text-white'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                )}
              >
                <X className="w-4 h-4" />
                Allow users to dismiss
              </button>
              <p className="text-xs text-zinc-500 mt-1">
                {formData.is_dismissible 
                  ? 'Users can close this announcement with the X button'
                  : 'Announcement will stay visible until deactivated'}
              </p>
            </div>

            {/* Preview */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-zinc-400 mb-2">Preview</label>
              <div 
                className={cn(
                  'p-3 rounded-lg border flex items-center gap-3',
                  formData.color_type !== 'custom' && COLOR_PRESETS[formData.color_type].bg,
                  formData.color_type !== 'custom' && COLOR_PRESETS[formData.color_type].border,
                  formData.color_type !== 'custom' && COLOR_PRESETS[formData.color_type].text
                )}
                style={colorStyles}
              >
                {(() => {
                  const IconComp = getIconComponent(formData.icon)
                  return <IconComp className="w-5 h-5 flex-shrink-0" />
                })()}
                <span className="flex-1">{formData.message || 'Your message here...'}</span>
                {formData.link_url && formData.link_text && (
                  <span className="flex items-center gap-1 font-medium underline">
                    {formData.link_text}
                    <ExternalLink className="w-3 h-3" />
                  </span>
                )}
                {formData.is_dismissible && (
                  <X className="w-4 h-4 opacity-50" />
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={cancelEditing} disabled={actionLoading}>
                Cancel
              </Button>
              <Button 
                variant="outline" 
                onClick={() => saveAnnouncement(false)} 
                disabled={actionLoading}
              >
                Save as Draft
              </Button>
              <Button 
                onClick={() => saveAnnouncement(true)} 
                disabled={actionLoading}
              >
                {editingId ? 'Save & Activate' : 'Create & Activate'}
              </Button>
            </div>
          </div>
        )}

        {/* Announcements List */}
        {loading ? (
          <div className="text-center py-8 text-zinc-500">Loading...</div>
        ) : announcements.length === 0 ? (
          <div className="text-center py-8 text-zinc-500">
            No announcements yet. Create one to get started.
          </div>
        ) : (
          <div className="space-y-3">
            {announcements.map((announcement) => {
              const colorType = announcement.color_type
              const colorStyle = colorType === 'custom' && announcement.custom_color
                ? { 
                    backgroundColor: `${announcement.custom_color}15`, 
                    borderColor: `${announcement.custom_color}50`,
                  }
                : undefined
              const IconComp = getIconComponent(announcement.icon)

              return (
                <div 
                  key={announcement.id}
                  className={cn(
                    'p-4 rounded-lg border flex items-center justify-between gap-4',
                    colorType !== 'custom' && COLOR_PRESETS[colorType].bg,
                    colorType !== 'custom' && COLOR_PRESETS[colorType].border,
                    !announcement.is_active && 'opacity-50'
                  )}
                  style={colorStyle}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <IconComp 
                      className={cn(
                        'w-5 h-5 flex-shrink-0',
                        colorType !== 'custom' && COLOR_PRESETS[colorType].text
                      )} 
                      style={colorType === 'custom' && announcement.custom_color ? { color: announcement.custom_color } : undefined}
                    />
                    <span 
                      className={cn(
                        'truncate',
                        colorType !== 'custom' && COLOR_PRESETS[colorType].text
                      )}
                      style={colorType === 'custom' && announcement.custom_color ? { color: announcement.custom_color } : undefined}
                    >
                      {announcement.message}
                    </span>
                    {announcement.link_url && (
                      <ExternalLink className="w-3 h-3 text-zinc-500 flex-shrink-0" />
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant={announcement.is_active ? 'default' : 'secondary'} className="text-xs">
                      {announcement.is_active ? 'Active' : 'Draft'}
                    </Badge>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => toggleActive(announcement)}
                      disabled={actionLoading}
                      title={announcement.is_active ? 'Deactivate' : 'Activate'}
                    >
                      {announcement.is_active ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => startEditing(announcement)}
                      disabled={actionLoading}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => deleteAnnouncement(announcement.id)}
                      disabled={actionLoading}
                      className="text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
