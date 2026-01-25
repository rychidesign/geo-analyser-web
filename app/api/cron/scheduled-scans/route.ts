import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { TABLES } from '@/lib/db/schema'

// Use service role for cron jobs (bypasses RLS)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes max for Vercel Pro

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = new Date()
  const dayOfWeek = today.getDay() // 0 = Sunday, 6 = Saturday

  console.log(`[Scheduled Scans] Running for day ${dayOfWeek} (${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek]})`)

  try {
    // Find all projects with scheduled scans enabled for today
    const { data: projects, error: projectsError } = await supabase
      .from(TABLES.PROJECTS)
      .select('*, user_settings:user_id(id)')
      .eq('scheduled_scan_enabled', true)
      .eq('scheduled_scan_day', dayOfWeek)

    if (projectsError) {
      console.error('[Scheduled Scans] Error fetching projects:', projectsError)
      return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 })
    }

    if (!projects || projects.length === 0) {
      console.log('[Scheduled Scans] No projects scheduled for today')
      return NextResponse.json({ message: 'No scheduled scans for today', processed: 0 })
    }

    console.log(`[Scheduled Scans] Found ${projects.length} projects to scan`)

    // Add all scheduled projects to queue
    const queueItems = projects.map(project => ({
      user_id: project.user_id,
      project_id: project.id,
      status: 'pending',
      priority: 0, // Normal priority for scheduled scans
      progress_current: 0,
      progress_total: 0,
      is_scheduled: true,
      scheduled_for: new Date().toISOString(),
    }))

    const { data: queued, error: queueError } = await supabase
      .from('scan_queue')
      .insert(queueItems)
      .select()

    if (queueError) {
      console.error('[Scheduled Scans] Error queueing projects:', queueError)
      return NextResponse.json({ error: 'Failed to queue scans' }, { status: 500 })
    }

    console.log(`[Scheduled Scans] Queued ${queued?.length || 0} projects`)

    // Update last scheduled scan timestamp for all projects
    const projectIds = projects.map(p => p.id)
    await supabase
      .from(TABLES.PROJECTS)
      .update({ last_scheduled_scan_at: new Date().toISOString() })
      .in('id', projectIds)

    // Queue processing will be handled automatically by the process-queue cron job
    console.log('[Scheduled Scans] Queue will be processed by cron job')

    return NextResponse.json({
      message: 'Scheduled scans queued',
      queued: queued?.length || 0,
      projects: projects.map(p => ({ id: p.id, name: p.name })),
    })
  } catch (error) {
    console.error('[Scheduled Scans] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
