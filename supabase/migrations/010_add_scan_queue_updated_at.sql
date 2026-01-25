-- Add updated_at column to scan_queue table if it doesn't exist
-- This is for existing databases that already have scan_queue table

-- Add updated_at column
ALTER TABLE scan_queue 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Add trigger for automatic updated_at updates
-- (The update_updated_at_column function already exists from schema.sql)
DROP TRIGGER IF EXISTS update_scan_queue_updated_at ON scan_queue;
CREATE TRIGGER update_scan_queue_updated_at
  BEFORE UPDATE ON scan_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Update existing rows to have updated_at = created_at
UPDATE scan_queue 
SET updated_at = created_at 
WHERE updated_at IS NULL;
