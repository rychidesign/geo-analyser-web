import { createClient } from '@/lib/supabase/server'
import type { Project, InsertProject, ProjectQuery, InsertProjectQuery, Scan } from './schema'
import { TABLES } from './schema'

// ============================================
// PROJECTS
// ============================================

export async function getProjects(): Promise<Project[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from(TABLES.PROJECTS)
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

export interface ProjectWithScore extends Project {
  latest_score: number | null
}

export async function getProjectsWithScores(): Promise<ProjectWithScore[]> {
  const supabase = await createClient()
  
  // Get all projects
  const { data: projects, error: projectsError } = await supabase
    .from(TABLES.PROJECTS)
    .select('*')
    .order('created_at', { ascending: false })

  if (projectsError) throw projectsError
  if (!projects || projects.length === 0) return []

  // Get ALL completed scans for each project to calculate average
  const projectIds = projects.map(p => p.id)
  
  const { data: allScans, error: scansError } = await supabase
    .from(TABLES.SCANS)
    .select('project_id, overall_score')
    .in('project_id', projectIds)
    .eq('status', 'completed')
    .not('overall_score', 'is', null)

  if (scansError) {
    console.error('Error fetching scans:', scansError)
    return projects.map(p => ({ ...p, latest_score: null }))
  }

  // Calculate average score per project
  const scoreMap = new Map<string, { total: number; count: number }>()
  for (const scan of allScans || []) {
    if (scan.overall_score !== null) {
      const existing = scoreMap.get(scan.project_id) || { total: 0, count: 0 }
      existing.total += scan.overall_score
      existing.count += 1
      scoreMap.set(scan.project_id, existing)
    }
  }

  // Merge projects with average scores (1 decimal place)
  return projects.map(project => {
    const scores = scoreMap.get(project.id)
    const avgScore = scores && scores.count > 0 
      ? Math.round(scores.total / scores.count * 10) / 10
      : null
    return {
      ...project,
      latest_score: avgScore
    }
  })
}

export async function getProjectById(id: string): Promise<Project | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from(TABLES.PROJECTS)
    .select('*')
    .eq('id', id)
    .single()

  if (error && error.code !== 'PGRST116') throw error
  return data
}

export async function createProject(project: InsertProject): Promise<Project> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from(TABLES.PROJECTS)
    .insert(project)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateProject(id: string, updates: Partial<Project>): Promise<Project> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from(TABLES.PROJECTS)
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteProject(id: string): Promise<void> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from(TABLES.PROJECTS)
    .delete()
    .eq('id', id)

  if (error) throw error
}

// ============================================
// PROJECT QUERIES
// ============================================

export async function getProjectQueries(projectId: string): Promise<ProjectQuery[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from(TABLES.PROJECT_QUERIES)
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data || []
}

export async function createProjectQuery(query: InsertProjectQuery): Promise<ProjectQuery> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from(TABLES.PROJECT_QUERIES)
    .insert(query)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function createProjectQueries(queries: InsertProjectQuery[]): Promise<ProjectQuery[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from(TABLES.PROJECT_QUERIES)
    .insert(queries)
    .select()

  if (error) throw error
  return data || []
}

export async function deleteProjectQuery(id: string): Promise<void> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from(TABLES.PROJECT_QUERIES)
    .delete()
    .eq('id', id)

  if (error) throw error
}

// ============================================
// SCANS
// ============================================

export async function getProjectScans(projectId: string): Promise<Scan[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from(TABLES.SCANS)
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function getRecentScans(limit: number = 10): Promise<Scan[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from(TABLES.SCANS)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data || []
}

// ============================================
// STATS
// ============================================

export async function getProjectStats(userId: string) {
  const supabase = await createClient()
  
  // Get project count
  const { count: projectCount } = await supabase
    .from(TABLES.PROJECTS)
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)

  // Get scan count
  const { count: scanCount } = await supabase
    .from(TABLES.SCANS)
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'completed')

  // Get average score
  const { data: avgData } = await supabase
    .from(TABLES.SCANS)
    .select('overall_score')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .not('overall_score', 'is', null)

  const avgScore = avgData && avgData.length > 0
    ? Math.round(avgData.reduce((sum, s) => sum + (s.overall_score || 0), 0) / avgData.length * 10) / 10
    : 0

  // Get scans this month
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const { count: thisMonthCount } = await supabase
    .from(TABLES.SCANS)
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', startOfMonth.toISOString())

  return {
    projects: projectCount || 0,
    scans: scanCount || 0,
    avgScore,
    thisMonth: thisMonthCount || 0,
  }
}
