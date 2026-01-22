-- Add evaluation_method to scans table to track which method was used
ALTER TABLE scans 
ADD COLUMN evaluation_method TEXT NOT NULL DEFAULT 'regex' CHECK (evaluation_method IN ('ai', 'regex'));

-- Add comment
COMMENT ON COLUMN scans.evaluation_method IS 'Evaluation method used for this scan: ai or regex';
