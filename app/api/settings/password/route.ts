import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/settings/password - Change password
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { currentPassword, newPassword } = body

    if (!newPassword) {
      return NextResponse.json({ error: 'New password is required' }, { status: 400 })
    }

    // Validate password strength
    if (newPassword.length < 8) {
      return NextResponse.json({ 
        error: 'Password must be at least 8 characters long' 
      }, { status: 400 })
    }

    // Supabase doesn't require current password verification when user is logged in
    // But for extra security, we can verify it first
    if (currentPassword) {
      // Verify current password by trying to sign in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email!,
        password: currentPassword,
      })

      if (signInError) {
        return NextResponse.json({ 
          error: 'Current password is incorrect' 
        }, { status: 400 })
      }
    }

    // Update password
    const { error } = await supabase.auth.updateUser({ 
      password: newPassword 
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ 
      success: true,
      message: 'Password updated successfully'
    })
  } catch (error: any) {
    console.error('[Password Settings] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update password' }, 
      { status: 500 }
    )
  }
}
