import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET - Get active announcement (public)
export async function GET() {
  try {
    const supabase = await createClient()
    
    // Get user tier if logged in
    const { data: { user } } = await supabase.auth.getUser()
    let userTier = 'free'
    
    if (user) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('tier')
        .eq('user_id', user.id)
        .single()
      
      if (profile) {
        userTier = profile.tier
      }
    }
    
    // Get active announcement
    const { data: announcement, error } = await supabase
      .from('announcements')
      .select('*')
      .eq('is_active', true)
      .single()
    
    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('[Announcements] Error fetching:', error)
      return NextResponse.json({ announcement: null })
    }
    
    // Check if announcement should be shown to user's tier
    if (announcement && announcement.show_to_tiers) {
      if (!announcement.show_to_tiers.includes(userTier)) {
        return NextResponse.json({ announcement: null })
      }
    }
    
    return NextResponse.json({ announcement })
  } catch (error) {
    console.error('[Announcements] Error:', error)
    return NextResponse.json({ announcement: null })
  }
}
