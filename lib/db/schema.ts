// Database types matching Supabase schema

export type UserTier = 'free' | 'paid' | 'test' | 'admin'

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

export interface UserProfile {
  id: string
  user_id: string
  tier: UserTier
  credit_balance_cents: number
  paid_credits_cents: number
  bonus_credits_cents: number
  free_scans_used_this_month: number
  free_scans_reset_at: string
  test_simulate_no_credits: boolean
  avatar_url: string | null
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
  selected_models: string[] // JSONB stored as array of model IDs (database column name)
  language: string
  scheduled_scan_enabled: boolean
  scheduled_scan_day: number | null // 0-6 (Sunday-Saturday)
  last_scheduled_scan_at: string | null
  next_scheduled_scan_at: string | null
  follow_up_enabled: boolean // Whether to run follow-up queries during scans
  follow_up_depth: number // Number of follow-up questions (1-3)
  query_generation_model: string // Model used for AI-generated queries
  evaluation_model: string // Model used for evaluating AI responses
  evaluation_method?: 'ai' | 'regex' // DEPRECATED - always uses AI evaluation now
  created_at: string
  updated_at: string
}

export interface ScheduledScanHistory {
  id: string
  project_id: string
  scan_id: string | null
  scheduled_for: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  error_message: string | null
  created_at: string
  completed_at: string | null
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
  status: 'running' | 'completed' | 'failed' | 'stopped'
  evaluation_method?: 'ai' | 'regex'  // DEPRECATED - always uses AI evaluation now
  
  // Aggregated metrics (0-100, averaged from all results)
  overall_score: number | null        // Final resilience score (or initial score if no follow-ups)
  avg_visibility: number | null       // % of results where brand was mentioned
  avg_sentiment: number | null        // Average sentiment score
  avg_citation?: number | null        // DEPRECATED - kept for backward compatibility
  avg_ranking: number | null          // Average ranking score
  
  // Resilience scoring (new)
  initial_score: number | null        // Score from initial queries only (Level 0)
  conversational_bonus: number | null // Bonus/penalty from follow-ups
  brand_persistence: number | null    // % of levels where brand mentioned (0-100)
  follow_up_active: boolean | null    // Whether follow-ups were used
  
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
  follow_up_level: number // 0=initial, 1-3=follow-up depth
  parent_result_id: string | null // Links to previous result in chain
  follow_up_query_used: string | null // The follow-up question asked
  created_at: string
}

export interface ScanMetrics {
  visibility_score: number           // 0-100: Brand + domain presence (100=both, 50=brand or domain only, 0=neither)
  sentiment_score: number | null     // 0-100: Sentiment when brand mentioned (50 = neutral, null = not mentioned/n/a)
  ranking_score: number              // 0-100: Position in list (higher = better)
  recommendation_score: number       // 0-100: Overall recommendation strength
  citation_score?: number            // DEPRECATED - kept for backward compatibility with old data
  
  // Resilience scoring fields (added for follow-up analysis)
  brand_mentioned?: boolean          // Whether brand was mentioned in this response
  domain_mentioned?: boolean         // Whether domain was mentioned in this response
}

// Aggregated scores for a conversation chain (initial + follow-ups)
export interface ResilienceScore {
  final_score: number                // Final adjusted score (0-100)
  initial_score: number              // Score from Level 0 only
  conversational_bonus: number       // How much follow-ups added/subtracted
  brand_persistence: number          // % of levels where brand was mentioned (0-100)
  sentiment_stability: number        // How stable sentiment is across levels (0-100)
  follow_up_active: boolean          // Whether follow-ups were used in calculation
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

// Type for inserting new records (without auto-generated fields)
export type InsertProject = Omit<Project, 'id' | 'created_at' | 'updated_at'>
export type InsertProjectQuery = Omit<ProjectQuery, 'id' | 'created_at'>
export type InsertScan = Omit<Scan, 'id' | 'created_at' | 'completed_at'>
export type InsertScanResult = Omit<ScanResult, 'id' | 'created_at'>
export type InsertUserSettings = Omit<UserSettings, 'id' | 'created_at' | 'updated_at'>

// Database table names
export const TABLES = {
  USER_SETTINGS: 'user_settings',
  USER_PROFILES: 'user_profiles',
  CREDIT_TRANSACTIONS: 'credit_transactions',
  CREDIT_RESERVATIONS: 'credit_reservations',
  PRICING_CONFIG: 'pricing_config',
  TIER_LIMITS: 'tier_limits',
  PROJECTS: 'projects',
  PROJECT_QUERIES: 'project_queries',
  SCANS: 'scans',
  SCAN_RESULTS: 'scan_results',
  MONTHLY_USAGE: 'monthly_usage',
  SCHEDULED_SCAN_HISTORY: 'scheduled_scan_history',
} as const
