
 -- initial schema
USE to_the_pub;

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
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Bar hours table - operating hours for each day
CREATE TABLE bar_hours (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    bar_id CHAR(36) NOT NULL,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday, 6=Saturday
    open_time TIME,
    close_time TIME,
    is_closed BOOLEAN DEFAULT false, -- for days they're closed
    UNIQUE KEY unique_bar_day (bar_id, day_of_week),
    FOREIGN KEY (bar_id) REFERENCES bars(id) ON DELETE CASCADE
);

-- Bar tags/categories table
CREATE TABLE tags (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(50) NOT NULL UNIQUE,
    category VARCHAR(50), -- 'type', 'atmosphere', 'amenity'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Junction table for many-to-many relationship between bars and tags
CREATE TABLE bar_tags (
    bar_id CHAR(36) NOT NULL,
    tag_id CHAR(36) NOT NULL,
    PRIMARY KEY (bar_id, tag_id),
    FOREIGN KEY (bar_id) REFERENCES bars(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- Events table
CREATE TABLE events (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    bar_id CHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    event_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    cover_charge DECIMAL(6, 2),
    is_recurring BOOLEAN DEFAULT false,
    recurrence_pattern VARCHAR(50), -- 'weekly', 'biweekly', 'monthly', etc.
    event_type VARCHAR(100), -- 'live_music', 'trivia', 'karaoke', 'dj', etc.
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (bar_id) REFERENCES bars(id) ON DELETE CASCADE
);


-- Indexes for better query performance
-- Bars indexes
CREATE INDEX idx_bars_city ON bars(address_city);
CREATE INDEX idx_bars_active ON bars(is_active);
CREATE INDEX idx_bars_location ON bars(latitude, longitude);

CREATE INDEX idx_events_bar_date ON events(bar_id, event_date);
CREATE INDEX idx_events_date ON events(event_date);
CREATE INDEX idx_events_active ON events(is_active);

-- Web users table - application users and roles
CREATE TABLE web_users (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role ENUM('super_admin', 'venue_owner', 'staff', 'manager', 'user') NOT NULL DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX idx_web_users_role ON web_users(role);

-- Bar tags indexes
CREATE INDEX idx_bar_tags_bar ON bar_tags(bar_id);
CREATE INDEX idx_bar_tags_tag ON bar_tags(tag_id);

-- Sample tags to get started
INSERT INTO tags (name, category) VALUES
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
