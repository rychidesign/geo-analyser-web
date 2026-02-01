-- Migration: Add follow-up query support
-- This enables testing organic brand visibility through conversation depth

-- ============================================
-- 1. Add follow-up settings to projects
-- ============================================

ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS follow_up_enabled boolean DEFAULT false;

ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS follow_up_depth integer DEFAULT 1;

-- Add constraint for depth (1-3)
ALTER TABLE projects 
ADD CONSTRAINT check_follow_up_depth 
CHECK (follow_up_depth >= 1 AND follow_up_depth <= 3);

-- ============================================
-- 2. Add follow-up tracking to scan_results
-- ============================================

-- Level: 0 = initial response, 1-3 = follow-up depth
ALTER TABLE scan_results 
ADD COLUMN IF NOT EXISTS follow_up_level integer DEFAULT 0;

-- Link to parent result (for conversation chain)
ALTER TABLE scan_results 
ADD COLUMN IF NOT EXISTS parent_result_id uuid REFERENCES scan_results(id) ON DELETE SET NULL;

-- The follow-up question that was asked
ALTER TABLE scan_results 
ADD COLUMN IF NOT EXISTS follow_up_query_used text;

-- ============================================
-- 3. Add indexes for efficient queries
-- ============================================

CREATE INDEX IF NOT EXISTS idx_scan_results_follow_up_level 
ON scan_results(follow_up_level);

CREATE INDEX IF NOT EXISTS idx_scan_results_parent_result_id 
ON scan_results(parent_result_id);

-- ============================================
-- 4. Update existing records
-- ============================================

-- Set all existing results to level 0 (initial)
UPDATE scan_results 
SET follow_up_level = 0 
WHERE follow_up_level IS NULL;

-- Set all existing projects to disabled follow-up
UPDATE projects 
SET follow_up_enabled = false, follow_up_depth = 1 
WHERE follow_up_enabled IS NULL;

-- ============================================
-- 5. Comments for documentation
-- ============================================

COMMENT ON COLUMN projects.follow_up_enabled IS 'Whether to run follow-up queries during scans';
COMMENT ON COLUMN projects.follow_up_depth IS 'Number of follow-up questions (1-3)';
COMMENT ON COLUMN scan_results.follow_up_level IS '0=initial response, 1-3=follow-up depth level';
COMMENT ON COLUMN scan_results.parent_result_id IS 'Links to the previous result in conversation chain';
COMMENT ON COLUMN scan_results.follow_up_query_used IS 'The follow-up question that was asked to get this response';
