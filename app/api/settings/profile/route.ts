import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserTimezone, setUserTimezone } from '@/lib/db/settings'
import { safeErrorMessage } from '@/lib/api-error'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const timezone = await getUserTimezone(user.id)
    
    return NextResponse.json({ timezone })
  } catch (error: unknown) {
    console.error('[Profile Settings] Error fetching profile:', error)
    return NextResponse.json(
      { error: safeErrorMessage(error, 'Failed to fetch profile settings') }, 
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { timezone } = body

    if (!timezone) {
      return NextResponse.json({ error: 'Timezone is required' }, { status: 400 })
    }

    await setUserTimezone(user.id, timezone)
    
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('[Profile Settings] Error saving profile:', error)
    return NextResponse.json(
      { error: safeErrorMessage(error, 'Failed to save profile settings') }, 
      { status: 500 }
    )
  }
}
