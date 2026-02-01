import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserCreditInfo, checkAndResetFreeTierLimits } from '@/lib/credits'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Reset free tier limits if needed (don't fail if this errors)
    try {
      await checkAndResetFreeTierLimits(user.id)
    } catch (resetError) {
      console.warn('[Credits API] Failed to reset tier limits:', resetError)
    }

    // Get credit info
    const credits = await getUserCreditInfo(user.id)
    console.log('[Credits API] Credits for user', user.id, ':', credits)

    if (!credits) {
      console.error('[Credits API] getUserCreditInfo returned null for user:', user.id)
      return NextResponse.json({ error: 'Failed to fetch credit info' }, { status: 500 })
    }

    // Get avatar URL from profile (don't fail if this errors)
    let avatarUrl = null
    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('avatar_url')
        .eq('user_id', user.id)
        .single()
      avatarUrl = profile?.avatar_url || null
    } catch (avatarError) {
      console.warn('[Credits API] Failed to fetch avatar:', avatarError)
    }

    return NextResponse.json({ 
      credits,
      avatarUrl
    })
  } catch (error: any) {
    console.error('[Credits API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch credits' },
      { status: 500 }
    )
  }
}
