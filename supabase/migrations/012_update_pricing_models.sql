-- =====================================================
-- Migration 012: Update Pricing Models
-- Adds Groq and Perplexity providers, updates model list
-- =====================================================

-- Clear existing pricing and re-insert with new models
DELETE FROM pricing_config;

-- Insert updated pricing data
-- Base costs are per 1M tokens in cents
-- Markup is 200% (so final price = base * 3)

INSERT INTO pricing_config (provider, model, base_input_cost_cents, base_output_cost_cents, available_free_tier, markup_percentage, is_active) VALUES
  -- OpenAI
  ('openai', 'gpt-4o', 250, 1000, false, 200, true),
  ('openai', 'gpt-4o-mini', 15, 60, true, 200, true),
  ('openai', 'gpt-4-turbo', 1000, 3000, false, 200, true),
  
  -- Anthropic
  ('anthropic', 'claude-3-5-sonnet-latest', 300, 1500, false, 200, true),
  ('anthropic', 'claude-3-5-haiku-latest', 80, 400, true, 200, true),
  ('anthropic', 'claude-3-opus-latest', 1500, 7500, false, 200, true),
  
  -- Google
  ('google', 'gemini-2.0-flash', 10, 40, true, 200, true),
  ('google', 'gemini-1.5-pro', 125, 500, false, 200, true),
  ('google', 'gemini-1.5-flash', 8, 30, true, 200, true),
  
  -- Groq (ultra-fast inference)
  ('groq', 'llama-3.3-70b-versatile', 59, 79, true, 200, true),
  ('groq', 'llama-3.1-8b-instant', 5, 8, true, 200, true),
  ('groq', 'mixtral-8x7b-32768', 24, 24, true, 200, true),
  
  -- Perplexity (web-connected)
  ('perplexity', 'llama-3.1-sonar-small-128k-online', 20, 20, false, 200, true),
  ('perplexity', 'llama-3.1-sonar-large-128k-online', 100, 100, false, 200, true)

ON CONFLICT (provider, model) DO UPDATE SET
  base_input_cost_cents = EXCLUDED.base_input_cost_cents,
  base_output_cost_cents = EXCLUDED.base_output_cost_cents,
  available_free_tier = EXCLUDED.available_free_tier,
  markup_percentage = EXCLUDED.markup_percentage,
  is_active = EXCLUDED.is_active,
  prices_updated_at = NOW();

-- Deactivate old models that no longer exist
UPDATE pricing_config
SET is_active = false
WHERE model NOT IN (
  'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo',
  'claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-latest',
  'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash',
  'llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768',
  'llama-3.1-sonar-small-128k-online', 'llama-3.1-sonar-large-128k-online'
);

-- =====================================================
-- DONE!
-- =====================================================
