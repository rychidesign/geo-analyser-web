-- Migration: Add selected_models to projects
-- Run this in Supabase SQL Editor

-- Add selected_models column to projects
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS selected_models JSONB NOT NULL DEFAULT '["gpt-5-nano"]';

-- Update existing projects with default model
UPDATE projects 
SET selected_models = '["gpt-5-nano"]'
WHERE selected_models IS NULL OR selected_models = '[]';
