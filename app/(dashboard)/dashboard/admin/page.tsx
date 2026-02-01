import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getUserProfile } from '@/lib/credits'
import { AdminDashboard } from './admin-dashboard'

// Disable caching - always fetch fresh data
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/login')
  }

  // Check if user is admin
  const profile = await getUserProfile(user.id)
  
  if (!profile || profile.tier !== 'admin') {
    redirect('/dashboard')
  }

  return <AdminDashboard />
}
