-- =====================================================
-- Migration 011: User Tiers & Credit System (SAFE VERSION)
-- Uses IF NOT EXISTS to avoid conflicts
-- =====================================================

-- =====================================================
-- 1. USER PROFILES - Extended user info with tier & credits
-- =====================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'paid', 'test', 'admin')),
  credit_balance_cents INTEGER NOT NULL DEFAULT 0,
  paid_credits_cents INTEGER NOT NULL DEFAULT 0,
  bonus_credits_cents INTEGER NOT NULL DEFAULT 0,
  free_scans_used_this_month INTEGER NOT NULL DEFAULT 0,
  free_scans_reset_at TIMESTAMPTZ NOT NULL DEFAULT date_trunc('month', NOW()) + INTERVAL '1 month',
  test_simulate_no_credits BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_tier ON user_profiles(tier);

-- =====================================================
-- 2. CREDIT TRANSACTIONS - All credit movements
-- =====================================================
CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'top_up', 'bonus', 'usage', 'refund', 'admin_adjustment', 'expired'
  )),
  amount_cents INTEGER NOT NULL,
  balance_after_cents INTEGER NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON credit_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_type ON credit_transactions(type);

-- =====================================================
-- 3. CREDIT RESERVATIONS - Temporary holds during scans
-- =====================================================
CREATE TABLE IF NOT EXISTS credit_reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  scan_id UUID REFERENCES scans(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released', 'consumed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 hour',
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_credit_reservations_user_active ON credit_reservations(user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_credit_reservations_expires ON credit_reservations(expires_at) WHERE status = 'active';

-- =====================================================
-- 4. PRICING CONFIG - Dynamic pricing from admin
-- =====================================================
CREATE TABLE IF NOT EXISTS pricing_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  base_input_cost_cents INTEGER NOT NULL,
  base_output_cost_cents INTEGER NOT NULL,
  markup_percentage INTEGER NOT NULL DEFAULT 200,
  final_input_cost_cents INTEGER NOT NULL GENERATED ALWAYS AS (
    base_input_cost_cents + (base_input_cost_cents * markup_percentage / 100)
  ) STORED,
  final_output_cost_cents INTEGER NOT NULL GENERATED ALWAYS AS (
    base_output_cost_cents + (base_output_cost_cents * markup_percentage / 100)
  ) STORED,
  available_free_tier BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  prices_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, model)
);

-- =====================================================
-- 5. TIER LIMITS - Configurable limits per tier
-- =====================================================
CREATE TABLE IF NOT EXISTS tier_limits (
  tier TEXT PRIMARY KEY CHECK (tier IN ('free', 'paid', 'test', 'admin')),
  max_projects INTEGER,
  max_queries_per_project INTEGER,
  max_scans_per_month INTEGER,
  can_use_all_models BOOLEAN NOT NULL DEFAULT false,
  can_schedule_scans BOOLEAN NOT NULL DEFAULT false,
  description TEXT NOT NULL DEFAULT ''
);

-- Insert default tier limits (ignore if exists)
INSERT INTO tier_limits (tier, max_projects, max_queries_per_project, max_scans_per_month, can_use_all_models, can_schedule_scans, description)
VALUES
  ('free', 1, 5, 2, false, false, 'Free tier with limited features'),
  ('paid', NULL, NULL, NULL, true, true, 'Paid tier with full access'),
  ('test', NULL, NULL, NULL, true, true, 'Test account for development'),
  ('admin', NULL, NULL, NULL, true, true, 'Administrator with full control')
ON CONFLICT (tier) DO NOTHING;

-- =====================================================
-- 6. INSERT PRICING DATA
-- =====================================================
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
  -- Groq
  ('groq', 'llama-3.3-70b-versatile', 59, 79, true, 200, true),
  ('groq', 'llama-3.1-8b-instant', 5, 8, true, 200, true),
  ('groq', 'mixtral-8x7b-32768', 24, 24, true, 200, true),
  -- Perplexity
  ('perplexity', 'llama-3.1-sonar-small-128k-online', 20, 20, false, 200, true),
  ('perplexity', 'llama-3.1-sonar-large-128k-online', 100, 100, false, 200, true)
ON CONFLICT (provider, model) DO UPDATE SET
  base_input_cost_cents = EXCLUDED.base_input_cost_cents,
  base_output_cost_cents = EXCLUDED.base_output_cost_cents,
  available_free_tier = EXCLUDED.available_free_tier,
  markup_percentage = EXCLUDED.markup_percentage,
  is_active = EXCLUDED.is_active,
  prices_updated_at = NOW();

-- =====================================================
-- 7. RLS POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE tier_limits ENABLE ROW LEVEL SECURITY;

-- User profiles: users can read their own, admins can read all
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage all profiles" ON user_profiles;
CREATE POLICY "Service role can manage all profiles" ON user_profiles
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Credit transactions: users can view their own
DROP POLICY IF EXISTS "Users can view own transactions" ON credit_transactions;
CREATE POLICY "Users can view own transactions" ON credit_transactions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage transactions" ON credit_transactions;
CREATE POLICY "Service role can manage transactions" ON credit_transactions
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Credit reservations: users can view their own
DROP POLICY IF EXISTS "Users can view own reservations" ON credit_reservations;
CREATE POLICY "Users can view own reservations" ON credit_reservations
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage reservations" ON credit_reservations;
CREATE POLICY "Service role can manage reservations" ON credit_reservations
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Pricing config: everyone can read
DROP POLICY IF EXISTS "Anyone can view pricing" ON pricing_config;
CREATE POLICY "Anyone can view pricing" ON pricing_config
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service role can manage pricing" ON pricing_config;
CREATE POLICY "Service role can manage pricing" ON pricing_config
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Tier limits: everyone can read
DROP POLICY IF EXISTS "Anyone can view tier limits" ON tier_limits;
CREATE POLICY "Anyone can view tier limits" ON tier_limits
  FOR SELECT USING (true);

-- =====================================================
-- 8. AUTO-CREATE PROFILE TRIGGER
-- =====================================================
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, tier)
  VALUES (NEW.id, 'free')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

-- =====================================================
-- 9. CREATE PROFILE FOR EXISTING USERS
-- =====================================================
INSERT INTO user_profiles (user_id, tier)
SELECT id, 'free' FROM auth.users
WHERE id NOT IN (SELECT user_id FROM user_profiles)
ON CONFLICT (user_id) DO NOTHING;

-- =====================================================
-- DONE!
-- =====================================================
