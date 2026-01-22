// Database types matching Supabase schema

export interface UserSettings {
  id: string
  user_id: string
  provider: 'openai' | 'anthropic' | 'google'
  encrypted_api_key: string | null
  model: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  user_id: string
  name: string
  domain: string
  brand_variations: string[] // JSONB stored as array
  target_keywords: string[] // JSONB stored as array
  selected_models: string[] // JSONB stored as array of model IDs
  language: string
  scheduled_scan_enabled: boolean
  scheduled_scan_day: number | null // 0-6 (Sunday-Saturday)
  last_scheduled_scan_at: string | null
  evaluation_method: 'ai' | 'regex' // Method for evaluating scan results
  created_at: string
  updated_at: string
}

export interface ProjectQuery {
  id: string
  project_id: string
  query_text: string
  query_type: 'informational' | 'transactional' | 'comparison'
  is_active: boolean
  is_ai_generated: boolean
  created_at: string
}

export interface Scan {
  id: string
  project_id: string
  user_id: string
  status: 'running' | 'completed' | 'failed'
  evaluation_method: 'ai' | 'regex'   // Evaluation method used for this scan
  
  // Aggregated metrics (0-100, averaged from all results)
  overall_score: number | null        // Weighted average of all metrics
  avg_visibility: number | null       // % of results where brand was mentioned
  avg_sentiment: number | null        // Average sentiment score
  avg_citation: number | null         // % of results with domain citation
  avg_ranking: number | null          // Average ranking score
  
  // Cost tracking
  total_cost_usd: number
  total_input_tokens: number
  total_output_tokens: number
  
  // Counts
  total_queries: number
  total_results: number
  
  created_at: string
  completed_at: string | null
}

export interface ScanResult {
  id: string
  scan_id: string
  provider: 'openai' | 'anthropic' | 'google'
  model: string
  query_text: string
  ai_response_raw: string
  metrics_json: ScanMetrics | null
  input_tokens: number | null
  output_tokens: number | null
  cost_usd: number | null
  created_at: string
}

export interface ScanMetrics {
  visibility_score: number      // 0-100: Is brand mentioned?
  sentiment_score: number       // 0-100: Sentiment (50 = neutral)
  citation_score: number        // 0-100: Is domain cited?
  ranking_score: number         // 0-100: Position in list (higher = better)
  recommendation_score: number  // 0-100: Overall recommendation strength
}

export interface MonthlyUsage {
  id: string
  user_id: string
  month: string // Format: '2026-01'
  provider: string
  model: string
  usage_type: 'scan' | 'generation' | 'evaluation'
  total_input_tokens: number
  total_output_tokens: number
  total_cost_usd: number
  scan_count: number
}

export interface ScanQueue {
  id: string
  user_id: string
  project_id: string
  scan_id: string | null
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
  priority: number
  progress_current: number
  progress_total: number
  progress_message: string | null
  is_scheduled: boolean
  scheduled_for: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
  error_message: string | null
}

// Type for inserting new records (without auto-generated fields)
export type InsertProject = Omit<Project, 'id' | 'created_at' | 'updated_at'>
export type InsertProjectQuery = Omit<ProjectQuery, 'id' | 'created_at'>
export type InsertScan = Omit<Scan, 'id' | 'created_at' | 'completed_at'>
export type InsertScanResult = Omit<ScanResult, 'id' | 'created_at'>
export type InsertUserSettings = Omit<UserSettings, 'id' | 'created_at' | 'updated_at'>

// Database table names
export const TABLES = {
  USER_SETTINGS: 'user_settings',
  PROJECTS: 'projects',
  PROJECT_QUERIES: 'project_queries',
  SCANS: 'scans',
  SCAN_RESULTS: 'scan_results',
  MONTHLY_USAGE: 'monthly_usage',
} as const
