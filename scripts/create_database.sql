
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
    crosses_midnight BOOLEAN DEFAULT FALSE

    UNIQUE KEY unique_bar_day (bar_id, day_of_week),
    FOREIGN KEY (bar_id) REFERENCES bars(id) ON DELETE CASCADE
);

-- Bar tags/categories table
CREATE TABLE bar_tags (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(50) NOT NULL UNIQUE,
    category VARCHAR(50), 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Junction table for many-to-many relationship between bars and tags
CREATE TABLE bar_tag_assignments (
    bar_id CHAR(36) NOT NULL,
    tag_id CHAR(36) NOT NULL,
    PRIMARY KEY (bar_id, tag_id),
    FOREIGN KEY (bar_id) REFERENCES bars(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES bar_tags(id) ON DELETE CASCADE
);

-- Bar tags/categories table
CREATE TABLE event_tags (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(50) NOT NULL UNIQUE, 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Junction table for many-to-many relationship between events and tags
CREATE TABLE event_tag_assignments (
    event_id CHAR(36) NOT NULL,
    tag_id CHAR(36) NOT NULL,
    PRIMARY KEY (event_id, tag_id),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES event_tags(id) ON DELETE CASCADE
);

-- Events table
CREATE TABLE events (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    bar_id CHAR(36) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    image_url VARCHAR(500),
    external_link VARCHAR(500),
    is_active BOOLEAN DEFAULT true, -- Adding this for soft deletes
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (bar_id) REFERENCES bars(id) ON DELETE CASCADE,
    INDEX idx_events_bar_date (bar_id, date),
    INDEX idx_events_date (date),
    INDEX idx_events_active (is_active),
    INDEX idx_events_bar_active (bar_id, is_active)
);


-- Indexes for better query performance
-- Bars indexes
CREATE INDEX idx_bars_name ON bars(name);
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
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    reset_token VARCHAR(255) DEFAULT NULL,
    reset_token_expires TIMESTAMP NULL DEFAULT NULL
);

CREATE INDEX idx_web_users_role ON web_users(role);
CREATE INDEX idx_web_users_reset_token ON web_users(reset_token);

-- Bar tags indexes
CREATE INDEX idx_bar_tag_assignments_bar ON bar_tag_assignments(bar_id);
CREATE INDEX idx_bar_tag_assignments_tag ON bar_tag_assignments(tag_id);

-- Sample tags to get started
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

-- Sample event category tags
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
