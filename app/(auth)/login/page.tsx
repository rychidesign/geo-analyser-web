'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [rateLimited, setRateLimited] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setRateLimited(false)
    setLoading(true)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (response.status === 429) {
        setRateLimited(true)
        setError(data.error || 'Too many login attempts. Please try again later.')
        return
      }

      if (!response.ok) {
        setError(data.error || 'Invalid email or password')
        return
      }

      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <Image 
            src="/app-icon.png" 
            alt="GEO Analyser" 
            width={40} 
            height={40}
            className="rounded-lg"
          />
          <span className="text-xl font-semibold">GEO Analyser</span>
        </div>

        {/* Form */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <h1 className="text-xl font-semibold mb-6 text-center">Sign In</h1>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            {error && (
              <div className={`text-sm p-3 rounded-md ${
                rateLimited 
                  ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400' 
                  : 'bg-red-500/10 border border-red-500/20 text-red-400'
              }`}>
                {rateLimited && (
                  <span className="font-semibold">⚠️ Rate Limited: </span>
                )}
                {error}
              </div>
            )}

            <Button 
              type="submit" 
              className="w-full bg-emerald-600 hover:bg-emerald-700" 
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-zinc-500">
            Don't have an account?{' '}
            <Link href="/register" className="text-emerald-500 hover:text-emerald-400">
              Sign up
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
