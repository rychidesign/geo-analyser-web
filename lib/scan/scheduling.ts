/**
 * Scheduling logic for planned (cron) scans.
 *
 * Calculates the next UTC timestamp for a scheduled scan based on
 * frequency (daily / weekly / monthly), desired hour, day, and the
 * user's IANA timezone.
 *
 * Uses only built-in `Intl.DateTimeFormat` — no external date libraries.
 *
 * @module lib/scan/scheduling
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Parameters accepted by {@link calculateNextScheduledScan}. */
export interface ScheduleParams {
  /** How often the scan should run. */
  frequency: 'daily' | 'weekly' | 'monthly'
  /** Hour of day in the user's timezone (0-23). */
  hour: number
  /** Day of week for weekly scans (0 = Sunday … 6 = Saturday). */
  dayOfWeek?: number
  /** Day of month for monthly scans (1-28). */
  dayOfMonth?: number
  /** IANA timezone identifier, e.g. `'Europe/Prague'`. */
  timezone: string
  /** ISO-8601 timestamp of the most recent scan (unused for now, reserved). */
  lastScanAt?: string
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Date-parts extracted in a specific timezone. */
interface DateParts {
  year: number
  /** 0-based month (0 = January). */
  month: number
  day: number
  hour: number
  minute: number
  second: number
  /** 0 = Sunday … 6 = Saturday. */
  dayOfWeek: number
}

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

/**
 * Extract date/time components for a given `Date` as they appear in `timezone`.
 *
 * @param date     - Reference date (UTC-based `Date` object).
 * @param timezone - IANA timezone, e.g. `'America/New_York'`.
 * @returns Components of the wall-clock time in that timezone.
 */
function getDatePartsInTimezone(date: Date, timezone: string): DateParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
    weekday: 'short',
  })

  const parts = formatter.formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '0'

  const rawHour = parseInt(get('hour'), 10)

  return {
    year: parseInt(get('year'), 10),
    month: parseInt(get('month'), 10) - 1, // 0-based
    day: parseInt(get('day'), 10),
    hour: rawHour === 24 ? 0 : rawHour, // midnight edge-case in some locales
    minute: parseInt(get('minute'), 10),
    second: parseInt(get('second'), 10),
    dayOfWeek: WEEKDAY_MAP[get('weekday')] ?? 0,
  }
}

/**
 * Return the UTC offset **in minutes** for `timezone` at the given instant.
 *
 * Positive values mean the timezone is *ahead* of UTC (e.g. CET → +60).
 *
 * @param date     - The instant at which the offset is evaluated.
 * @param timezone - IANA timezone identifier.
 */
function getTimezoneOffsetMinutes(date: Date, timezone: string): number {
  // Render the same instant in both UTC and the target timezone, then compare.
  const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' })
  const tzStr = date.toLocaleString('en-US', { timeZone: timezone })
  return Math.round((new Date(tzStr).getTime() - new Date(utcStr).getTime()) / 60_000)
}

/**
 * Convert a "wall-clock" time (`year`, `month`, `day`, `hour` in `timezone`)
 * to a proper UTC `Date`.
 *
 * Handles DST transitions with a two-pass approach: the offset used for the
 * first conversion is verified at the resulting UTC instant and corrected if
 * it changed (which happens during spring-forward / fall-back transitions).
 *
 * @param year     - Full year in user timezone.
 * @param month    - 0-based month in user timezone.
 * @param day      - Day-of-month in user timezone.
 * @param hour     - Hour (0-23) in user timezone.
 * @param timezone - IANA timezone identifier.
 * @returns A `Date` representing the exact UTC instant.
 */
function wallClockToUTC(
  year: number,
  month: number,
  day: number,
  hour: number,
  timezone: string,
): Date {
  // Treat the wall-clock values as if they were UTC to get an approximate date.
  const approx = new Date(Date.UTC(year, month, day, hour, 0, 0, 0))

  // First-pass offset.
  const offset1 = getTimezoneOffsetMinutes(approx, timezone)
  const utc1 = new Date(approx.getTime() - offset1 * 60_000)

  // Second pass: the offset may differ at the *actual* UTC instant (DST edge).
  const offset2 = getTimezoneOffsetMinutes(utc1, timezone)
  if (offset1 !== offset2) {
    return new Date(approx.getTime() - offset2 * 60_000)
  }

  return utc1
}

/**
 * Build a UTC `Date` for the date that is `daysAhead` days from `base`,
 * at the specified `hour` in `timezone`.
 */
function addDaysToCandidate(
  base: DateParts,
  daysAhead: number,
  hour: number,
  timezone: string,
): Date {
  // Use UTC arithmetic to safely cross month/year boundaries.
  const futureUTC = new Date(Date.UTC(base.year, base.month, base.day + daysAhead, 12, 0, 0))
  const futureParts = getDatePartsInTimezone(futureUTC, timezone)
  return wallClockToUTC(futureParts.year, futureParts.month, futureParts.day, hour, timezone)
}

/**
 * Get the first day of next month (relative to `base`) at `hour` in `timezone`.
 *
 * @param base       - Current date parts in the user's timezone.
 * @param dayOfMonth - Desired day of month (1-28).
 * @param hour       - Desired hour (0-23) in user timezone.
 * @param timezone   - IANA timezone identifier.
 */
function nextMonthCandidate(
  base: DateParts,
  dayOfMonth: number,
  hour: number,
  timezone: string,
): Date {
  let nextMonth = base.month + 1
  let nextYear = base.year
  if (nextMonth > 11) {
    nextMonth = 0
    nextYear++
  }
  const safeDay = Math.min(dayOfMonth, 28)
  return wallClockToUTC(nextYear, nextMonth, safeDay, hour, timezone)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calculate the next UTC timestamp for a scheduled scan.
 *
 * The function determines the earliest **future** moment that matches the
 * requested schedule. Times are specified in the user's local timezone and
 * the result is always returned as a UTC ISO-8601 string.
 *
 * @param params - Schedule configuration (frequency, hour, day, timezone).
 * @param now    - Override "current time" for deterministic testing.
 * @returns ISO-8601 UTC string for the next scheduled scan.
 *
 * @example
 * ```ts
 * const next = calculateNextScheduledScan({
 *   frequency: 'daily',
 *   hour: 6,
 *   timezone: 'Europe/Prague',
 * })
 * // → e.g. "2026-02-09T05:00:00.000Z"  (6 AM Prague = 5 AM UTC in winter)
 * ```
 */
export function calculateNextScheduledScan(params: ScheduleParams, now?: Date): string {
  const currentTime = now ?? new Date()
  const { frequency, hour, timezone } = params
  const dayOfWeek = params.dayOfWeek ?? 1 // default Monday
  const dayOfMonth = params.dayOfMonth ?? 1 // default 1st

  // Current date parts in user timezone.
  const nowParts = getDatePartsInTimezone(currentTime, timezone)

  switch (frequency) {
    // ------------------------------------------------------------------
    // DAILY: run every day at `hour` in user timezone
    // ------------------------------------------------------------------
    case 'daily': {
      const candidate = wallClockToUTC(nowParts.year, nowParts.month, nowParts.day, hour, timezone)

      if (candidate.getTime() > currentTime.getTime()) {
        return candidate.toISOString()
      }

      // Already passed today → tomorrow.
      return addDaysToCandidate(nowParts, 1, hour, timezone).toISOString()
    }

    // ------------------------------------------------------------------
    // WEEKLY: run every `dayOfWeek` at `hour` in user timezone
    // ------------------------------------------------------------------
    case 'weekly': {
      let daysUntil = dayOfWeek - nowParts.dayOfWeek
      if (daysUntil < 0) daysUntil += 7

      if (daysUntil === 0) {
        // Same weekday — check whether the hour has passed.
        const candidate = wallClockToUTC(
          nowParts.year,
          nowParts.month,
          nowParts.day,
          hour,
          timezone,
        )
        if (candidate.getTime() > currentTime.getTime()) {
          return candidate.toISOString()
        }
        // Hour already passed → next week.
        daysUntil = 7
      }

      return addDaysToCandidate(nowParts, daysUntil, hour, timezone).toISOString()
    }

    // ------------------------------------------------------------------
    // MONTHLY: run on `dayOfMonth` at `hour` in user timezone
    // ------------------------------------------------------------------
    case 'monthly': {
      const safeDayOfMonth = Math.min(dayOfMonth, 28)

      if (nowParts.day === safeDayOfMonth) {
        // Same day — check whether the hour has passed.
        const candidate = wallClockToUTC(
          nowParts.year,
          nowParts.month,
          nowParts.day,
          hour,
          timezone,
        )
        if (candidate.getTime() > currentTime.getTime()) {
          return candidate.toISOString()
        }
        // Hour passed → next month.
        return nextMonthCandidate(nowParts, safeDayOfMonth, hour, timezone).toISOString()
      }

      if (nowParts.day < safeDayOfMonth) {
        // Day hasn't arrived yet this month.
        return wallClockToUTC(
          nowParts.year,
          nowParts.month,
          safeDayOfMonth,
          hour,
          timezone,
        ).toISOString()
      }

      // Day already passed this month → next month.
      return nextMonthCandidate(nowParts, safeDayOfMonth, hour, timezone).toISOString()
    }

    default: {
      // Defensive fallback — treat as weekly.
      return calculateNextScheduledScan({ ...params, frequency: 'weekly' }, currentTime)
    }
  }
}

/**
 * Format the next scheduled scan time for display in the UI.
 *
 * @param isoString - UTC ISO-8601 string (from {@link calculateNextScheduledScan}).
 * @param timezone  - IANA timezone to format into.
 * @returns Human-readable string, e.g. `"Monday, Feb 10, 2026 at 6:00 AM"`.
 */
export function formatNextScanTime(isoString: string, timezone: string): string {
  const date = new Date(isoString)

  return date.toLocaleString('en-US', {
    timeZone: timezone,
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

/**
 * Validate that a timezone string is a valid IANA timezone.
 *
 * @param timezone - The timezone string to validate.
 * @returns `true` if the timezone is recognised by the runtime.
 */
export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone })
    return true
  } catch {
    return false
  }
}

/**
 * Get a human-readable description of a schedule.
 *
 * @param params - Schedule configuration.
 * @returns E.g. `"Daily at 6:00 AM"`, `"Every Monday at 8:00 AM"`, `"15th of every month at 10:00 AM"`.
 */
export function describeSchedule(params: {
  frequency: 'daily' | 'weekly' | 'monthly'
  hour: number
  dayOfWeek?: number
  dayOfMonth?: number
}): string {
  const { frequency, hour } = params
  const dayOfWeek = params.dayOfWeek ?? 1
  const dayOfMonth = params.dayOfMonth ?? 1

  // Format hour as 12h AM/PM
  const hourFormatted = formatHour(hour)

  switch (frequency) {
    case 'daily':
      return `Daily at ${hourFormatted}`

    case 'weekly': {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      const dayName = dayNames[dayOfWeek] ?? 'Monday'
      return `Every ${dayName} at ${hourFormatted}`
    }

    case 'monthly': {
      const suffix = getOrdinalSuffix(dayOfMonth)
      return `${dayOfMonth}${suffix} of every month at ${hourFormatted}`
    }

    default:
      return `Scheduled`
  }
}

// ---------------------------------------------------------------------------
// Private formatting helpers
// ---------------------------------------------------------------------------

/**
 * Format hour (0-23) as 12h AM/PM string.
 *
 * @param hour - Hour in 24h format.
 * @returns E.g. `"6:00 AM"`, `"2:00 PM"`, `"12:00 AM"`.
 */
function formatHour(hour: number): string {
  const h = hour % 12 || 12
  const ampm = hour < 12 ? 'AM' : 'PM'
  return `${h}:00 ${ampm}`
}

/**
 * Get ordinal suffix for a number.
 *
 * @param n - Positive integer.
 * @returns `"st"`, `"nd"`, `"rd"`, or `"th"`.
 */
function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return s[(v - 20) % 10] || s[v] || s[0]
}
