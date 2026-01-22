import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { TABLES } from '@/lib/db/schema'
import { getUserTimezone } from '@/lib/db/settings'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id: projectId } = await params

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user timezone
    const userTimezone = await getUserTimezone(user.id)
    console.log(`[History] User timezone: ${userTimezone}`)

    // Get URL params for date range
    const url = new URL(request.url)
    const days = parseInt(url.searchParams.get('days') || '30')
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    console.log(`[History] Fetching scans for project ${projectId}, user ${user.id}, since ${startDate.toISOString()}`)

    // Get all completed scans for this project within date range
    const { data: scans, error } = await supabase
      .from(TABLES.SCANS)
      .select('id, created_at, overall_score, avg_visibility, avg_sentiment, avg_citation, avg_ranking')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching scan history:', error)
      return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 })
    }

    // Group scans by day and calculate daily averages
    const dailyData: Record<string, {
      date: string
      scans: number
      overall: number
      visibility: number
      sentiment: number
      citation: number
      ranking: number
    }> = {}

    console.log(`[History] Found ${scans?.length || 0} scans for project ${projectId}`)
    
    // Helper function to convert UTC timestamp to local date string in user timezone
    const getLocalDateKey = (utcTimestamp: string): string => {
      const date = new Date(utcTimestamp)
      // Use Intl.DateTimeFormat to convert to user timezone and get YYYY-MM-DD
      const formatter = new Intl.DateTimeFormat('en-CA', { 
        timeZone: userTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      })
      return formatter.format(date) // Returns YYYY-MM-DD in user timezone
    }

    for (const scan of scans || []) {
      // Convert UTC timestamp to local date in user timezone
      const dateKey = getLocalDateKey(scan.created_at)

      if (!dailyData[dateKey]) {
        dailyData[dateKey] = {
          date: dateKey,
          scans: 0,
          overall: 0,
          visibility: 0,
          sentiment: 0,
          citation: 0,
          ranking: 0,
        }
      }

      dailyData[dateKey].scans += 1
      dailyData[dateKey].overall += scan.overall_score || 0
      dailyData[dateKey].visibility += scan.avg_visibility || 0
      dailyData[dateKey].sentiment += scan.avg_sentiment || 50
      dailyData[dateKey].citation += scan.avg_citation || 0
      dailyData[dateKey].ranking += scan.avg_ranking || 0
    }

    console.log(`[History] Grouped into ${Object.keys(dailyData).length} days:`, Object.keys(dailyData).sort())

    // Calculate averages and sort by date
    const history = Object.values(dailyData)
      .map(day => ({
        date: day.date,
        scans: day.scans,
        overall: Math.round(day.overall / day.scans),
        visibility: Math.round(day.visibility / day.scans),
        sentiment: Math.round(day.sentiment / day.scans),
        citation: Math.round(day.citation / day.scans),
        ranking: Math.round(day.ranking / day.scans),
      }))
      .sort((a, b) => a.date.localeCompare(b.date)) // Sort by date ascending

    console.log(`[History] Returning ${history.length} days of data`)
    return NextResponse.json({ history })
  } catch (error) {
    console.error('Error in history API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
