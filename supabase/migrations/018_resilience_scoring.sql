-- Migration: Add resilience scoring columns
-- This adds support for the new scoring algorithm where follow-ups 
-- act as confirmation bonuses rather than simple averages

-- Add new columns to scans table for resilience scoring
ALTER TABLE scans 
ADD COLUMN IF NOT EXISTS initial_score numeric(5,2) DEFAULT NULL;

ALTER TABLE scans 
ADD COLUMN IF NOT EXISTS conversational_bonus numeric(5,2) DEFAULT NULL;

ALTER TABLE scans 
ADD COLUMN IF NOT EXISTS brand_persistence numeric(5,2) DEFAULT NULL;

ALTER TABLE scans 
ADD COLUMN IF NOT EXISTS follow_up_active boolean DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN scans.initial_score IS 'Score from initial queries only (Level 0)';
COMMENT ON COLUMN scans.conversational_bonus IS 'Bonus/penalty from follow-up queries';
COMMENT ON COLUMN scans.brand_persistence IS 'Percentage of conversation levels where brand was mentioned (0-100)';
COMMENT ON COLUMN scans.follow_up_active IS 'Whether follow-up queries were used in this scan';

-- Create index for filtering by follow_up_active
CREATE INDEX IF NOT EXISTS idx_scans_follow_up_active ON scans(follow_up_active);

-- Backfill existing scans: set follow_up_active based on whether they have follow-up results
UPDATE scans s
SET follow_up_active = EXISTS (
  SELECT 1 FROM scan_results sr 
  WHERE sr.scan_id = s.id AND sr.follow_up_level > 0
),
initial_score = s.overall_score,
conversational_bonus = 0
WHERE s.follow_up_active IS NULL;
