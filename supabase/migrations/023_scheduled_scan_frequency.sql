-- =====================================================
-- Migration 023: Scheduled Scan Frequency Extension
-- Description: Extend projects table with daily/weekly/monthly scheduling support
-- Depends on: 015_scheduled_scans.sql
-- =====================================================

-- 1. Add new scheduling columns to projects table
-- scheduled_scan_frequency: 'daily', 'weekly', 'monthly' (default 'weekly' for backward compat)
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS scheduled_scan_frequency TEXT NOT NULL DEFAULT 'weekly'
  CHECK (scheduled_scan_frequency IN ('daily', 'weekly', 'monthly'));

-- scheduled_scan_hour: hour of day (0-23) in user's timezone (default 6 = 6:00 AM)
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS scheduled_scan_hour INTEGER NOT NULL DEFAULT 6
  CHECK (scheduled_scan_hour >= 0 AND scheduled_scan_hour <= 23);

-- scheduled_scan_day_of_month: day of month for monthly scans (1-28, NULL for non-monthly)
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS scheduled_scan_day_of_month INTEGER
  CHECK (scheduled_scan_day_of_month IS NULL OR (scheduled_scan_day_of_month >= 1 AND scheduled_scan_day_of_month <= 28));

-- 2. Update comments for documentation
COMMENT ON COLUMN projects.scheduled_scan_frequency IS 'Scan frequency: daily, weekly, or monthly';
COMMENT ON COLUMN projects.scheduled_scan_hour IS 'Hour of day for scheduled scan (0-23) in user timezone';
COMMENT ON COLUMN projects.scheduled_scan_day IS 'Day of week for weekly scans (0=Sunday, 6=Saturday)';
COMMENT ON COLUMN projects.scheduled_scan_day_of_month IS 'Day of month for monthly scans (1-28)';

-- 3. Replace the calculate_next_scheduled_scan function with timezone-aware version
-- This function now supports daily/weekly/monthly frequencies with user timezone
CREATE OR REPLACE FUNCTION calculate_next_scheduled_scan(
  p_frequency TEXT,
  p_hour INTEGER,
  p_day_of_week INTEGER,
  p_day_of_month INTEGER,
  p_timezone TEXT
) RETURNS TIMESTAMPTZ AS $$
DECLARE
  v_now TIMESTAMPTZ;
  v_now_in_tz TIMESTAMP;
  v_candidate TIMESTAMP;
  v_today_dow INTEGER;
  v_days_until INTEGER;
  v_current_day_of_month INTEGER;
  v_next_month DATE;
BEGIN
  v_now := NOW();
  -- Convert current time to user's timezone
  v_now_in_tz := v_now AT TIME ZONE COALESCE(p_timezone, 'UTC');
  
  CASE p_frequency
    -- ==================
    -- DAILY scheduling
    -- ==================
    WHEN 'daily' THEN
      -- Try today at the specified hour
      v_candidate := DATE(v_now_in_tz) + (p_hour || ' hours')::INTERVAL;
      -- If that time has already passed today, schedule for tomorrow
      IF v_candidate <= v_now_in_tz THEN
        v_candidate := v_candidate + INTERVAL '1 day';
      END IF;
    
    -- ==================
    -- WEEKLY scheduling
    -- ==================
    WHEN 'weekly' THEN
      v_today_dow := EXTRACT(DOW FROM v_now_in_tz)::INTEGER;
      
      IF v_today_dow = COALESCE(p_day_of_week, 1) THEN
        -- Same day: check if the hour hasn't passed yet
        v_candidate := DATE(v_now_in_tz) + (p_hour || ' hours')::INTERVAL;
        IF v_candidate <= v_now_in_tz THEN
          -- Already passed, schedule next week
          v_candidate := v_candidate + INTERVAL '7 days';
        END IF;
      ELSIF v_today_dow < COALESCE(p_day_of_week, 1) THEN
        v_days_until := COALESCE(p_day_of_week, 1) - v_today_dow;
        v_candidate := DATE(v_now_in_tz) + (v_days_until || ' days')::INTERVAL + (p_hour || ' hours')::INTERVAL;
      ELSE
        v_days_until := 7 - (v_today_dow - COALESCE(p_day_of_week, 1));
        v_candidate := DATE(v_now_in_tz) + (v_days_until || ' days')::INTERVAL + (p_hour || ' hours')::INTERVAL;
      END IF;
    
    -- ==================
    -- MONTHLY scheduling
    -- ==================
    WHEN 'monthly' THEN
      v_current_day_of_month := EXTRACT(DAY FROM v_now_in_tz)::INTEGER;
      
      IF v_current_day_of_month = COALESCE(p_day_of_month, 1) THEN
        -- Same day: check if the hour hasn't passed yet
        v_candidate := DATE(v_now_in_tz) + (p_hour || ' hours')::INTERVAL;
        IF v_candidate <= v_now_in_tz THEN
          -- Already passed, schedule next month
          v_next_month := (DATE_TRUNC('month', v_now_in_tz::DATE) + INTERVAL '1 month')::DATE;
          -- Ensure the day exists in next month (cap at 28)
          v_candidate := v_next_month + ((LEAST(COALESCE(p_day_of_month, 1), 28) - 1) || ' days')::INTERVAL + (p_hour || ' hours')::INTERVAL;
        END IF;
      ELSIF v_current_day_of_month < COALESCE(p_day_of_month, 1) THEN
        -- Day hasn't come yet this month
        v_candidate := DATE_TRUNC('month', v_now_in_tz::DATE)::TIMESTAMP + ((COALESCE(p_day_of_month, 1) - 1) || ' days')::INTERVAL + (p_hour || ' hours')::INTERVAL;
      ELSE
        -- Day already passed this month, schedule next month
        v_next_month := (DATE_TRUNC('month', v_now_in_tz::DATE) + INTERVAL '1 month')::DATE;
        v_candidate := v_next_month + ((LEAST(COALESCE(p_day_of_month, 1), 28) - 1) || ' days')::INTERVAL + (p_hour || ' hours')::INTERVAL;
      END IF;
    
    ELSE
      -- Fallback: weekly behavior
      RETURN calculate_next_scheduled_scan('weekly', p_hour, p_day_of_week, p_day_of_month, p_timezone);
  END CASE;
  
  -- Convert candidate time from user's timezone back to UTC
  RETURN v_candidate AT TIME ZONE COALESCE(p_timezone, 'UTC');
END;
$$ LANGUAGE plpgsql;

-- 4. Update the trigger function to use the new calculation
-- Now it reads user timezone from user_settings and passes all frequency params
CREATE OR REPLACE FUNCTION update_next_scheduled_scan()
RETURNS TRIGGER AS $$
DECLARE
  v_timezone TEXT;
BEGIN
  IF NEW.scheduled_scan_enabled = true THEN
    -- Get user timezone from user_settings (provider = '_profile')
    SELECT COALESCE((config->>'timezone'), 'Europe/Prague')
    INTO v_timezone
    FROM user_settings
    WHERE user_id = NEW.user_id AND provider = '_profile';
    
    -- Default timezone if not found
    IF v_timezone IS NULL THEN
      v_timezone := 'Europe/Prague';
    END IF;
    
    -- Calculate next scan time based on frequency
    NEW.next_scheduled_scan_at := calculate_next_scheduled_scan(
      NEW.scheduled_scan_frequency,
      NEW.scheduled_scan_hour,
      NEW.scheduled_scan_day,          -- day of week for weekly
      NEW.scheduled_scan_day_of_month, -- day of month for monthly
      v_timezone
    );
  ELSE
    NEW.next_scheduled_scan_at := NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Recreate trigger to fire on new columns too
DROP TRIGGER IF EXISTS trigger_update_next_scheduled_scan ON projects;
CREATE TRIGGER trigger_update_next_scheduled_scan
BEFORE INSERT OR UPDATE OF scheduled_scan_enabled, scheduled_scan_day, scheduled_scan_frequency, scheduled_scan_hour, scheduled_scan_day_of_month
ON projects
FOR EACH ROW
EXECUTE FUNCTION update_next_scheduled_scan();

-- 6. Migrate existing data: set defaults for existing projects with scheduled scans
-- Existing weekly scans keep their settings; just populate the new frequency column
UPDATE projects 
SET 
  scheduled_scan_frequency = 'weekly',
  scheduled_scan_hour = 6
WHERE scheduled_scan_enabled = true
  AND scheduled_scan_frequency = 'weekly';  -- Already default, but explicit

-- 7. Update index for efficient querying by frequency
CREATE INDEX IF NOT EXISTS idx_projects_scheduled_frequency 
ON projects(scheduled_scan_frequency, scheduled_scan_hour) 
WHERE scheduled_scan_enabled = true;
