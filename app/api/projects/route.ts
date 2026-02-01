import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createProject, getProjects } from '@/lib/db/projects'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const projects = await getProjects()
    return NextResponse.json(projects)
  } catch (error: any) {
    console.error('Error fetching projects:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch projects' }, 
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    console.log('[Create Project] Received body:', JSON.stringify(body, null, 2))
    
    const { 
      name, 
      domain, 
      language, 
      brand_variations,
      target_keywords,
      llm_models,  // Frontend sends as llm_models
      query_generation_model,
      evaluation_model,
      follow_up_enabled,
      follow_up_depth,
      scheduled_scan_enabled,
      scheduled_scan_day,
    } = body

    // Validation
    if (!name?.trim()) {
      console.log('[Create Project] Validation failed: name is empty')
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 })
    }
    if (!domain?.trim()) {
      console.log('[Create Project] Validation failed: domain is empty')
      return NextResponse.json({ error: 'Domain is required' }, { status: 400 })
    }
    if (!brand_variations?.length || !brand_variations.some((b: string) => b.trim())) {
      console.log('[Create Project] Validation failed: brand_variations =', brand_variations)
      return NextResponse.json({ error: 'At least one brand variation is required' }, { status: 400 })
    }
    if (!llm_models?.length) {
      console.log('[Create Project] Validation failed: llm_models =', llm_models)
      return NextResponse.json({ error: 'At least one AI model is required' }, { status: 400 })
    }
    
    console.log('[Create Project] Validation passed, creating project...')

    // Create project
    const projectData = {
      user_id: user.id,
      name: name.trim(),
      domain: domain.trim().toLowerCase().replace(/^https?:\/\//, ''),
      language: language || 'en',
      evaluation_method: 'ai' as const,
      brand_variations: brand_variations.filter((b: string) => b.trim()),
      target_keywords: target_keywords?.filter((k: string) => k.trim()) || [],
      selected_models: llm_models,  // Database column is selected_models
      scheduled_scan_enabled: scheduled_scan_enabled || false,
      scheduled_scan_day: scheduled_scan_enabled ? (scheduled_scan_day ?? 1) : null,
      last_scheduled_scan_at: null,
      next_scheduled_scan_at: null,
      query_generation_model: query_generation_model || 'gpt-5-mini',
      evaluation_model: evaluation_model || 'gpt-5-mini',
      follow_up_enabled: follow_up_enabled || false,
      follow_up_depth: follow_up_depth ?? 1,
    }
    
    console.log('[Create Project] Creating project with data:', JSON.stringify(projectData, null, 2))
    
    const project = await createProject(projectData)
    
    console.log('[Create Project] Project created successfully:', project.id)
    return NextResponse.json(project)
  } catch (error: any) {
    console.error('[Create Project] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create project' }, 
      { status: 500 }
    )
  }
}
