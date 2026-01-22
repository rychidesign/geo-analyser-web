-- Migration: Add aggregated metrics to scans table
-- Run this in Supabase SQL Editor

-- Add new columns to scans table
ALTER TABLE scans 
ADD COLUMN IF NOT EXISTS avg_visibility DECIMAL(5, 2),
ADD COLUMN IF NOT EXISTS avg_sentiment DECIMAL(5, 2),
ADD COLUMN IF NOT EXISTS avg_citation DECIMAL(5, 2),
ADD COLUMN IF NOT EXISTS avg_ranking DECIMAL(5, 2),
ADD COLUMN IF NOT EXISTS total_queries INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_results INTEGER DEFAULT 0;

-- Update existing scans to have default values
UPDATE scans 
SET 
  avg_visibility = overall_score,
  avg_sentiment = 50,
  avg_citation = 0,
  avg_ranking = 0,
  total_queries = 0,
  total_results = 0
WHERE avg_visibility IS NULL;
