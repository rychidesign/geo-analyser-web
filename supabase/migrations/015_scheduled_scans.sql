-- =====================================================
-- Migration: Scheduled Scans
-- Description: Add scheduled scan support to projects
-- =====================================================

-- 1. Add scheduled scan columns to projects table
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS scheduled_scan_enabled BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS scheduled_scan_day INTEGER CHECK (scheduled_scan_day >= 0 AND scheduled_scan_day <= 6),
ADD COLUMN IF NOT EXISTS last_scheduled_scan_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS next_scheduled_scan_at TIMESTAMPTZ;

-- 2. Create scheduled scan history table for tracking
CREATE TABLE IF NOT EXISTS scheduled_scan_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scan_id UUID REFERENCES scans(id) ON DELETE SET NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- 3. Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_scheduled_scan_history_project 
ON scheduled_scan_history(project_id, scheduled_for DESC);

CREATE INDEX IF NOT EXISTS idx_projects_scheduled_scan 
ON projects(scheduled_scan_enabled, next_scheduled_scan_at) 
WHERE scheduled_scan_enabled = true;

-- 4. Create function to calculate next scheduled scan time
-- Simplified: always schedules for 6:00 UTC on the chosen day
CREATE OR REPLACE FUNCTION calculate_next_scheduled_scan(
  p_scheduled_day INTEGER
) RETURNS TIMESTAMPTZ AS $$
DECLARE
  v_now TIMESTAMPTZ;
  v_today_day INTEGER;
  v_days_until INTEGER;
  v_next_date DATE;
BEGIN
  v_now := NOW() AT TIME ZONE 'UTC';
  v_today_day := EXTRACT(DOW FROM v_now)::INTEGER;
  
  -- Calculate days until next scheduled day
  IF v_today_day < p_scheduled_day THEN
    v_days_until := p_scheduled_day - v_today_day;
  ELSIF v_today_day = p_scheduled_day THEN
    -- Same day - if before 6 AM UTC, schedule today, otherwise next week
    IF EXTRACT(HOUR FROM v_now) < 6 THEN
      v_days_until := 0;
    ELSE
      v_days_until := 7;
    END IF;
  ELSE
    v_days_until := 7 - (v_today_day - p_scheduled_day);
  END IF;
  
  v_next_date := (v_now::DATE + v_days_until);
  
  -- Always at 6:00 UTC
  RETURN (v_next_date || ' 06:00:00')::TIMESTAMP AT TIME ZONE 'UTC';
END;
$$ LANGUAGE plpgsql;

-- 5. Create trigger to update next_scheduled_scan_at when scheduling changes
CREATE OR REPLACE FUNCTION update_next_scheduled_scan()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.scheduled_scan_enabled = true AND NEW.scheduled_scan_day IS NOT NULL THEN
    NEW.next_scheduled_scan_at := calculate_next_scheduled_scan(NEW.scheduled_scan_day);
  ELSE
    NEW.next_scheduled_scan_at := NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_next_scheduled_scan ON projects;
CREATE TRIGGER trigger_update_next_scheduled_scan
BEFORE INSERT OR UPDATE OF scheduled_scan_enabled, scheduled_scan_day
ON projects
FOR EACH ROW
EXECUTE FUNCTION update_next_scheduled_scan();

-- 6. Atomic claim function for parallel workers
CREATE OR REPLACE FUNCTION claim_pending_scan()
RETURNS TABLE (
  id UUID,
  project_id UUID,
  scheduled_for TIMESTAMPTZ
) AS $$
DECLARE
  claimed_id UUID;
  claimed_project_id UUID;
  claimed_scheduled_for TIMESTAMPTZ;
BEGIN
  -- Lock and claim one pending scan atomically
  UPDATE scheduled_scan_history
  SET status = 'running'
  WHERE id = (
    SELECT ssh.id
    FROM scheduled_scan_history ssh
    WHERE ssh.status = 'pending'
    ORDER BY ssh.scheduled_for ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING 
    scheduled_scan_history.id,
    scheduled_scan_history.project_id,
    scheduled_scan_history.scheduled_for
  INTO claimed_id, claimed_project_id, claimed_scheduled_for;
  
  IF claimed_id IS NOT NULL THEN
    RETURN QUERY SELECT claimed_id, claimed_project_id, claimed_scheduled_for;
  END IF;
  
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- 7. RLS policies for scheduled_scan_history
ALTER TABLE scheduled_scan_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their scheduled scan history" ON scheduled_scan_history
FOR SELECT USING (
  project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
);

-- 8. Comments for documentation
COMMENT ON COLUMN projects.scheduled_scan_enabled IS 'Whether automatic weekly scans are enabled';
COMMENT ON COLUMN projects.scheduled_scan_day IS 'Day of week for scheduled scan (0=Sunday, 6=Saturday)';
COMMENT ON COLUMN projects.last_scheduled_scan_at IS 'When the last scheduled scan was executed';
COMMENT ON COLUMN projects.next_scheduled_scan_at IS 'Calculated next scan time (auto-updated by trigger)';
COMMENT ON TABLE scheduled_scan_history IS 'History of all scheduled scan executions';
