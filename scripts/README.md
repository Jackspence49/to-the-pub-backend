# 🍺 To The Pub - Database Setup Guide

Welcome! This guide will help you set up the database for the "To The Pub" backend from scratch.

## 🚀 Quick Start (Recommended)

For beginners or those who want an automated setup:

1. **Install dependencies** (if you haven't already):
   ```bash
   npm install
   ```

2. **Run the automated setup**:
   ```bash
   npm run setup
   ```

3. **Follow the prompts** to configure your database connection

That's it! The script will:
- Create your `.env` file with database credentials
- Test the database connection
- Create the database if it doesn't exist
- Set up all tables, indexes, and sample data

## 📋 Prerequisites

Before you start, make sure you have:

- **Node.js** (v16 or higher)
- **MySQL** (v8.0 or higher) running on your system
- **MySQL credentials** (username, password, host, port)

### Installing MySQL

If you don't have MySQL installed:

**Windows:**
- Download MySQL Community Server from [mysql.com](https://dev.mysql.com/downloads/mysql/)
- Or use [XAMPP](https://www.apachefriends.org/) for an easy all-in-one solution

**macOS:**
```bash
brew install mysql
brew services start mysql
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install mysql-server
sudo systemctl start mysql
```

## ⚙️ Manual Setup (Alternative)

If you prefer to set things up manually:

### 1. Environment Configuration

Copy the example environment file:
```bash
cp .env.example .env
```

Edit `.env` with your database details:
```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password_here
DB_NAME=to_the_pub
```

### 2. Create Database

Log into MySQL and create the database:
```sql
CREATE DATABASE to_the_pub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 3. Run Schema Creation

Use one of these options:

**Option A: Use our setup script** (Recommended)
```bash
npm run setup
```

**Option B: Use the alternative setup script**
```bash
npm run setup-db
```

**Option C: Run SQL directly**
```bash
mysql -u your_username -p to_the_pub < scripts/fresh-schema.sql
```

## 📁 What Gets Created

The setup creates the following tables:

### Core Tables
- **`bars`** - Bar information and locations
- **`bar_hours`** - Operating hours for each bar
- **`bar_tags`** - Categories and amenities (Sports Bar, Karaoke, etc.)
- **`bar_tag_assignments`** - Links bars to their tags

### Events System
- **`events`** - Master events with recurrence patterns
- **`event_instances`** - Specific event occurrences
- **`event_tags`** - Event categories (Live Music, Trivia, etc.)
- **`events`** - Master event definitions with direct link to event_tags via event_tag_id

### User Management
- **`web_users`** - Application users with roles

### Helper Views
- **`upcoming_event_instances`** - Easy access to future events
- **`all_event_instances`** - All events with details

## 🔧 Testing Your Setup

After setup, test everything works:

```bash
# Run the test suite
npm test

# Start the development server
npm start
```

Visit `http://localhost:3000` to see if the server is running.

## 🏃‍♂️ Available Scripts

- `npm run setup` - Full automated database setup
- `npm run setup-db` - Database setup only (existing script)
- `npm start` - Start the development server
- `npm test` - Run tests
- `npm run test:coverage` - Run tests with coverage report

## 🆘 Troubleshooting

### Common Issues

**Connection refused / Access denied:**
- Check your MySQL service is running
- Verify username/password in `.env`
- Make sure MySQL is accepting connections on the specified port

**Database already exists:**
- The script will use the existing database
- If you want a fresh start, drop the database first: `DROP DATABASE to_the_pub;`

**Permission denied:**
- Make sure your MySQL user has CREATE, ALTER, INSERT, SELECT permissions
- For development, consider using the root user

**Node.js errors:**
- Ensure you've run `npm install`
- Check Node.js version: `node --version` (should be v16+)

### Getting Help

If you run into issues:

1. Check the console output for specific error messages
2. Verify your MySQL connection settings
3. Make sure all dependencies are installed
4. Check the `docs/` folder for additional documentation

## 📚 Next Steps

Once your database is set up:

1. **Add some test data** - Use the API endpoints to create bars and events
2. **Explore the API** - Check the route files in `src/routes/`
3. **Read the docs** - Additional documentation is in the `docs/` folder
4. **Run tests** - Make sure everything works with `npm test`

## 🏗️ Database Schema Overview

```
bars
├── Basic info (name, address, contact)
├── Location (latitude, longitude)
└── Status (active/inactive)

bar_hours
└── Operating hours by day of week

events (Master/Template)
├── Basic info (title, description, times)
├── Recurrence pattern (none/daily/weekly/monthly)
└── Date ranges

event_instances (Actual Occurrences)
├── Specific date
├── Cancellation status
└── Custom overrides (time, description, etc.)
```

Happy coding! 🍻