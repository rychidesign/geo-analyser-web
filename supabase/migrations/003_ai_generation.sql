-- Migration: Add AI generation support
-- Run this in Supabase SQL Editor

-- Add is_ai_generated column to project_queries
ALTER TABLE project_queries 
ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN DEFAULT FALSE;

-- Create RPC function to increment monthly usage
-- This function uses the existing monthly_usage table structure
CREATE OR REPLACE FUNCTION increment_monthly_usage(
  p_user_id UUID,
  p_year_month TEXT,
  p_provider TEXT,
  p_model TEXT,
  p_cost DECIMAL,
  p_input_tokens INTEGER,
  p_output_tokens INTEGER
) RETURNS void AS $$
BEGIN
  INSERT INTO monthly_usage (user_id, month, provider, model, total_cost_usd, total_input_tokens, total_output_tokens, scan_count)
  VALUES (p_user_id, p_year_month, p_provider, p_model, p_cost, p_input_tokens, p_output_tokens, 1)
  ON CONFLICT (user_id, month, provider, model)
  DO UPDATE SET
    total_cost_usd = monthly_usage.total_cost_usd + EXCLUDED.total_cost_usd,
    total_input_tokens = monthly_usage.total_input_tokens + EXCLUDED.total_input_tokens,
    total_output_tokens = monthly_usage.total_output_tokens + EXCLUDED.total_output_tokens,
    scan_count = monthly_usage.scan_count + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_project_queries_ai_generated ON project_queries(is_ai_generated);
