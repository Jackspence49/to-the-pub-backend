-- Fresh Database Schema for To The Pub Backend
-- This script creates a complete database from scratch

-- Create the database if it doesn't exist
CREATE DATABASE IF NOT EXISTS to_the_pub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE to_the_pub;

-- ===========================
-- BARS TABLES
-- ===========================

-- Bars table - core information about each bar
CREATE TABLE bars (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    address_street VARCHAR(255) NOT NULL,
    address_city VARCHAR(100) NOT NULL DEFAULT 'Boston',
    address_state VARCHAR(2) NOT NULL DEFAULT 'MA',
    address_zip VARCHAR(10) NOT NULL,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    phone VARCHAR(20),
    website VARCHAR(500),
    instagram VARCHAR(100),
    facebook VARCHAR(100),
    twitter VARCHAR(100),
    posh VARCHAR(100),
    eventbrite VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_bars_name (name),
    INDEX idx_bars_city (address_city),
    INDEX idx_bars_active (is_active),
    INDEX idx_bars_location (latitude, longitude)
);

-- Bar hours table - operating hours for each day
CREATE TABLE bar_hours (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    bar_id CHAR(36) NOT NULL,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    open_time TIME,
    close_time TIME,
    is_closed BOOLEAN DEFAULT false,
    crosses_midnight BOOLEAN DEFAULT FALSE,
    
    UNIQUE KEY unique_bar_day (bar_id, day_of_week),
    FOREIGN KEY (bar_id) REFERENCES bars(id) ON DELETE CASCADE
);

-- Bar tags/categories
CREATE TABLE bar_tags (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(50) NOT NULL UNIQUE,
    category VARCHAR(50), 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Junction table for bars and tags
CREATE TABLE bar_tag_assignments (
    bar_id CHAR(36) NOT NULL,
    tag_id CHAR(36) NOT NULL,
    PRIMARY KEY (bar_id, tag_id),
    FOREIGN KEY (bar_id) REFERENCES bars(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES bar_tags(id) ON DELETE CASCADE,
    
    INDEX idx_bar_tag_assignments_bar (bar_id),
    INDEX idx_bar_tag_assignments_tag (tag_id)
);

-- ===========================
-- EVENTS TABLES
-- ===========================

-- Event tags
CREATE TABLE event_tags (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(50) NOT NULL UNIQUE, 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Events table (master events for recurring patterns)
CREATE TABLE events (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    bar_id CHAR(36) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    event_tag_id CHAR(36),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    crosses_midnight BOOLEAN DEFAULT FALSE,
    image_url VARCHAR(500),
    external_link VARCHAR(500),
    
    -- Recurrence fields
    recurrence_pattern ENUM('none', 'daily', 'weekly', 'monthly') DEFAULT 'none',
    recurrence_days JSON,
    start_date DATE,
    recurrence_end_date DATE,
    recurrence_end_occurrences INT NULL,
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (bar_id) REFERENCES bars(id) ON DELETE CASCADE,
    FOREIGN KEY (event_tag_id) REFERENCES event_tags(id) ON DELETE SET NULL,
    INDEX idx_events_bar_id (bar_id),
    INDEX idx_events_event_tag_id (event_tag_id),
    INDEX idx_events_active (is_active),
    INDEX idx_events_pattern (recurrence_pattern),
    INDEX idx_events_recurrence_dates (start_date, recurrence_end_date)
);

-- Event instances table (specific occurrences)
CREATE TABLE event_instances (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    event_id CHAR(36) NOT NULL,
    date DATE NOT NULL,
    is_cancelled BOOLEAN DEFAULT false,
    
    -- Optional overrides for specific instances
    custom_start_time TIME NULL,
    custom_end_time TIME NULL,
    custom_description TEXT NULL,
    custom_image_url VARCHAR(500) NULL,
        custom_title VARCHAR(255) NULL,
        custom_event_tag_id CHAR(36) NULL,
        custom_external_link VARCHAR(500) NULL,
    crosses_midnight BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (custom_event_tag_id) REFERENCES event_tags(id) ON DELETE SET NULL,
    UNIQUE KEY unique_event_date (event_id, date),
    INDEX idx_instances_date (date),
    INDEX idx_instances_event_id (event_id),
    INDEX idx_instances_cancelled (is_cancelled),
    INDEX idx_instances_custom_tag (custom_event_tag_id)
);

-- ===========================
-- USER TABLES
-- ===========================

-- Web users table - application users and roles
CREATE TABLE web_users (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role ENUM('super_admin', 'venue_owner', 'staff', 'manager', 'user') NOT NULL DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    reset_token VARCHAR(255) DEFAULT NULL,
    reset_token_expires TIMESTAMP NULL DEFAULT NULL,
    
    INDEX idx_web_users_role (role),
    INDEX idx_web_users_reset_token (reset_token)
);

-- App users table - customer-facing accounts for the mobile app
CREATE TABLE app_users (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    phone VARCHAR(30),
    last_login TIMESTAMP NULL DEFAULT NULL,
    reset_token VARCHAR(255) DEFAULT NULL,
    reset_token_expires TIMESTAMP NULL DEFAULT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_app_users_email (email),
    INDEX idx_app_users_active (is_active)
);

-- ===========================
-- VIEWS FOR QUERIES
-- ===========================

-- View for upcoming event instances with event details
CREATE VIEW upcoming_event_instances AS
SELECT 
    ei.id as instance_id,
    ei.event_id,
    ei.date,
    ei.is_cancelled,
    COALESCE(ei.custom_start_time, e.start_time) as start_time,
    COALESCE(ei.custom_end_time, e.end_time) as end_time,
    ei.crosses_midnight,
    COALESCE(ei.custom_description, e.description) as description,
    COALESCE(ei.custom_image_url, e.image_url) as image_url,
        COALESCE(ei.custom_title, e.title) as title,
        COALESCE(ei.custom_external_link, e.external_link) as external_link,
        COALESCE(ei.custom_event_tag_id, e.event_tag_id) as event_tag_id,
    e.bar_id,
    b.name as bar_name,
    b.address_city,
    b.address_state
FROM event_instances ei
JOIN events e ON ei.event_id = e.id
JOIN bars b ON e.bar_id = b.id
WHERE ei.date >= CURDATE() 
AND ei.is_cancelled = false 
AND e.is_active = true 
AND b.is_active = true
ORDER BY ei.date, start_time;

-- View for all event instances with event details
CREATE VIEW all_event_instances AS
SELECT 
    ei.id as instance_id,
    ei.event_id,
    ei.date,
    ei.is_cancelled,
    COALESCE(ei.custom_start_time, e.start_time) as start_time,
    COALESCE(ei.custom_end_time, e.end_time) as end_time,
    ei.crosses_midnight,
    COALESCE(ei.custom_description, e.description) as description,
    COALESCE(ei.custom_image_url, e.image_url) as image_url,
        COALESCE(ei.custom_title, e.title) as title,
        COALESCE(ei.custom_external_link, e.external_link) as external_link,
        COALESCE(ei.custom_event_tag_id, e.event_tag_id) as event_tag_id,
    e.bar_id,
    b.name as bar_name,
    b.address_city,
    b.address_state,
    e.recurrence_pattern,
    e.recurrence_days
FROM event_instances ei
JOIN events e ON ei.event_id = e.id
JOIN bars b ON e.bar_id = b.id
WHERE e.is_active = true 
AND b.is_active = true
ORDER BY ei.date, start_time;

-- ===========================
-- SAMPLE DATA
-- ===========================

-- Sample bar tags
INSERT INTO bar_tags (name, category) VALUES
    ('Sports Bar', 'type'),
    ('Dive Bar', 'type'),
    ('Cocktail Lounge', 'type'),
    ('Brewery', 'type'),
    ('Wine Bar', 'type'),
    ('Dance Club', 'type'),
    ('Irish Pub', 'type'),
    ('Karaoke', 'amenity'),
    ('Live Music', 'amenity'),
    ('Pool Tables', 'amenity'),
    ('Outdoor Seating', 'amenity'),
    ('Food Served', 'amenity'),
    ('Pet Friendly', 'amenity'),
    ('Happy Hour', 'amenity'),
    ('DJ', 'amenity'),
    ('Trivia', 'amenity'),
    ('Darts', 'amenity'),
    ('Craft Beer', 'type'),
    ('Rooftop', 'amenity');

-- Sample event tags
INSERT INTO event_tags (name) VALUES
    ('Live Music'),
    ('Trivia'),
    ('Happy Hour'),
    ('Sports'),
    ('Comedy'),
    ('Karaoke'),
    ('DJ Night'),
    ('Open Mic'),
    ('Themed Party'),
    ('Game Night'),
    ('Dancing'),
    ('Food Special'),
    ('Drink Special'),
    ('Private Event'),
    ('Networking');