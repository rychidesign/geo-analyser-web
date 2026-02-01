import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TABLES } from '@/lib/db/schema'
import { releaseReservation } from '@/lib/credits'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; scanId: string }> }
) {
  try {
    const { id: projectId, scanId } = await params
    const body = await request.json().catch(() => ({}))
    const { reservationId } = body
    
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify scan belongs to user and is running
    const { data: scan, error: scanError } = await supabase
      .from(TABLES.SCANS)
      .select('*')
      .eq('id', scanId)
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .single()

    if (scanError || !scan) {
      return NextResponse.json({ error: 'Scan not found' }, { status: 404 })
    }

    if (scan.status !== 'running') {
      return NextResponse.json({ error: 'Scan is not running' }, { status: 400 })
    }

    // Release credit reservation if provided
    if (reservationId) {
      const releaseResult = await releaseReservation(reservationId, 'Scan stopped by user')
      if (releaseResult.success) {
        console.log(`[Stop Scan] Released reservation ${reservationId}`)
      } else {
        console.error(`[Stop Scan] Failed to release reservation: ${releaseResult.error}`)
      }
    } else {
      // Try to find reservation by scan_id
      const { data: reservation } = await supabase
        .from('credit_reservations')
        .select('id')
        .eq('scan_id', scanId)
        .eq('status', 'active')
        .single()
      
      if (reservation) {
        await releaseReservation(reservation.id, 'Scan stopped by user')
        console.log(`[Stop Scan] Released reservation ${reservation.id} (found by scan_id)`)
      }
    }

    // Update scan status to stopped
    const { error: updateError } = await supabase
      .from(TABLES.SCANS)
      .update({
        status: 'stopped',
        completed_at: new Date().toISOString(),
      })
      .eq('id', scanId)

    if (updateError) {
      console.error('[Stop Scan] Error:', updateError)
      return NextResponse.json({ error: 'Failed to stop scan' }, { status: 500 })
    }

    console.log(`[Stop Scan] Scan ${scanId} stopped by user`)

    return NextResponse.json({ success: true, creditsReleased: true })
  } catch (error: any) {
    console.error('[Stop Scan] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to stop scan' },
      { status: 500 }
    )
  }
}
