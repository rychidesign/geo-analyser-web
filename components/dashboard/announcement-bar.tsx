'use client'

import { useState, useEffect } from 'react'
import { X, ExternalLink, Info, CheckCircle, AlertTriangle, AlertCircle, Megaphone, Bell, Star, Gift, Rocket, Heart, Sparkles, Zap } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface Announcement {
  id: string
  message: string
  color_type: 'info' | 'success' | 'warning' | 'error' | 'custom'
  custom_color: string | null
  icon: string
  link_url: string | null
  link_text: string | null
  is_dismissible: boolean
}

const COLOR_PRESETS = {
  info: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400' },
  success: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400' },
  warning: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400' },
  error: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400' },
  custom: { bg: '', border: '', text: '' },
}

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  info: Info,
  check: CheckCircle,
  warning: AlertTriangle,
  error: AlertCircle,
  megaphone: Megaphone,
  bell: Bell,
  star: Star,
  gift: Gift,
  rocket: Rocket,
  heart: Heart,
  sparkles: Sparkles,
  zap: Zap,
}

export function AnnouncementBar() {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAnnouncement()
  }, [])

  async function fetchAnnouncement() {
    try {
      const res = await fetch('/api/announcements')
      if (res.ok) {
        const data = await res.json()
        if (data.announcement) {
          // Check if this announcement was previously dismissed
          const dismissedIds = JSON.parse(localStorage.getItem('dismissedAnnouncements') || '[]')
          if (!dismissedIds.includes(data.announcement.id)) {
            setAnnouncement(data.announcement)
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch announcement:', error)
    } finally {
      setLoading(false)
    }
  }

  function dismiss() {
    if (announcement) {
      // Store dismissed announcement ID in localStorage
      const dismissedIds = JSON.parse(localStorage.getItem('dismissedAnnouncements') || '[]')
      dismissedIds.push(announcement.id)
      localStorage.setItem('dismissedAnnouncements', JSON.stringify(dismissedIds))
    }
    setDismissed(true)
  }

  if (loading || !announcement || dismissed) {
    return null
  }

  const colorType = announcement.color_type
  const isCustom = colorType === 'custom'
  const IconComponent = ICONS[announcement.icon] || Info

  const customStyles = isCustom && announcement.custom_color ? {
    backgroundColor: `${announcement.custom_color}15`,
    borderColor: `${announcement.custom_color}40`,
  } : undefined

  const customTextStyle = isCustom && announcement.custom_color ? {
    color: announcement.custom_color
  } : undefined

  return (
    <div 
      className={cn(
        'w-full px-4 py-3 border-b flex items-center justify-center gap-3',
        !isCustom && COLOR_PRESETS[colorType].bg,
        !isCustom && COLOR_PRESETS[colorType].border,
        !isCustom && COLOR_PRESETS[colorType].text
      )}
      style={customStyles}
    >
      <span style={customTextStyle}>
        <IconComponent 
          className={cn('w-5 h-5 flex-shrink-0', !isCustom && COLOR_PRESETS[colorType].text)} 
        />
      </span>
      
      <span 
        className={cn('text-sm', !isCustom && COLOR_PRESETS[colorType].text)}
        style={customTextStyle}
      >
        {announcement.message}
      </span>

      {announcement.link_url && (
        <Link
          href={announcement.link_url}
          target={announcement.link_url.startsWith('http') ? '_blank' : undefined}
          rel={announcement.link_url.startsWith('http') ? 'noopener noreferrer' : undefined}
          className={cn(
            'flex items-center gap-1 text-sm font-medium underline underline-offset-2 hover:opacity-80 transition-opacity',
            !isCustom && COLOR_PRESETS[colorType].text
          )}
          style={customTextStyle}
        >
          {announcement.link_text || 'Learn more'}
          <ExternalLink className="w-3 h-3" />
        </Link>
      )}

      {announcement.is_dismissible && (
        <button
          onClick={dismiss}
          className={cn(
            'ml-2 p-1 rounded-md hover:bg-white/10 transition-colors',
            !isCustom && COLOR_PRESETS[colorType].text
          )}
          style={customTextStyle}
          aria-label="Dismiss announcement"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
