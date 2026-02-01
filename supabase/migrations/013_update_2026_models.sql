-- =====================================================
-- Migration 013: Update to 2026 Models
-- Updates pricing_config with current model names
-- =====================================================

-- Clear and re-insert with correct 2026 models
DELETE FROM pricing_config;

-- Insert updated pricing data
-- Base costs are per 1M tokens in cents
-- Markup is 200% (so final price = base * 3)

INSERT INTO pricing_config (provider, model, base_input_cost_cents, base_output_cost_cents, available_free_tier, markup_percentage, is_active) VALUES
  -- OpenAI (2026 models)
  ('openai', 'gpt-5-2', 175, 1400, false, 200, true),
  ('openai', 'gpt-5-mini', 25, 200, true, 200, true),
  ('openai', 'gpt-5-nano', 10, 40, true, 200, true),
  
  -- Anthropic (2026 models)
  ('anthropic', 'claude-opus-4-5', 500, 2500, false, 200, true),
  ('anthropic', 'claude-sonnet-4-5', 300, 1500, false, 200, true),
  ('anthropic', 'claude-haiku-4-5', 100, 500, true, 200, true),
  ('anthropic', 'claude-opus-4-1', 1200, 6000, false, 200, true),
  
  -- Google (2026 models)
  ('google', 'gemini-3-flash-preview', 50, 300, false, 200, true),
  ('google', 'gemini-2-5-flash', 60, 350, true, 200, true),
  ('google', 'gemini-2-5-flash-lite', 30, 250, true, 200, true),
  
  -- Groq (2026 models - ultra-fast inference)
  ('groq', 'llama-4-scout', 10, 15, true, 200, true),
  ('groq', 'llama-4-maverick', 20, 30, true, 200, true),
  
  -- Perplexity (2026 models - web-connected)
  ('perplexity', 'sonar-deep-research', 200, 800, false, 200, true),
  ('perplexity', 'sonar-reasoning-pro', 100, 400, false, 200, true)

ON CONFLICT (provider, model) DO UPDATE SET
  base_input_cost_cents = EXCLUDED.base_input_cost_cents,
  base_output_cost_cents = EXCLUDED.base_output_cost_cents,
  available_free_tier = EXCLUDED.available_free_tier,
  markup_percentage = EXCLUDED.markup_percentage,
  is_active = EXCLUDED.is_active,
  prices_updated_at = NOW();

-- =====================================================
-- DONE!
-- =====================================================
