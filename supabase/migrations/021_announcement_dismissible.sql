-- Add is_dismissible column to announcements table
ALTER TABLE announcements
ADD COLUMN IF NOT EXISTS is_dismissible boolean NOT NULL DEFAULT true;

-- Comment for clarity
COMMENT ON COLUMN announcements.is_dismissible IS 'Whether users can dismiss this announcement with the X button';
