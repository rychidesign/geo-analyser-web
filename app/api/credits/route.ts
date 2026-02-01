import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserCreditInfo, checkAndResetFreeTierLimits } from '@/lib/credits'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Reset free tier limits if needed
    await checkAndResetFreeTierLimits(user.id)

    // Get credit info
    const credits = await getUserCreditInfo(user.id)

    if (!credits) {
      return NextResponse.json({ error: 'Failed to fetch credit info' }, { status: 500 })
    }

    // Get avatar URL from profile
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('avatar_url')
      .eq('user_id', user.id)
      .single()

    return NextResponse.json({ 
      credits,
      avatarUrl: profile?.avatar_url || null
    })
  } catch (error: any) {
    console.error('[Credits API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch credits' },
      { status: 500 }
    )
  }
}
