import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getProjectById, updateProject, deleteProject } from '@/lib/db/projects'
import { calculateNextScheduledScan } from '@/lib/scan/scheduling'
import { TABLES } from '@/lib/db/schema'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const project = await getProjectById(id)
    
    if (!project || project.user_id !== user.id) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Get generation costs from credit_transactions
    const { data: transactions } = await supabase
      .from('credit_transactions')
      .select('amount_cents')
      .eq('user_id', user.id)
      .eq('reference_type', 'generation')
      .eq('reference_id', id)
    
    const generationCostCents = transactions?.reduce((sum, t) => sum + Math.abs(t.amount_cents), 0) || 0

    return NextResponse.json({
      ...project,
      generation_cost_usd: generationCostCents / 100,
    })
  } catch (error: any) {
    console.error('Error fetching project:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch project' }, 
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify ownership
    const existing = await getProjectById(id)
    if (!existing || existing.user_id !== user.id) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const body = await request.json()
    const allowedFields = [
      'name', 
      'domain', 
      'language',
      'brand_variations',
      'target_keywords',
      'scheduled_scan_enabled', 
      'scheduled_scan_day',
      'scheduled_scan_frequency',
      'scheduled_scan_hour',
      'scheduled_scan_day_of_month',
      'follow_up_enabled',
      'follow_up_depth',
      'selected_models',  // Database column name
      'query_generation_model',
      'evaluation_model',
    ]
    
    const updates: Record<string, any> = {}
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field]
      }
    }
    
    // Handle llm_models -> selected_models mapping (frontend sends llm_models)
    if (body.llm_models !== undefined) {
      updates.selected_models = body.llm_models
    }

    // Validation for scheduling parameters
    if (updates.scheduled_scan_frequency !== undefined) {
      const validFrequencies = ['daily', 'weekly', 'monthly']
      if (!validFrequencies.includes(updates.scheduled_scan_frequency)) {
        return NextResponse.json(
          { error: 'Invalid frequency. Must be daily, weekly, or monthly.' },
          { status: 400 }
        )
      }
    }

    if (updates.scheduled_scan_hour !== undefined) {
      const hour = parseInt(updates.scheduled_scan_hour, 10)
      if (isNaN(hour) || hour < 0 || hour > 23) {
        return NextResponse.json(
          { error: 'Invalid hour. Must be between 0 and 23.' },
          { status: 400 }
        )
      }
    }

    if (updates.scheduled_scan_day_of_month !== undefined && updates.scheduled_scan_day_of_month !== null) {
      const day = parseInt(updates.scheduled_scan_day_of_month, 10)
      if (isNaN(day) || day < 1 || day > 28) {
        return NextResponse.json(
          { error: 'Invalid day of month. Must be between 1 and 28.' },
          { status: 400 }
        )
      }
    }

    if (updates.scheduled_scan_day !== undefined && updates.scheduled_scan_day !== null) {
      const day = parseInt(updates.scheduled_scan_day, 10)
      if (isNaN(day) || day < 0 || day > 6) {
        return NextResponse.json(
          { error: 'Invalid day of week. Must be between 0 (Sunday) and 6 (Saturday).' },
          { status: 400 }
        )
      }
    }

    // If scheduling parameters changed, recalculate next_scheduled_scan_at
    const schedulingChanged = 
      updates.scheduled_scan_enabled !== undefined ||
      updates.scheduled_scan_frequency !== undefined ||
      updates.scheduled_scan_hour !== undefined ||
      updates.scheduled_scan_day !== undefined ||
      updates.scheduled_scan_day_of_month !== undefined

    if (schedulingChanged && (body.scheduled_scan_enabled !== false && existing.scheduled_scan_enabled !== false)) {
      // Get user's timezone from the _profile settings row (config JSONB)
      const { data: profileSetting } = await supabase
        .from(TABLES.USER_SETTINGS)
        .select('config')
        .eq('user_id', user.id)
        .eq('provider', '_profile')
        .single()

      const tz = (profileSetting?.config as Record<string, unknown>)?.timezone
      const timezone = typeof tz === 'string' ? tz : 'UTC'

      // Get final values (merge existing with updates)
      const frequency = (updates.scheduled_scan_frequency ?? existing.scheduled_scan_frequency) || 'weekly'
      const hour = updates.scheduled_scan_hour !== undefined ? updates.scheduled_scan_hour : (existing.scheduled_scan_hour ?? 6)
      const dayOfWeek = updates.scheduled_scan_day !== undefined ? updates.scheduled_scan_day : existing.scheduled_scan_day
      const dayOfMonth = updates.scheduled_scan_day_of_month !== undefined ? updates.scheduled_scan_day_of_month : existing.scheduled_scan_day_of_month

      try {
        const nextScan = calculateNextScheduledScan({
          frequency: frequency as 'daily' | 'weekly' | 'monthly',
          hour,
          dayOfWeek: dayOfWeek ?? 1,
          dayOfMonth: dayOfMonth ?? 1,
          timezone,
        })

        updates.next_scheduled_scan_at = nextScan
      } catch (error: any) {
        console.error('Failed to calculate next scheduled scan:', error)
        return NextResponse.json(
          { error: `Failed to calculate schedule: ${error.message}` },
          { status: 400 }
        )
      }
    }

    // If scheduling is disabled, clear next_scheduled_scan_at
    if (updates.scheduled_scan_enabled === false) {
      updates.next_scheduled_scan_at = null
    }

    const project = await updateProject(id, updates)
    return NextResponse.json(project)
  } catch (error: any) {
    console.error('Error updating project:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update project' }, 
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify ownership
    const existing = await getProjectById(id)
    if (!existing || existing.user_id !== user.id) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    await deleteProject(id)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting project:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete project' }, 
      { status: 500 }
    )
  }
}
