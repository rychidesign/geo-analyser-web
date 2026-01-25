-- Create scan_queue table for managing scan execution
CREATE TABLE scan_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scan_id UUID REFERENCES scans(id) ON DELETE CASCADE,
  
  -- Queue management
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed', 'cancelled')),
  priority INTEGER NOT NULL DEFAULT 0, -- Higher = runs first
  
  -- Progress tracking
  progress_current INTEGER DEFAULT 0,
  progress_total INTEGER DEFAULT 0,
  progress_message TEXT,
  
  -- Scheduling
  is_scheduled BOOLEAN NOT NULL DEFAULT false,
  scheduled_for TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Error tracking
  error_message TEXT
);

-- Indexes for performance
CREATE INDEX idx_scan_queue_user_id ON scan_queue(user_id);
CREATE INDEX idx_scan_queue_status ON scan_queue(status);
CREATE INDEX idx_scan_queue_project_id ON scan_queue(project_id);
CREATE INDEX idx_scan_queue_priority ON scan_queue(priority DESC, created_at ASC);
CREATE INDEX idx_scan_queue_scheduled ON scan_queue(is_scheduled, scheduled_for) WHERE is_scheduled = true;

-- Enable Row Level Security
ALTER TABLE scan_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own queue items"
  ON scan_queue FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own queue items"
  ON scan_queue FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own queue items"
  ON scan_queue FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own queue items"
  ON scan_queue FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_scan_queue_updated_at
  BEFORE UPDATE ON scan_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE scan_queue IS 'Queue system for managing scan execution with pause/resume support';
COMMENT ON COLUMN scan_queue.priority IS 'Higher priority scans run first (0 = normal, 1+ = higher)';
COMMENT ON COLUMN scan_queue.is_scheduled IS 'Whether this scan was triggered by scheduled scan system';
