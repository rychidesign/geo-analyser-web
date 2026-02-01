'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { 
  Loader2, 
  Save, 
  Clock, 
  User, 
  Mail, 
  Lock, 
  Camera, 
  Trash2,
  Check,
  AlertCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

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

type Message = {
  type: 'success' | 'error'
  text: string
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  
  // Account state
  const [email, setEmail] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [savingEmail, setSavingEmail] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Password state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  
  // Profile state
  const [timezone, setTimezone] = useState('Europe/Prague')
  const [savingProfile, setSavingProfile] = useState(false)
  
  // Messages
  const [accountMessage, setAccountMessage] = useState<Message | null>(null)
  const [passwordMessage, setPasswordMessage] = useState<Message | null>(null)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      // Load account info
      const accountRes = await fetch('/api/settings/account')
      if (accountRes.ok) {
        const data = await accountRes.json()
        setEmail(data.email || '')
        setNewEmail(data.email || '')
        setAvatarUrl(data.avatarUrl)
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

  // Avatar handlers
  const handleAvatarClick = () => {
    fileInputRef.current?.click()
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingAvatar(true)
    try {
      const formData = new FormData()
      formData.append('avatar', file)

      const res = await fetch('/api/settings/avatar', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      if (res.ok) {
        setAvatarUrl(data.avatarUrl)
        setAccountMessage({ type: 'success', text: 'Avatar updated successfully' })
      } else {
        setAccountMessage({ type: 'error', text: data.error || 'Failed to upload avatar' })
      }
    } catch (error) {
      setAccountMessage({ type: 'error', text: 'Failed to upload avatar' })
    } finally {
      setUploadingAvatar(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleAvatarDelete = async () => {
    setUploadingAvatar(true)
    try {
      const res = await fetch('/api/settings/avatar', { method: 'DELETE' })
      if (res.ok) {
        setAvatarUrl(null)
        setAccountMessage({ type: 'success', text: 'Avatar removed' })
      }
    } catch (error) {
      setAccountMessage({ type: 'error', text: 'Failed to remove avatar' })
    } finally {
      setUploadingAvatar(false)
    }
  }

  // Email handler
  const saveEmail = async () => {
    if (newEmail === email) return
    
    setSavingEmail(true)
    setAccountMessage(null)
    try {
      const res = await fetch('/api/settings/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail }),
      })

      const data = await res.json()
      if (res.ok) {
        setAccountMessage({ type: 'success', text: data.message })
      } else {
        setAccountMessage({ type: 'error', text: data.error })
      }
    } catch (error) {
      setAccountMessage({ type: 'error', text: 'Failed to update email' })
    } finally {
      setSavingEmail(false)
    }
  }

  // Password handler
  const savePassword = async () => {
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'Passwords do not match' })
      return
    }
    
    if (newPassword.length < 8) {
      setPasswordMessage({ type: 'error', text: 'Password must be at least 8 characters' })
      return
    }

    setSavingPassword(true)
    setPasswordMessage(null)
    try {
      const res = await fetch('/api/settings/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })

      const data = await res.json()
      if (res.ok) {
        setPasswordMessage({ type: 'success', text: 'Password updated successfully' })
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } else {
        setPasswordMessage({ type: 'error', text: data.error })
      }
    } catch (error) {
      setPasswordMessage({ type: 'error', text: 'Failed to update password' })
    } finally {
      setSavingPassword(false)
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <>
      {/* Header */}
      <div className="border-b lg:shrink-0 px-4 py-4 lg:px-8">
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground">Manage your account and preferences.</p>
      </div>

      {/* Content */}
      <div className="px-4 py-4 lg:px-8 space-y-8 lg:flex-1 lg:overflow-y-auto">

        {/* Account Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Account</h2>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Profile Picture</CardTitle>
              <CardDescription>
                Click on the avatar to upload a new profile picture. Max 2MB.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <div className="relative group">
                  <button
                    onClick={handleAvatarClick}
                    disabled={uploadingAvatar}
                    className="relative w-24 h-24 rounded-full overflow-hidden bg-zinc-800 border-2 border-zinc-700 hover:border-zinc-600 transition-colors"
                  >
                    {avatarUrl ? (
                      <Image
                        src={avatarUrl}
                        alt="Avatar"
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-3xl font-semibold text-zinc-500">
                        {email.charAt(0).toUpperCase()}
                      </div>
                    )}
                    
                    {/* Overlay */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      {uploadingAvatar ? (
                        <Loader2 className="w-6 h-6 animate-spin text-white" />
                      ) : (
                        <Camera className="w-6 h-6 text-white" />
                      )}
                    </div>
                  </button>
                  
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    onChange={handleAvatarUpload}
                    className="hidden"
                  />
                </div>
                
                {avatarUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleAvatarDelete}
                    disabled={uploadingAvatar}
                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Remove
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Email Address
              </CardTitle>
              <CardDescription>
                Change your email address. You will need to confirm the new email.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {accountMessage && (
                  <div className={cn(
                    'flex items-center gap-2 p-3 rounded-lg text-sm',
                    accountMessage.type === 'success' 
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  )}>
                    {accountMessage.type === 'success' ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <AlertCircle className="w-4 h-4" />
                    )}
                    {accountMessage.text}
                  </div>
                )}
                
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="your@email.com"
                  />
                </div>
                
                <div className="flex justify-end">
                  <Button 
                    onClick={saveEmail} 
                    disabled={savingEmail || newEmail === email}
                  >
                    {savingEmail ? (
                      <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Saving...</>
                    ) : (
                      <><Save className="w-4 h-4 mr-2" /> Update Email</>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="w-4 h-4" />
                Change Password
              </CardTitle>
              <CardDescription>
                Update your password. Use a strong password with at least 8 characters.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {passwordMessage && (
                  <div className={cn(
                    'flex items-center gap-2 p-3 rounded-lg text-sm',
                    passwordMessage.type === 'success' 
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  )}>
                    {passwordMessage.type === 'success' ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <AlertCircle className="w-4 h-4" />
                    )}
                    {passwordMessage.text}
                  </div>
                )}
                
                <div className="space-y-2">
                  <Label htmlFor="current-password">Current Password</Label>
                  <Input
                    id="current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">New Password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm New Password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                  </div>
                </div>
                
                <div className="flex justify-end">
                  <Button 
                    onClick={savePassword} 
                    disabled={savingPassword || !newPassword || !confirmPassword}
                  >
                    {savingPassword ? (
                      <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Saving...</>
                    ) : (
                      <><Save className="w-4 h-4 mr-2" /> Update Password</>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Timezone
              </CardTitle>
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
