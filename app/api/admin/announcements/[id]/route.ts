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

// PATCH - Update announcement (admin only)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    
    if (!await isAdmin(supabase)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const body = await request.json()
    const { message, color_type, custom_color, icon, link_url, link_text, is_active, show_to_tiers, is_dismissible } = body
    
    const adminClient = createAdminClient()
    
    // If activating this announcement, deactivate others first
    if (is_active) {
      await adminClient
        .from('announcements')
        .update({ is_active: false })
        .neq('id', id)
    }
    
    const updateData: Record<string, unknown> = {}
    if (message !== undefined) updateData.message = message
    if (color_type !== undefined) updateData.color_type = color_type
    if (color_type === 'custom' && custom_color !== undefined) {
      updateData.custom_color = custom_color
    } else if (color_type !== 'custom') {
      updateData.custom_color = null
    }
    if (icon !== undefined) updateData.icon = icon
    if (link_url !== undefined) updateData.link_url = link_url || null
    if (link_text !== undefined) updateData.link_text = link_text || null
    if (is_active !== undefined) updateData.is_active = is_active
    if (show_to_tiers !== undefined) updateData.show_to_tiers = show_to_tiers
    if (is_dismissible !== undefined) updateData.is_dismissible = is_dismissible
    
    const { data: announcement, error } = await adminClient
      .from('announcements')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()
    
    if (error) {
      console.error('[Admin Announcements] Error updating:', error)
      return NextResponse.json({ error: 'Failed to update announcement' }, { status: 500 })
    }
    
    return NextResponse.json({ announcement })
  } catch (error) {
    console.error('[Admin Announcements] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE - Delete announcement (admin only)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    
    if (!await isAdmin(supabase)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const adminClient = createAdminClient()
    
    const { error } = await adminClient
      .from('announcements')
      .delete()
      .eq('id', id)
    
    if (error) {
      console.error('[Admin Announcements] Error deleting:', error)
      return NextResponse.json({ error: 'Failed to delete announcement' }, { status: 500 })
    }
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Admin Announcements] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
