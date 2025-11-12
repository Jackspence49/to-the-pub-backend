-- Migration script to update events table to match new specifications
-- This script updates the existing events table to align with the requested schema

USE to_the_pub;

-- Drop the existing events table and recreate with new schema
DROP TABLE IF EXISTS events;

-- Create events table with the exact specifications requested
CREATE TABLE events (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    bar_id CHAR(36) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    image_url VARCHAR(500),
    category VARCHAR(100) NOT NULL, -- 'live_music', 'trivia', 'happy_hour', 'sports', 'comedy'
    external_link VARCHAR(500),
    is_active BOOLEAN DEFAULT true, -- Adding this for soft deletes
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (bar_id) REFERENCES bars(id) ON DELETE CASCADE,
    INDEX idx_events_bar_date (bar_id, date),
    INDEX idx_events_date (date),
    INDEX idx_events_category (category),
    INDEX idx_events_active (is_active),
    INDEX idx_events_bar_active (bar_id, is_active)
);