-- Add evaluation_method column to projects table
ALTER TABLE projects 
ADD COLUMN evaluation_method TEXT NOT NULL DEFAULT 'ai' CHECK (evaluation_method IN ('ai', 'regex'));

-- Add comment
COMMENT ON COLUMN projects.evaluation_method IS 'Method used for evaluating scan results: ai (LLM-based) or regex (pattern-based)';
