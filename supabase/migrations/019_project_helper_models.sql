-- Add AI helper model settings to projects table
-- This allows per-project configuration of query generation and evaluation models

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS query_generation_model text DEFAULT 'gpt-5-mini',
ADD COLUMN IF NOT EXISTS evaluation_model text DEFAULT 'gpt-5-mini';

-- Add comment for documentation
COMMENT ON COLUMN projects.query_generation_model IS 'Model used for AI-generated queries in this project';
COMMENT ON COLUMN projects.evaluation_model IS 'Model used for evaluating AI responses in this project';
