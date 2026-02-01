-- =====================================================
-- Migration 014: Centralized Pricing System
-- Prices derived from application's current pricing structure
-- Base costs (provider) × (1 + markup%) = Final prices to users
-- Source: https://vercel.com/ai-gateway/models
-- =====================================================

-- Clear and re-insert with consistent prices
DELETE FROM pricing_config;

-- Insert pricing data
-- Base costs are per 1M tokens in cents (provider costs)
-- Markup is 200% (final price = base × 3)
-- Final prices shown below for reference

INSERT INTO pricing_config (provider, model, base_input_cost_cents, base_output_cost_cents, available_free_tier, markup_percentage, is_active) VALUES
  -- ==========================================
  -- OpenAI Models
  -- ==========================================
  -- gpt-5-2: Flagship ($1.75/$14.00 final)
  ('openai', 'gpt-5-2', 58, 467, false, 200, true),
  
  -- gpt-5-mini: Balanced ($0.25/$2.00 final)
  ('openai', 'gpt-5-mini', 8, 67, true, 200, true),
  
  -- gpt-5-nano: Fastest ($0.10/$0.40 final)
  ('openai', 'gpt-5-nano', 3, 13, true, 200, true),

  -- ==========================================
  -- Anthropic Models
  -- ==========================================
  -- claude-opus-4.5: Premium ($5.00/$25.00 final)
  ('anthropic', 'claude-opus-4-5', 167, 833, false, 200, true),
  
  -- claude-sonnet-4.5: Balanced ($3.00/$15.00 final)
  ('anthropic', 'claude-sonnet-4-5', 100, 500, false, 200, true),
  
  -- claude-haiku-4.5: Fast ($1.00/$5.00 final)
  ('anthropic', 'claude-haiku-4-5', 33, 167, true, 200, true),
  
  -- claude-opus-4.1: Legacy ($12.00/$60.00 final)
  ('anthropic', 'claude-opus-4-1', 400, 2000, false, 200, true),

  -- ==========================================
  -- Google Models
  -- ==========================================
  -- gemini-3-flash-preview: ($0.50/$3.00 final)
  ('google', 'gemini-3-flash-preview', 17, 100, false, 200, true),
  
  -- gemini-2.5-flash: ($0.60/$3.50 final)
  ('google', 'gemini-2-5-flash', 20, 117, true, 200, true),
  
  -- gemini-2.5-flash-lite: ($0.30/$2.50 final)
  ('google', 'gemini-2-5-flash-lite', 10, 83, true, 200, true),

  -- ==========================================
  -- Groq/Meta Models (Ultra-fast inference)
  -- ==========================================
  -- llama-4-scout: ($0.10/$0.15 final)
  ('groq', 'llama-4-scout', 3, 5, true, 200, true),
  
  -- llama-4-maverick: ($0.20/$0.60 final)
  ('groq', 'llama-4-maverick', 7, 20, true, 200, true),

  -- ==========================================
  -- Perplexity Models (Web-connected search)
  -- ==========================================
  -- sonar-reasoning-pro: ($2.00/$8.00 final)
  ('perplexity', 'sonar-reasoning-pro', 67, 267, false, 200, true)

ON CONFLICT (provider, model) DO UPDATE SET
  base_input_cost_cents = EXCLUDED.base_input_cost_cents,
  base_output_cost_cents = EXCLUDED.base_output_cost_cents,
  available_free_tier = EXCLUDED.available_free_tier,
  markup_percentage = EXCLUDED.markup_percentage,
  is_active = EXCLUDED.is_active,
  prices_updated_at = NOW();

-- Add a comment with source info
COMMENT ON TABLE pricing_config IS 'Model pricing for GEO Analyser. Updated: 2026-01-30. Manage via Admin Dashboard.';

-- =====================================================
-- DONE! Run this migration in Supabase SQL Editor
-- Then use Admin Dashboard to adjust prices
-- =====================================================
