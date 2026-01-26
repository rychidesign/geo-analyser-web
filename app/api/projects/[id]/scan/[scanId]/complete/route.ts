import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TABLES } from '@/lib/db/schema'

export const runtime = 'edge'
export const maxDuration = 10

/**
 * Mark scan as completed
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; scanId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: projectId, scanId } = await params

    // Verify scan ownership
    const { data: scan } = await supabase
      .from(TABLES.SCANS)
      .select('id, status')
      .eq('id', scanId)
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .single()

    if (!scan) {
      return NextResponse.json({ error: 'Scan not found' }, { status: 404 })
    }

    // Update scan status
    const { error: updateError } = await supabase
      .from(TABLES.SCANS)
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', scanId)

    if (updateError) {
      console.error('[Complete Scan] Error:', updateError)
      return NextResponse.json({ error: 'Failed to complete scan' }, { status: 500 })
    }

    console.log(`[Complete Scan] Scan ${scanId} marked as completed`)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Complete Scan] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to complete scan' },
      { status: 500 }
    )
  }
}
