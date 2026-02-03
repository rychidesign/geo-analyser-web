-- =====================================================
-- Migration: Scan Queue Claim Function
-- Description: Add atomic claim function for parallel workers processing scan_queue
-- =====================================================

-- Function to atomically claim a pending scan from the queue
-- Used by workers to safely process scans without race conditions
CREATE OR REPLACE FUNCTION claim_pending_queue_scan()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  project_id UUID,
  priority INTEGER,
  progress_total INTEGER
) AS $$
DECLARE
  claimed_id UUID;
  claimed_user_id UUID;
  claimed_project_id UUID;
  claimed_priority INTEGER;
  claimed_progress_total INTEGER;
BEGIN
  -- Lock and claim one pending scan atomically
  -- Using FOR UPDATE SKIP LOCKED to avoid blocking other workers
  UPDATE scan_queue sq
  SET 
    status = 'running',
    started_at = NOW(),
    progress_message = 'Processing...'
  WHERE sq.id = (
    SELECT inner_sq.id
    FROM scan_queue inner_sq
    WHERE inner_sq.status = 'pending'
    ORDER BY inner_sq.priority DESC, inner_sq.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING 
    sq.id,
    sq.user_id,
    sq.project_id,
    sq.priority,
    sq.progress_total
  INTO claimed_id, claimed_user_id, claimed_project_id, claimed_priority, claimed_progress_total;
  
  IF claimed_id IS NOT NULL THEN
    RETURN QUERY SELECT claimed_id, claimed_user_id, claimed_project_id, claimed_priority, claimed_progress_total;
  END IF;
  
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- Add comment for documentation
COMMENT ON FUNCTION claim_pending_queue_scan() IS 'Atomically claim a pending scan from the queue for processing. Returns the claimed scan details or empty if no pending scans.';

-- Create index for efficient worker polling (if not exists)
CREATE INDEX IF NOT EXISTS idx_scan_queue_worker_poll 
ON scan_queue(status, priority DESC, created_at ASC) 
WHERE status = 'pending';
