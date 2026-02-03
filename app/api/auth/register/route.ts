/**
 * Register API Route
 * Proxy pro Supabase auth s rate limitingem
 */
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { registrationRateLimiter } from '@/lib/rate-limit'

export async function POST(request: Request) {
  try {
    // Extra rate limiting pro registraci (přísnější než obecný auth limit)
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 
               request.headers.get('x-real-ip') || 
               'unknown'
    
    try {
      // Max 3 registrace za hodinu z jedné IP
      await registrationRateLimiter.check(3, `register:${ip}`)
    } catch {
      return NextResponse.json(
        { error: 'Too many registration attempts. Please try again later.' },
        { status: 429 }
      )
    }

    const body = await request.json()
    const { email, password } = body

    // Validace vstupu
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    // Validace email formátu
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      )
    }

    // Validace hesla
    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Získáme origin pro email redirect
    const origin = request.headers.get('origin') || 'http://localhost:3000'

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${origin}/auth/callback`,
      },
    })

    if (error) {
      // Kontrola specifických chyb
      if (error.message.includes('already registered')) {
        return NextResponse.json(
          { error: 'An account with this email already exists' },
          { status: 409 }
        )
      }
      
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Registration successful. Please check your email to confirm your account.',
      user: {
        id: data.user?.id,
        email: data.user?.email,
      },
    })
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
