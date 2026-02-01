-- =====================================================
-- Migration 011: User Tiers & Credit System
-- SaaS transformation - Pay As You Go model
-- =====================================================

-- =====================================================
-- 1. USER PROFILES - Extended user info with tier & credits
-- =====================================================
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- User tier/role
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'paid', 'test', 'admin')),
  
  -- Credit balance (in USD, stored as cents for precision)
  -- This is the combined balance (paid + bonus) shown to user
  credit_balance_cents INTEGER NOT NULL DEFAULT 0,
  
  -- Tracking paid vs bonus (internal, for reporting)
  paid_credits_cents INTEGER NOT NULL DEFAULT 0,
  bonus_credits_cents INTEGER NOT NULL DEFAULT 0,
  
  -- Free tier monthly limits tracking
  free_scans_used_this_month INTEGER NOT NULL DEFAULT 0,
  free_scans_reset_at TIMESTAMPTZ NOT NULL DEFAULT date_trunc('month', NOW()) + INTERVAL '1 month',
  
  -- Test account settings
  test_simulate_no_credits BOOLEAN NOT NULL DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX idx_user_profiles_tier ON user_profiles(tier);

-- =====================================================
-- 2. CREDIT TRANSACTIONS - All credit movements
-- =====================================================
CREATE TABLE credit_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Transaction type
  type TEXT NOT NULL CHECK (type IN (
    'top_up',           -- User added credits (via Paddle)
    'bonus',            -- Bonus credits awarded
    'usage',            -- Credits spent on scan/query
    'refund',           -- Refund for failed operation
    'admin_adjustment', -- Manual adjustment by admin
    'expired'           -- Credits expired (if we implement expiry)
  )),
  
  -- Amount in cents (positive for additions, negative for deductions)
  amount_cents INTEGER NOT NULL,
  
  -- Running balance after this transaction
  balance_after_cents INTEGER NOT NULL,
  
  -- Reference to what caused this transaction
  reference_type TEXT, -- 'scan', 'query', 'paddle_payment', etc.
  reference_id TEXT,   -- ID of the scan, payment, etc.
  
  -- Additional metadata
  description TEXT,
  metadata JSONB DEFAULT '{}',
  
  -- For admin tracking
  created_by UUID REFERENCES auth.users(id), -- NULL for system, user_id for self, admin_id for admin
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for querying
CREATE INDEX idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX idx_credit_transactions_created_at ON credit_transactions(created_at DESC);
CREATE INDEX idx_credit_transactions_type ON credit_transactions(type);

-- =====================================================
-- 3. CREDIT RESERVATIONS - Temporary holds during scans
-- =====================================================
CREATE TABLE credit_reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Amount reserved (in cents)
  amount_cents INTEGER NOT NULL,
  
  -- What this reservation is for
  scan_id UUID REFERENCES scans(id) ON DELETE CASCADE,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released', 'consumed')),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 hour', -- Auto-release after 1 hour
  resolved_at TIMESTAMPTZ
);

-- Index for active reservations
CREATE INDEX idx_credit_reservations_user_active ON credit_reservations(user_id) WHERE status = 'active';
CREATE INDEX idx_credit_reservations_expires ON credit_reservations(expires_at) WHERE status = 'active';

-- =====================================================
-- 4. PRICING CONFIG - Dynamic pricing from admin
-- =====================================================
CREATE TABLE pricing_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Model identifier
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  
  -- Base cost from provider (per 1M tokens, in USD cents)
  base_input_cost_cents INTEGER NOT NULL,
  base_output_cost_cents INTEGER NOT NULL,
  
  -- Our markup percentage (200 = 200% = 3x price)
  markup_percentage INTEGER NOT NULL DEFAULT 200,
  
  -- Calculated final price (cached, updated by trigger)
  final_input_cost_cents INTEGER NOT NULL,
  final_output_cost_cents INTEGER NOT NULL,
  
  -- Is this model available for free tier?
  available_free_tier BOOLEAN NOT NULL DEFAULT false,
  
  -- Is this model active/available?
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- When prices were last updated
  prices_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(provider, model)
);

-- =====================================================
-- 5. ADMIN STATS VIEW - For admin dashboard
-- =====================================================
CREATE OR REPLACE VIEW admin_user_stats AS
SELECT 
  up.user_id,
  au.email,
  up.tier,
  up.credit_balance_cents / 100.0 AS credit_balance_usd,
  up.paid_credits_cents / 100.0 AS total_paid_usd,
  up.bonus_credits_cents / 100.0 AS total_bonus_usd,
  up.free_scans_used_this_month,
  (
    SELECT COALESCE(SUM(ABS(amount_cents)), 0) / 100.0 
    FROM credit_transactions 
    WHERE credit_transactions.user_id = up.user_id 
    AND type = 'usage'
  ) AS total_spent_usd,
  (
    SELECT COUNT(*) 
    FROM scans 
    WHERE scans.user_id = up.user_id
  ) AS total_scans,
  (
    SELECT COUNT(*) 
    FROM projects 
    WHERE projects.user_id = up.user_id
  ) AS total_projects,
  up.created_at AS registered_at,
  up.updated_at AS last_active_at
FROM user_profiles up
JOIN auth.users au ON au.id = up.user_id;

-- =====================================================
-- 6. ROW LEVEL SECURITY
-- =====================================================

-- Enable RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_config ENABLE ROW LEVEL SECURITY;

-- USER PROFILES: Users can view/update their own profile
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile (limited)"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admin can view all profiles
CREATE POLICY "Admins can view all profiles"
  ON user_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_id = auth.uid() AND tier = 'admin'
    )
  );

-- Admin can update all profiles
CREATE POLICY "Admins can update all profiles"
  ON user_profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_id = auth.uid() AND tier = 'admin'
    )
  );

-- CREDIT TRANSACTIONS: Users can view their own transactions
CREATE POLICY "Users can view own transactions"
  ON credit_transactions FOR SELECT
  USING (auth.uid() = user_id);

-- System/Admin can insert transactions (handled by service role)
CREATE POLICY "Service can insert transactions"
  ON credit_transactions FOR INSERT
  WITH CHECK (true); -- Controlled via service role

-- Admin can view all transactions
CREATE POLICY "Admins can view all transactions"
  ON credit_transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_id = auth.uid() AND tier = 'admin'
    )
  );

-- CREDIT RESERVATIONS: Users can view their own
CREATE POLICY "Users can view own reservations"
  ON credit_reservations FOR SELECT
  USING (auth.uid() = user_id);

-- PRICING CONFIG: Everyone can read (public pricing)
CREATE POLICY "Anyone can view pricing"
  ON pricing_config FOR SELECT
  USING (true);

-- Only admins can modify pricing
CREATE POLICY "Admins can modify pricing"
  ON pricing_config FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_id = auth.uid() AND tier = 'admin'
    )
  );

-- =====================================================
-- 7. FUNCTIONS & TRIGGERS
-- =====================================================

-- Function to create user profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, tier)
  VALUES (NEW.id, 'free');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create profile
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Function to update pricing_config final costs
CREATE OR REPLACE FUNCTION calculate_final_pricing()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate final price: base * (1 + markup/100)
  -- For 200% markup: base * 3
  NEW.final_input_cost_cents := NEW.base_input_cost_cents * (100 + NEW.markup_percentage) / 100;
  NEW.final_output_cost_cents := NEW.base_output_cost_cents * (100 + NEW.markup_percentage) / 100;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_pricing_trigger
  BEFORE INSERT OR UPDATE ON pricing_config
  FOR EACH ROW EXECUTE FUNCTION calculate_final_pricing();

-- Function to reset free tier monthly limits
CREATE OR REPLACE FUNCTION reset_free_tier_limits()
RETURNS void AS $$
BEGIN
  UPDATE user_profiles
  SET 
    free_scans_used_this_month = 0,
    free_scans_reset_at = date_trunc('month', NOW()) + INTERVAL '1 month'
  WHERE tier = 'free' AND free_scans_reset_at <= NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to release expired reservations
CREATE OR REPLACE FUNCTION release_expired_reservations()
RETURNS void AS $$
DECLARE
  reservation RECORD;
BEGIN
  FOR reservation IN 
    SELECT * FROM credit_reservations 
    WHERE status = 'active' AND expires_at <= NOW()
  LOOP
    -- Update reservation status
    UPDATE credit_reservations 
    SET status = 'released', resolved_at = NOW()
    WHERE id = reservation.id;
    
    -- Add back to user balance
    UPDATE user_profiles
    SET credit_balance_cents = credit_balance_cents + reservation.amount_cents
    WHERE user_id = reservation.user_id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update updated_at trigger for user_profiles
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 8. INITIAL PRICING DATA
-- Insert current model pricing (base costs from providers)
-- Base costs are per 1M tokens in cents
-- =====================================================
INSERT INTO pricing_config (provider, model, base_input_cost_cents, base_output_cost_cents, available_free_tier, markup_percentage) VALUES
  -- OpenAI
  ('openai', 'gpt-5-2', 175, 1400, false, 200),
  ('openai', 'gpt-5-mini', 25, 200, true, 200),  -- Free tier
  
  -- Anthropic
  ('anthropic', 'claude-opus-4-5', 500, 2500, false, 200),
  ('anthropic', 'claude-sonnet-4-5', 300, 1500, false, 200),
  ('anthropic', 'claude-haiku-4-5', 100, 500, true, 200),  -- Free tier
  ('anthropic', 'claude-opus-4-1', 1200, 6000, false, 200),
  
  -- Google
  ('google', 'gemini-3-flash-preview', 50, 300, false, 200),
  ('google', 'gemini-2-5-flash', 60, 350, false, 200),
  ('google', 'gemini-2-5-flash-lite', 30, 250, true, 200)  -- Free tier
ON CONFLICT (provider, model) DO UPDATE SET
  base_input_cost_cents = EXCLUDED.base_input_cost_cents,
  base_output_cost_cents = EXCLUDED.base_output_cost_cents,
  available_free_tier = EXCLUDED.available_free_tier,
  markup_percentage = EXCLUDED.markup_percentage;

-- =====================================================
-- 9. FREE TIER LIMITS CONFIG
-- =====================================================
CREATE TABLE tier_limits (
  tier TEXT PRIMARY KEY,
  max_projects INTEGER,
  max_queries_per_project INTEGER,
  max_scans_per_month INTEGER,
  can_use_all_models BOOLEAN NOT NULL DEFAULT false,
  can_schedule_scans BOOLEAN NOT NULL DEFAULT false,
  description TEXT
);

INSERT INTO tier_limits (tier, max_projects, max_queries_per_project, max_scans_per_month, can_use_all_models, can_schedule_scans, description) VALUES
  ('free', 1, 5, 2, false, false, 'Free tier with limited features'),
  ('paid', NULL, NULL, NULL, true, true, 'Full access with credits'),
  ('test', NULL, NULL, NULL, true, true, 'Test account - simulates paid'),
  ('admin', NULL, NULL, NULL, true, true, 'Administrator account')
ON CONFLICT (tier) DO UPDATE SET
  max_projects = EXCLUDED.max_projects,
  max_queries_per_project = EXCLUDED.max_queries_per_project,
  max_scans_per_month = EXCLUDED.max_scans_per_month,
  can_use_all_models = EXCLUDED.can_use_all_models,
  can_schedule_scans = EXCLUDED.can_schedule_scans,
  description = EXCLUDED.description;

-- RLS for tier_limits (public read)
ALTER TABLE tier_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view tier limits"
  ON tier_limits FOR SELECT
  USING (true);

-- =====================================================
-- DONE! Run this migration in Supabase SQL Editor
-- =====================================================
