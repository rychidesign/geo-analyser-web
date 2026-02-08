import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TABLES } from '@/lib/db/schema'
import { calculateNextScheduledScan } from '@/lib/scan/scheduling'

/**
 * CRON JOB: Queue Scheduled Scans & Spawn Workers
 *
 * Runs **every hour** (`0 * * * *`). For each hour it:
 *   1. Finds projects where `next_scheduled_scan_at <= NOW()`
 *   2. Advances `next_scheduled_scan_at` for ALL due projects (including free-tier)
 *   3. Creates `scheduled_scan_history` records for paid users only
 *   4. Spawns parallel workers to process the pending history queue
 *
 * Free-tier projects are silently skipped (no history record, no scan).
 * Their `next_scheduled_scan_at` is still advanced so they don't pile up
 * on every subsequent hourly run.
 */

export const runtime = 'nodejs'
export const maxDuration = 30

/** Maximum number of parallel process-scan workers to spawn. */
const PARALLEL_WORKERS = 10

// ---------------------------------------------------------------------------
// Auth & Supabase helpers
// ---------------------------------------------------------------------------

/** Verify the CRON_SECRET bearer token (bypassed in development). */
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (process.env.NODE_ENV === 'development') {
    return true
  }

  if (!cronSecret) {
    console.error('[Scheduled Scans] CRON_SECRET not configured')
    return false
  }

  return authHeader === `Bearer ${cronSecret}`
}

/** Create a Supabase admin client (service-role, bypasses RLS). */
function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface DueProject {
  id: string
  user_id: string
  name: string
  next_scheduled_scan_at: string
  scheduled_scan_frequency: string
  scheduled_scan_hour: number
  scheduled_scan_day: number | null
  scheduled_scan_day_of_month: number | null
}

/**
 * Fetch user timezones from the `_profile` settings row.
 *
 * @returns Map of `user_id → timezone` (defaults to `'Europe/Prague'`).
 */
async function fetchUserTimezones(
  supabase: ReturnType<typeof createAdminClient>,
  userIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>()

  if (userIds.length === 0) return map

  const { data } = await supabase
    .from(TABLES.USER_SETTINGS)
    .select('user_id, config')
    .eq('provider', '_profile')
    .in('user_id', userIds)

  for (const row of data ?? []) {
    const tz = (row.config as Record<string, unknown>)?.timezone
    map.set(row.user_id, typeof tz === 'string' ? tz : 'Europe/Prague')
  }

  return map
}

/**
 * Fetch user tiers from `user_profiles`.
 *
 * @returns Map of `user_id → tier`.
 */
async function fetchUserTiers(
  supabase: ReturnType<typeof createAdminClient>,
  userIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>()

  if (userIds.length === 0) return map

  const { data } = await supabase
    .from(TABLES.USER_PROFILES)
    .select('user_id, tier')
    .in('user_id', userIds)

  for (const row of data ?? []) {
    map.set(row.user_id, row.tier)
  }

  return map
}

/**
 * Calculate and persist the next `next_scheduled_scan_at` for a project.
 *
 * Uses the TypeScript `calculateNextScheduledScan()` helper rather than
 * relying on the Postgres trigger so the cron is self-contained.
 */
async function advanceNextScan(
  supabase: ReturnType<typeof createAdminClient>,
  project: DueProject,
  timezone: string,
  nowISO: string,
): Promise<string> {
  const nextScan = calculateNextScheduledScan({
    frequency: (project.scheduled_scan_frequency as 'daily' | 'weekly' | 'monthly') || 'weekly',
    hour: project.scheduled_scan_hour ?? 6,
    dayOfWeek: project.scheduled_scan_day ?? undefined,
    dayOfMonth: project.scheduled_scan_day_of_month ?? undefined,
    timezone,
  })

  await supabase
    .from(TABLES.PROJECTS)
    .update({
      last_scheduled_scan_at: nowISO,
      next_scheduled_scan_at: nextScan,
    })
    .eq('id', project.id)

  return nextScan
}

/**
 * Spawn `count` process-scan workers via fire-and-forget HTTP calls.
 */
function spawnWorkers(count: number): void {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[Scheduled Scans] Cannot spawn workers: CRON_SECRET not configured')
    return
  }

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const promises: Promise<Response | null>[] = []

  for (let i = 0; i < count; i++) {
    promises.push(
      fetch(`${baseUrl}/api/cron/process-scan?worker=${i}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cronSecret}`,
          'Content-Type': 'application/json',
        },
      }).catch((err) => {
        console.error(`[Scheduled Scans] Worker ${i} spawn failed:`, err.message)
        return null
      }),
    )
  }

  // Fire and forget — don't block the response.
  Promise.all(promises).then((results) => {
    const spawned = results.filter((r) => r !== null).length
    console.log(`[Scheduled Scans] Spawned ${spawned}/${count} workers`)
  })
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const startTime = Date.now()

  try {
    console.log('[Scheduled Scans] Starting hourly queue job...')

    const now = new Date()
    const nowISO = now.toISOString()

    // -----------------------------------------------------------------
    // 1. Find all projects that are due for scanning
    // -----------------------------------------------------------------
    const { data: rawProjects, error: projectsError } = await supabase
      .from(TABLES.PROJECTS)
      .select(
        'id, user_id, name, next_scheduled_scan_at, ' +
        'scheduled_scan_frequency, scheduled_scan_hour, ' +
        'scheduled_scan_day, scheduled_scan_day_of_month',
      )
      .eq('scheduled_scan_enabled', true)
      .lte('next_scheduled_scan_at', nowISO)
      .order('next_scheduled_scan_at', { ascending: true })

    if (projectsError) {
      console.error('[Scheduled Scans] Error fetching projects:', projectsError)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    const projects = (rawProjects ?? []) as unknown as DueProject[]

    if (projects.length === 0) {
      console.log('[Scheduled Scans] No projects due for scanning')
      return NextResponse.json({
        message: 'No scheduled scans due',
        queued: 0,
        skipped: 0,
        duration: Date.now() - startTime,
      })
    }

    console.log(`[Scheduled Scans] Found ${projects.length} due project(s)`)

    // -----------------------------------------------------------------
    // 2. Batch-fetch user tiers and timezones
    // -----------------------------------------------------------------
    const uniqueUserIds = [...new Set(projects.map((p) => p.user_id))]
    const [tierMap, timezoneMap] = await Promise.all([
      fetchUserTiers(supabase, uniqueUserIds),
      fetchUserTimezones(supabase, uniqueUserIds),
    ])

    // -----------------------------------------------------------------
    // 3. Split projects: eligible (paid) vs skipped (free)
    // -----------------------------------------------------------------
    const eligibleProjects: DueProject[] = []
    const skippedProjects: DueProject[] = []

    for (const project of projects) {
      const tier = tierMap.get(project.user_id)
      if (!tier || tier === 'free') {
        skippedProjects.push(project)
      } else {
        eligibleProjects.push(project)
      }
    }

    if (skippedProjects.length > 0) {
      console.log(`[Scheduled Scans] Skipping ${skippedProjects.length} free-tier project(s)`)
    }

    // -----------------------------------------------------------------
    // 4. Advance next_scheduled_scan_at for ALL due projects
    //    (prevents free-tier projects from piling up every hour)
    // -----------------------------------------------------------------
    const advancePromises = projects.map((project) => {
      const tz = timezoneMap.get(project.user_id) || 'Europe/Prague'
      return advanceNextScan(supabase, project as DueProject, tz, nowISO)
    })
    await Promise.all(advancePromises)

    // -----------------------------------------------------------------
    // 5. Create history records for eligible (paid) projects only
    // -----------------------------------------------------------------
    if (eligibleProjects.length === 0) {
      console.log('[Scheduled Scans] No eligible (paid) projects to queue')
      return NextResponse.json({
        message: 'No eligible projects (all free-tier)',
        queued: 0,
        skipped: skippedProjects.length,
        duration: Date.now() - startTime,
      })
    }

    const historyRecords = eligibleProjects.map((p) => ({
      project_id: p.id,
      scheduled_for: p.next_scheduled_scan_at,
      status: 'pending',
    }))

    const { data: history, error: historyError } = await supabase
      .from(TABLES.SCHEDULED_SCAN_HISTORY)
      .insert(historyRecords)
      .select('id, project_id')

    if (historyError) {
      console.error('[Scheduled Scans] Error creating history records:', historyError)
      return NextResponse.json({ error: 'Failed to queue scans' }, { status: 500 })
    }

    // -----------------------------------------------------------------
    // 6. Spawn parallel workers
    // -----------------------------------------------------------------
    const queuedCount = history?.length ?? 0
    const workersToSpawn = Math.min(PARALLEL_WORKERS, queuedCount)

    console.log(
      `[Scheduled Scans] Queued ${queuedCount} scan(s), spawning ${workersToSpawn} worker(s)...`,
    )

    spawnWorkers(workersToSpawn)

    return NextResponse.json({
      message: 'Scans queued, workers spawning',
      queued: queuedCount,
      skipped: skippedProjects.length,
      workers: workersToSpawn,
      projects: eligibleProjects.map((p) => ({ id: p.id, name: p.name })),
      duration: Date.now() - startTime,
    })
  } catch (error: unknown) {
    console.error('[Scheduled Scans] Fatal error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
