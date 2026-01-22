-- Migration: Add language field to projects table
ALTER TABLE projects ADD COLUMN language TEXT DEFAULT 'en' NOT NULL;
