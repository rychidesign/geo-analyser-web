-- Migration: Announcements system
-- Allows admins to display announcement bars to users

-- Create announcements table
CREATE TABLE IF NOT EXISTS announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message text NOT NULL,
  color_type text NOT NULL DEFAULT 'info' CHECK (color_type IN ('info', 'success', 'warning', 'error', 'custom')),
  custom_color text DEFAULT NULL,
  icon text NOT NULL DEFAULT 'info',
  link_url text DEFAULT NULL,
  link_text text DEFAULT NULL,
  is_active boolean NOT NULL DEFAULT false,
  show_to_tiers text[] DEFAULT ARRAY['free', 'paid', 'test', 'admin'],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Only one announcement can be active at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_announcements_single_active 
ON announcements (is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read active announcements
CREATE POLICY "Anyone can read active announcements"
ON announcements FOR SELECT
USING (is_active = true);

-- Policy: Admins can do everything
CREATE POLICY "Admins can manage announcements"
ON announcements FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.user_id = auth.uid()
    AND user_profiles.tier = 'admin'
  )
);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_announcements_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER announcements_updated_at
  BEFORE UPDATE ON announcements
  FOR EACH ROW
  EXECUTE FUNCTION update_announcements_updated_at();

-- Add comment
COMMENT ON TABLE announcements IS 'System announcements displayed as a bar at the top of the dashboard';
