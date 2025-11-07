-- Add password reset fields to web_users table
-- Run this to add support for password reset functionality

USE to_the_pub;

ALTER TABLE web_users 
ADD COLUMN reset_token VARCHAR(255) DEFAULT NULL,
ADD COLUMN reset_token_expires TIMESTAMP NULL DEFAULT NULL;

-- Add index for faster token lookups
CREATE INDEX idx_web_users_reset_token ON web_users(reset_token);