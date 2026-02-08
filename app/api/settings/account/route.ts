import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/settings/account - Get account info
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile for avatar
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('avatar_url')
      .eq('user_id', user.id)
      .single()

    return NextResponse.json({
      email: user.email,
      avatarUrl: profile?.avatar_url || null,
      createdAt: user.created_at,
    })
  } catch (error: unknown) {
    console.error('[Account Settings] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch account' }, 
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/settings/account - Update email
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { email } = body

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }

    // Update email - this will send a confirmation email to both old and new addresses
    const { error } = await supabase.auth.updateUser({ email })

    if (error) {
      console.error('[Account Settings] Email update error:', error.message)
      return NextResponse.json({ error: 'Failed to update email' }, { status: 400 })
    }

    return NextResponse.json({ 
      success: true,
      message: 'Confirmation email sent. Please check both your old and new email addresses.'
    })
  } catch (error: unknown) {
    console.error('[Account Settings] Error updating email:', error)
    return NextResponse.json(
      { error: 'Failed to update email' }, 
      { status: 500 }
    )
  }
}
