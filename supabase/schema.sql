-- =====================================================
-- GEO Analyser - Database Schema
-- Run this in Supabase SQL Editor
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. USER SETTINGS - API keys per user
-- =====================================================
CREATE TABLE user_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- 'openai', 'anthropic', 'google', 'perplexity'
  encrypted_api_key TEXT, -- Encrypted API key
  model TEXT NOT NULL, -- e.g., 'gpt-4o', 'claude-3-5-sonnet'
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, provider)
);

-- =====================================================
-- 2. PROJECTS - Main entity for GEO tracking
-- =====================================================
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  brand_variations JSONB NOT NULL DEFAULT '[]', -- Array of brand name variations
  target_keywords JSONB NOT NULL DEFAULT '[]', -- Array of keywords
  language TEXT NOT NULL DEFAULT 'en', -- 'en', 'cs', 'sk', 'de', etc.
  
  -- Scheduled scans
  scheduled_scan_enabled BOOLEAN NOT NULL DEFAULT false,
  scheduled_scan_day INTEGER, -- 0-6 (Sunday-Saturday)
  last_scheduled_scan_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster user queries
CREATE INDEX idx_projects_user_id ON projects(user_id);

-- =====================================================
-- 3. PROJECT QUERIES - Test queries for projects
-- =====================================================
CREATE TABLE project_queries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  query_text TEXT NOT NULL,
  query_type TEXT NOT NULL DEFAULT 'informational', -- 'informational', 'transactional', 'comparison'
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster project queries
CREATE INDEX idx_project_queries_project_id ON project_queries(project_id);

-- =====================================================
-- 4. SCANS - Scan sessions
-- =====================================================
CREATE TABLE scans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running', -- 'running', 'completed', 'failed'
  overall_score INTEGER, -- 0-100
  
  -- Cost tracking
  total_cost_usd DECIMAL(10, 6) DEFAULT 0,
  total_input_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_scans_project_id ON scans(project_id);
CREATE INDEX idx_scans_user_id ON scans(user_id);
CREATE INDEX idx_scans_created_at ON scans(created_at DESC);

-- =====================================================
-- 5. SCAN RESULTS - Individual LLM responses
-- =====================================================
CREATE TABLE scan_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- 'openai', 'anthropic', 'google', 'perplexity'
  model TEXT NOT NULL, -- Specific model used
  query_text TEXT NOT NULL,
  ai_response_raw TEXT NOT NULL,
  
  -- Evaluation metrics (JSON)
  metrics_json JSONB, -- {is_visible, sentiment_score, citation_found, ranking_position, recommendation_strength}
  
  -- Token tracking for cost calculation
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd DECIMAL(10, 6),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster scan queries
CREATE INDEX idx_scan_results_scan_id ON scan_results(scan_id);

-- =====================================================
-- 6. MONTHLY USAGE - Aggregated costs per user/month
-- =====================================================
CREATE TABLE monthly_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month TEXT NOT NULL, -- Format: '2026-01'
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  total_input_tokens BIGINT DEFAULT 0,
  total_output_tokens BIGINT DEFAULT 0,
  total_cost_usd DECIMAL(12, 6) DEFAULT 0,
  scan_count INTEGER DEFAULT 0,
  
  UNIQUE(user_id, month, provider, model)
);

-- Index
CREATE INDEX idx_monthly_usage_user_month ON monthly_usage(user_id, month);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_usage ENABLE ROW LEVEL SECURITY;

-- USER SETTINGS: Users can only access their own settings
CREATE POLICY "Users can view own settings"
  ON user_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
  ON user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
  ON user_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own settings"
  ON user_settings FOR DELETE
  USING (auth.uid() = user_id);

-- PROJECTS: Users can only access their own projects
CREATE POLICY "Users can view own projects"
  ON projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own projects"
  ON projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects"
  ON projects FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects"
  ON projects FOR DELETE
  USING (auth.uid() = user_id);

-- PROJECT QUERIES: Access through project ownership
CREATE POLICY "Users can view queries of own projects"
  ON project_queries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = project_queries.project_id 
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert queries to own projects"
  ON project_queries FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = project_queries.project_id 
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update queries of own projects"
  ON project_queries FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = project_queries.project_id 
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete queries of own projects"
  ON project_queries FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = project_queries.project_id 
      AND projects.user_id = auth.uid()
    )
  );

-- SCANS: Users can only access their own scans
CREATE POLICY "Users can view own scans"
  ON scans FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own scans"
  ON scans FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own scans"
  ON scans FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own scans"
  ON scans FOR DELETE
  USING (auth.uid() = user_id);

-- SCAN RESULTS: Access through scan ownership
CREATE POLICY "Users can view results of own scans"
  ON scan_results FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM scans 
      WHERE scans.id = scan_results.scan_id 
      AND scans.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert results to own scans"
  ON scan_results FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM scans 
      WHERE scans.id = scan_results.scan_id 
      AND scans.user_id = auth.uid()
    )
  );

-- MONTHLY USAGE: Users can only view their own usage
CREATE POLICY "Users can view own usage"
  ON monthly_usage FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own usage"
  ON monthly_usage FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own usage"
  ON monthly_usage FOR UPDATE
  USING (auth.uid() = user_id);

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- VIEWS (Optional - for easier querying)
-- =====================================================

-- View for project stats
CREATE OR REPLACE VIEW project_stats AS
SELECT 
  p.id AS project_id,
  p.user_id,
  p.name,
  p.domain,
  COUNT(DISTINCT s.id) AS total_scans,
  COUNT(DISTINCT CASE WHEN s.created_at > NOW() - INTERVAL '30 days' THEN s.id END) AS scans_this_month,
  AVG(s.overall_score) AS avg_score,
  MAX(s.created_at) AS last_scan_at
FROM projects p
LEFT JOIN scans s ON s.project_id = p.id AND s.status = 'completed'
GROUP BY p.id, p.user_id, p.name, p.domain;

-- =====================================================
-- DONE!
-- =====================================================
