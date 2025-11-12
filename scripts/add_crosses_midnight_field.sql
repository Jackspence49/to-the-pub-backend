-- Migration script to add crosses_midnight field to bar_hours table
-- This field will help handle bars that close after midnight more explicitly

USE to_the_pub;

-- Add crosses_midnight boolean field to bar_hours table
ALTER TABLE bar_hours 
ADD COLUMN crosses_midnight BOOLEAN DEFAULT FALSE 
COMMENT 'Indicates if the operating hours cross midnight (e.g., open 10 PM, close 2 AM next day)';

-- Update existing records where close_time < open_time to set crosses_midnight = TRUE
-- This handles existing data that might already have cross-midnight hours
UPDATE bar_hours 
SET crosses_midnight = TRUE 
WHERE is_closed = 0 
  AND open_time IS NOT NULL 
  AND close_time IS NOT NULL 
  AND close_time < open_time;

-- Add index for better performance when filtering by crosses_midnight
CREATE INDEX idx_bar_hours_crosses_midnight ON bar_hours(crosses_midnight);

-- Display updated table structure
DESCRIBE bar_hours;

-- Example queries to verify the changes:
-- SELECT * FROM bar_hours WHERE crosses_midnight = TRUE LIMIT 5;
-- SELECT COUNT(*) as total_cross_midnight_entries FROM bar_hours WHERE crosses_midnight = TRUE;