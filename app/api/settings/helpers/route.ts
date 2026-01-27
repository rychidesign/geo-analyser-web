import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', '_helpers')
      .single()

    if (error && error.code !== 'PGRST116') {
      throw error
    }

    return NextResponse.json({
      query_generation_model: data?.model || 'gpt-5-mini',
      evaluation_model: data?.encrypted_api_key || 'gpt-5-mini', // repurposing field
    })
  } catch (error: any) {
    console.error('Error fetching helper settings:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch helper settings' }, 
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
    const { query_generation_model, evaluation_model } = body

    // Store helper settings using a special provider name
    const { data, error } = await supabase
      .from('user_settings')
      .upsert({
        user_id: user.id,
        provider: '_helpers',
        model: query_generation_model || 'gpt-5-mini',
        encrypted_api_key: evaluation_model || 'gpt-5-mini', // repurposing field
        is_active: true,
      }, { 
        onConflict: 'user_id,provider',
        ignoreDuplicates: false 
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      query_generation_model: data.model,
      evaluation_model: data.encrypted_api_key,
    })
  } catch (error: any) {
    console.error('Error saving helper settings:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to save helper settings' }, 
      { status: 500 }
    )
  }
}
