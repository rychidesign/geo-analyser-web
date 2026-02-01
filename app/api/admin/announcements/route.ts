import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Check if user is admin
async function isAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('tier')
    .eq('user_id', user.id)
    .single()
  
  return profile?.tier === 'admin'
}

// GET - List all announcements (admin only)
export async function GET() {
  try {
    const supabase = await createClient()
    
    if (!await isAdmin(supabase)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const adminClient = createAdminClient()
    const { data: announcements, error } = await adminClient
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('[Admin Announcements] Error fetching:', error)
      return NextResponse.json({ error: 'Failed to fetch announcements' }, { status: 500 })
    }
    
    return NextResponse.json({ announcements })
  } catch (error) {
    console.error('[Admin Announcements] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create new announcement (admin only)
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    
    if (!await isAdmin(supabase)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const { data: { user } } = await supabase.auth.getUser()
    const body = await request.json()
    
    const { message, color_type, custom_color, icon, link_url, link_text, is_active, show_to_tiers, is_dismissible } = body
    
    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }
    
    const adminClient = createAdminClient()
    
    // If activating this announcement, deactivate others first
    if (is_active) {
      await adminClient
        .from('announcements')
        .update({ is_active: false })
        .eq('is_active', true)
    }
    
    const { data: announcement, error } = await adminClient
      .from('announcements')
      .insert({
        message,
        color_type: color_type || 'info',
        custom_color: color_type === 'custom' ? custom_color : null,
        icon: icon || 'info',
        link_url: link_url || null,
        link_text: link_text || null,
        is_active: is_active || false,
        is_dismissible: is_dismissible ?? true,
        show_to_tiers: show_to_tiers || ['free', 'paid', 'test', 'admin'],
        created_by: user?.id
      })
      .select()
      .single()
    
    if (error) {
      console.error('[Admin Announcements] Error creating:', error)
      return NextResponse.json({ error: 'Failed to create announcement' }, { status: 500 })
    }
    
    return NextResponse.json({ announcement })
  } catch (error) {
    console.error('[Admin Announcements] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
