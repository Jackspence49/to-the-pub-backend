const fs = require('fs');
const path = require('path');
// Load environment variables from the project's .env so DB credentials like DB_USER are available
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');
const dbConfig = require('../config/database');

async function setupDatabase() {
  let connection;
  
  try {
    console.log('Setting up To The Pub database...');
    
  // Create connection without specifying database first
  const tempConfig = { ...dbConfig };
  delete tempConfig.database;

  // Ensure user/password are present (fallback to env vars if needed)
  tempConfig.user = tempConfig.user || process.env.DB_USER;
  tempConfig.password = tempConfig.password || process.env.DB_PASSWORD;
    
    connection = await mysql.createConnection(tempConfig);
    console.log('Connected to MySQL server');
    
    // Read the SQL file
    const sqlFile = path.join(__dirname, 'fresh-schema.sql');
    const sqlContent = fs.readFileSync(sqlFile, 'utf8');
    
    // Split the SQL content into individual statements
    // Remove comments and split by semicolons
    const cleanedSql = sqlContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('--'))
      .join('\n');
    
    const statements = cleanedSql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0);
    
    console.log(`Found ${statements.length} SQL statements to execute`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        try {
          console.log(`Executing statement ${i + 1}/${statements.length}...`);
          
          // Handle USE statement specially - it can't be prepared
          if (statement.toUpperCase().startsWith('USE ')) {
            await connection.query(statement);
            console.log(`  ✓ Database selected: ${statement.split(' ')[1]}`);
          } else {
            await connection.execute(statement);
            console.log(`  ✓ Statement executed successfully`);
          }
        } catch (error) {
          console.error(`  ❌ Error executing statement ${i + 1}:`, error.message);
          console.error('  Statement:', statement.substring(0, 100) + '...');
          // Continue with other statements
        }
      }
    }
    
    console.log('✅ Database setup completed successfully!');
    
  } catch (error) {
    console.error('❌ Error setting up database:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('Database connection closed');
    }
  }
}

// Run the setup if this script is executed directly
if (require.main === module) {
  setupDatabase();
}

module.exports = setupDatabase;
