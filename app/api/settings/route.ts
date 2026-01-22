import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserSettings, upsertUserSetting } from '@/lib/db/settings'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const settings = await getUserSettings(user.id)
    
    // Mask API keys for security - show only last 4 characters
    const maskedSettings = settings.map(s => ({
      ...s,
      encrypted_api_key: s.encrypted_api_key 
        ? `****${s.encrypted_api_key.slice(-4)}`
        : null,
      has_key: !!s.encrypted_api_key,
    }))
    
    return NextResponse.json(maskedSettings)
  } catch (error: any) {
    console.error('Error fetching settings:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch settings' }, 
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { provider, api_key, model } = body

    if (!provider) {
      return NextResponse.json({ error: 'Provider is required' }, { status: 400 })
    }

    const validProviders = ['openai', 'anthropic', 'google']
    if (!validProviders.includes(provider)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
    }

    // Note: In production, you should encrypt the API key before storing
    // For now, we'll store it as-is (Supabase RLS protects it)
    const setting = await upsertUserSetting({
      user_id: user.id,
      provider,
      encrypted_api_key: api_key || null,
      model: model || getDefaultModel(provider),
      is_active: !!api_key,
    })

    return NextResponse.json({
      ...setting,
      encrypted_api_key: setting.encrypted_api_key 
        ? `****${setting.encrypted_api_key.slice(-4)}`
        : null,
      has_key: !!setting.encrypted_api_key,
    })
  } catch (error: any) {
    console.error('Error saving setting:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to save setting' }, 
      { status: 500 }
    )
  }
}

function getDefaultModel(provider: string): string {
  const defaults: Record<string, string> = {
    openai: 'gpt-4o',
    anthropic: 'claude-3-5-sonnet-20241022',
    google: 'gemini-1.5-pro',
  }
  return defaults[provider] || ''
}
