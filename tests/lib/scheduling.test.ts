import { describe, it, expect } from 'vitest'
import { calculateNextScheduledScan, type ScheduleParams } from '@/lib/scan/scheduling'

describe('Scheduling Logic', () => {
  describe('calculateNextScheduledScan - Daily', () => {
    it('schedules daily scan in Prague timezone at 6:00 AM', () => {
      // February 8, 2026 at 10:00 AM Prague time (9:00 AM UTC in winter)
      const now = new Date('2026-02-08T09:00:00.000Z')

      const params: ScheduleParams = {
        frequency: 'daily',
        hour: 6,
        timezone: 'Europe/Prague',
      }

      const next = calculateNextScheduledScan(params, now)
      const nextDate = new Date(next)

      // Should schedule for next day at 6:00 AM Prague = 5:00 AM UTC
      expect(nextDate.toISOString()).toBe('2026-02-09T05:00:00.000Z')
    })

    it('schedules daily scan in New York timezone at 2:00 PM', () => {
      // February 8, 2026 at 10:00 AM EST (3:00 PM UTC)
      const now = new Date('2026-02-08T15:00:00.000Z')

      const params: ScheduleParams = {
        frequency: 'daily',
        hour: 14, // 2:00 PM
        timezone: 'America/New_York',
      }

      const next = calculateNextScheduledScan(params, now)
      const nextDate = new Date(next)

      // Should schedule for same day at 2:00 PM EST = 7:00 PM UTC (EST is UTC-5)
      expect(nextDate.toISOString()).toBe('2026-02-08T19:00:00.000Z')
    })

    it('schedules for next day when hour has already passed', () => {
      // February 8, 2026 at 8:00 AM Prague time (7:00 AM UTC)
      const now = new Date('2026-02-08T07:00:00.000Z')

      const params: ScheduleParams = {
        frequency: 'daily',
        hour: 6, // 6:00 AM - already passed
        timezone: 'Europe/Prague',
      }

      const next = calculateNextScheduledScan(params, now)
      const nextDate = new Date(next)

      // Should schedule for tomorrow at 6:00 AM Prague = 5:00 AM UTC
      expect(nextDate.toISOString()).toBe('2026-02-09T05:00:00.000Z')
    })
  })

  describe('calculateNextScheduledScan - Weekly', () => {
    it('schedules weekly scan on Monday at 8:00 AM in Tokyo', () => {
      // February 8, 2026 is Sunday at 12:00 PM Tokyo time (3:00 AM UTC)
      const now = new Date('2026-02-08T03:00:00.000Z')

      const params: ScheduleParams = {
        frequency: 'weekly',
        hour: 8,
        dayOfWeek: 1, // Monday
        timezone: 'Asia/Tokyo',
      }

      const next = calculateNextScheduledScan(params, now)
      const nextDate = new Date(next)

      // Should schedule for Monday Feb 9 at 8:00 AM Tokyo = 11:00 PM Feb 8 UTC (JST is UTC+9)
      expect(nextDate.toISOString()).toBe('2026-02-08T23:00:00.000Z')
    })

    it('schedules for next week when hour has passed on same weekday', () => {
      // February 9, 2026 is Monday at 12:00 PM Prague time (11:00 AM UTC)
      const now = new Date('2026-02-09T11:00:00.000Z')

      const params: ScheduleParams = {
        frequency: 'weekly',
        hour: 6, // 6:00 AM - already passed today
        dayOfWeek: 1, // Monday (today)
        timezone: 'Europe/Prague',
      }

      const next = calculateNextScheduledScan(params, now)
      const nextDate = new Date(next)

      // Should schedule for next Monday (Feb 16) at 6:00 AM Prague = 5:00 AM UTC
      expect(nextDate.toISOString()).toBe('2026-02-16T05:00:00.000Z')
    })

    it('schedules for later this week when day has not arrived yet', () => {
      // February 9, 2026 is Monday at 10:00 AM Prague time (9:00 AM UTC)
      const now = new Date('2026-02-09T09:00:00.000Z')

      const params: ScheduleParams = {
        frequency: 'weekly',
        hour: 14, // 2:00 PM
        dayOfWeek: 3, // Wednesday
        timezone: 'Europe/Prague',
      }

      const next = calculateNextScheduledScan(params, now)
      const nextDate = new Date(next)

      // Should schedule for Wednesday Feb 11 at 2:00 PM Prague = 1:00 PM UTC
      expect(nextDate.toISOString()).toBe('2026-02-11T13:00:00.000Z')
    })
  })

  describe('calculateNextScheduledScan - Monthly', () => {
    it('schedules monthly scan on 15th at 10:00 AM UTC', () => {
      // February 8, 2026 at 9:00 AM UTC
      const now = new Date('2026-02-08T09:00:00.000Z')

      const params: ScheduleParams = {
        frequency: 'monthly',
        hour: 10,
        dayOfMonth: 15,
        timezone: 'UTC',
      }

      const next = calculateNextScheduledScan(params, now)
      const nextDate = new Date(next)

      // Should schedule for Feb 15 at 10:00 AM UTC
      expect(nextDate.toISOString()).toBe('2026-02-15T10:00:00.000Z')
    })

    it('schedules for next month when day has already passed', () => {
      // February 20, 2026 at 9:00 AM UTC
      const now = new Date('2026-02-20T09:00:00.000Z')

      const params: ScheduleParams = {
        frequency: 'monthly',
        hour: 10,
        dayOfMonth: 15, // Already passed
        timezone: 'UTC',
      }

      const next = calculateNextScheduledScan(params, now)
      const nextDate = new Date(next)

      // Should schedule for March 15 at 10:00 AM UTC
      expect(nextDate.toISOString()).toBe('2026-03-15T10:00:00.000Z')
    })

    it('handles day 28 safely in February', () => {
      // February 5, 2026 at 9:00 AM UTC
      const now = new Date('2026-02-05T09:00:00.000Z')

      const params: ScheduleParams = {
        frequency: 'monthly',
        hour: 6,
        dayOfMonth: 28, // Last safe day
        timezone: 'UTC',
      }

      const next = calculateNextScheduledScan(params, now)
      const nextDate = new Date(next)

      // Should schedule for Feb 28 at 6:00 AM UTC
      expect(nextDate.toISOString()).toBe('2026-02-28T06:00:00.000Z')
    })

    it('schedules for next month when on same day but hour has passed', () => {
      // February 15, 2026 at 3:00 PM UTC (15:00)
      const now = new Date('2026-02-15T15:00:00.000Z')

      const params: ScheduleParams = {
        frequency: 'monthly',
        hour: 10, // 10:00 AM - already passed today
        dayOfMonth: 15, // Today
        timezone: 'UTC',
      }

      const next = calculateNextScheduledScan(params, now)
      const nextDate = new Date(next)

      // Should schedule for March 15 at 10:00 AM UTC
      expect(nextDate.toISOString()).toBe('2026-03-15T10:00:00.000Z')
    })
  })

  describe('DST Transitions', () => {
    it('handles spring DST transition in New York (March 8, 2026)', () => {
      // March 7, 2026 at 10:00 AM EST (before DST switch at 2 AM on March 8)
      const now = new Date('2026-03-07T15:00:00.000Z') // 10:00 AM EST

      const params: ScheduleParams = {
        frequency: 'daily',
        hour: 6, // 6:00 AM
        timezone: 'America/New_York',
      }

      const next = calculateNextScheduledScan(params, now)
      const nextDate = new Date(next)

      // Should schedule for March 8 at 6:00 AM EDT (after DST)
      // 6:00 AM EDT = 10:00 AM UTC (EDT is UTC-4)
      expect(nextDate.toISOString()).toBe('2026-03-08T10:00:00.000Z')
    })

    it('handles fall DST transition in Europe/Prague (October 25, 2026)', () => {
      // October 24, 2026 at 10:00 AM CEST (before DST switch at 3 AM on October 25)
      const now = new Date('2026-10-24T08:00:00.000Z') // 10:00 AM CEST

      const params: ScheduleParams = {
        frequency: 'daily',
        hour: 6, // 6:00 AM
        timezone: 'Europe/Prague',
      }

      const next = calculateNextScheduledScan(params, now)
      const nextDate = new Date(next)

      // Should schedule for October 25 at 6:00 AM CET (after DST)
      // 6:00 AM CET = 5:00 AM UTC (CET is UTC+1)
      expect(nextDate.toISOString()).toBe('2026-10-25T05:00:00.000Z')
    })
  })

  describe('Edge Cases', () => {
    it('handles timezone with no DST (Asia/Tokyo)', () => {
      // February 8, 2026 at 6:00 AM JST (Feb 7 at 9:00 PM UTC)
      const now = new Date('2026-02-07T21:00:00.000Z')

      const params: ScheduleParams = {
        frequency: 'daily',
        hour: 9, // 9:00 AM JST
        timezone: 'Asia/Tokyo',
      }

      const next = calculateNextScheduledScan(params, now)
      const nextDate = new Date(next)

      // Should schedule for same day at 9:00 AM JST = 12:00 AM Feb 8 UTC (JST is UTC+9)
      expect(nextDate.toISOString()).toBe('2026-02-08T00:00:00.000Z')
    })

    it('handles midnight hour (0:00)', () => {
      // February 8, 2026 at 10:00 AM UTC
      const now = new Date('2026-02-08T10:00:00.000Z')

      const params: ScheduleParams = {
        frequency: 'daily',
        hour: 0, // Midnight
        timezone: 'UTC',
      }

      const next = calculateNextScheduledScan(params, now)
      const nextDate = new Date(next)

      // Should schedule for next day at midnight UTC
      expect(nextDate.toISOString()).toBe('2026-02-09T00:00:00.000Z')
    })

    it('handles 11:00 PM hour (23:00)', () => {
      // February 8, 2026 at 10:00 AM UTC
      const now = new Date('2026-02-08T10:00:00.000Z')

      const params: ScheduleParams = {
        frequency: 'daily',
        hour: 23, // 11:00 PM
        timezone: 'UTC',
      }

      const next = calculateNextScheduledScan(params, now)
      const nextDate = new Date(next)

      // Should schedule for same day at 11:00 PM UTC
      expect(nextDate.toISOString()).toBe('2026-02-08T23:00:00.000Z')
    })

    it('handles month rollover for monthly scans', () => {
      // December 20, 2025 at 9:00 AM UTC
      const now = new Date('2025-12-20T09:00:00.000Z')

      const params: ScheduleParams = {
        frequency: 'monthly',
        hour: 6,
        dayOfMonth: 15, // Already passed in December
        timezone: 'UTC',
      }

      const next = calculateNextScheduledScan(params, now)
      const nextDate = new Date(next)

      // Should schedule for January 15, 2026 at 6:00 AM UTC
      expect(nextDate.toISOString()).toBe('2026-01-15T06:00:00.000Z')
    })

    it('handles year rollover for weekly scans', () => {
      // December 30, 2025 (Tuesday) at 10:00 AM UTC
      const now = new Date('2025-12-30T10:00:00.000Z')

      const params: ScheduleParams = {
        frequency: 'weekly',
        hour: 6,
        dayOfWeek: 1, // Monday (next Monday is Jan 5, 2026)
        timezone: 'UTC',
      }

      const next = calculateNextScheduledScan(params, now)
      const nextDate = new Date(next)

      // Should schedule for Monday, January 5, 2026 at 6:00 AM UTC
      expect(nextDate.toISOString()).toBe('2026-01-05T06:00:00.000Z')
    })
  })

  describe('Timezone-specific edge cases', () => {
    it('handles negative UTC offset (Pacific/Auckland, UTC+12/+13)', () => {
      // February 8, 2026 at 6:00 AM NZDT (February 7 at 5:00 PM UTC)
      const now = new Date('2026-02-07T17:00:00.000Z')

      const params: ScheduleParams = {
        frequency: 'daily',
        hour: 8, // 8:00 AM NZDT
        timezone: 'Pacific/Auckland',
      }

      const next = calculateNextScheduledScan(params, now)
      const nextDate = new Date(next)

      // Should schedule for same day at 8:00 AM NZDT = 7:00 PM Feb 7 UTC (NZDT is UTC+13 in summer)
      expect(nextDate.toISOString()).toBe('2026-02-07T19:00:00.000Z')
    })

    it('handles large positive UTC offset', () => {
      // February 8, 2026 at 2:00 PM in India (8:30 AM UTC)
      const now = new Date('2026-02-08T08:30:00.000Z')

      const params: ScheduleParams = {
        frequency: 'daily',
        hour: 6, // 6:00 AM IST
        timezone: 'Asia/Kolkata', // UTC+5:30
      }

      const next = calculateNextScheduledScan(params, now)
      const nextDate = new Date(next)

      // Should schedule for next day at 6:00 AM IST = 12:30 AM UTC
      expect(nextDate.toISOString()).toBe('2026-02-09T00:30:00.000Z')
    })
  })
})
