import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const MAX_SIZE = 2 * 1024 * 1024 // 2MB

/**
 * POST /api/settings/avatar - Upload avatar
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('avatar') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ 
        error: 'Invalid file type. Allowed: JPEG, PNG, GIF, WebP' 
      }, { status: 400 })
    }

    // Validate file size
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ 
        error: 'File too large. Maximum size: 2MB' 
      }, { status: 400 })
    }

    // Generate unique filename
    const ext = file.name.split('.').pop() || 'jpg'
    const fileName = `${user.id}/avatar.${ext}`

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = new Uint8Array(arrayBuffer)

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: true, // Replace existing
      })

    if (uploadError) {
      console.error('[Avatar Upload] Storage error:', uploadError)
      return NextResponse.json({ 
        error: 'Failed to upload file' 
      }, { status: 500 })
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(fileName)

    const avatarUrl = urlData.publicUrl + `?t=${Date.now()}` // Add cache buster

    // Update user profile with avatar URL using admin client
    const adminClient = createAdminClient()
    const { error: updateError } = await adminClient
      .from('user_profiles')
      .update({ avatar_url: avatarUrl })
      .eq('user_id', user.id)

    if (updateError) {
      console.error('[Avatar Upload] Profile update error:', updateError)
    }

    return NextResponse.json({ 
      success: true,
      avatarUrl,
    })
  } catch (error: any) {
    console.error('[Avatar Upload] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to upload avatar' }, 
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/settings/avatar - Remove avatar
 */
export async function DELETE() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Try to delete the avatar file (ignore errors if it doesn't exist)
    await supabase.storage
      .from('avatars')
      .remove([`${user.id}/avatar.jpg`, `${user.id}/avatar.png`, `${user.id}/avatar.gif`, `${user.id}/avatar.webp`])

    // Clear avatar URL from profile
    const adminClient = createAdminClient()
    await adminClient
      .from('user_profiles')
      .update({ avatar_url: null })
      .eq('user_id', user.id)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Avatar Delete] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete avatar' }, 
      { status: 500 }
    )
  }
}
