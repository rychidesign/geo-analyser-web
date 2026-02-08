import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserSettings, upsertUserSetting } from '@/lib/db/settings'
import { encrypt, isEncryptionConfigured } from '@/lib/crypto'
import { safeErrorMessage } from '@/lib/api-error'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const settings = await getUserSettings(user.id)
    
    // Never expose any part of the actual API key — just indicate presence
    const maskedSettings = settings.map(s => ({
      ...s,
      encrypted_api_key: null, // Never send encrypted data to client
      has_key: !!s.encrypted_api_key,
    }))
    
    return NextResponse.json(maskedSettings)
  } catch (error: unknown) {
    console.error('Error fetching settings:', error)
    return NextResponse.json(
      { error: safeErrorMessage(error, 'Failed to fetch settings') }, 
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

    // Encrypt the API key before storing
    let encryptedKey: string | null = null
    if (api_key) {
      if (!isEncryptionConfigured()) {
        console.error('[Settings] ENCRYPTION_KEY not configured — cannot store API key securely')
        return NextResponse.json(
          { error: 'Server encryption is not configured. Contact administrator.' },
          { status: 500 }
        )
      }
      encryptedKey = encrypt(api_key)
    }

    const setting = await upsertUserSetting({
      user_id: user.id,
      provider,
      encrypted_api_key: encryptedKey,
      model: model || getDefaultModel(provider),
      is_active: !!api_key,
    })

    return NextResponse.json({
      ...setting,
      encrypted_api_key: null, // Never send encrypted data to client
      has_key: !!setting.encrypted_api_key,
    })
  } catch (error: unknown) {
    console.error('Error saving setting:', error)
    return NextResponse.json(
      { error: safeErrorMessage(error, 'Failed to save setting') }, 
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
