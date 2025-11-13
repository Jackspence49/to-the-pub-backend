const fs = require('fs');
const path = require('path');
const readline = require('readline');
const mysql = require('mysql2/promise');

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = '') {
  console.log(`${color}${message}${colors.reset}`);
}

function createReadlineInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

function question(rl, prompt) {
  return new Promise(resolve => {
    rl.question(prompt, resolve);
  });
}

async function checkDotEnvExists() {
  const envPath = path.join(__dirname, '..', '.env');
  return fs.existsSync(envPath);
}

async function createDotEnv(dbConfig) {
  const envPath = path.join(__dirname, '..', '.env');
  const envContent = `# Database Configuration
DB_HOST=${dbConfig.host}
DB_PORT=${dbConfig.port}
DB_USER=${dbConfig.user}
DB_PASSWORD=${dbConfig.password}
DB_NAME=${dbConfig.database}
DB_CONNECTION_LIMIT=10

# Application Configuration
NODE_ENV=development
PORT=3000
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Optional: Set timezone
TZ=America/New_York
`;

  fs.writeFileSync(envPath, envContent);
  log(`✅ Created .env file at ${envPath}`, colors.green);
}

async function getDatabaseConfig() {
  const rl = createReadlineInterface();
  
  log('\n🔧 Database Configuration Setup', colors.bold + colors.blue);
  log('Please provide your MySQL database connection details:\n', colors.blue);
  
  const config = {};
  
  config.host = await question(rl, 'Database host (default: localhost): ') || 'localhost';
  config.port = await question(rl, 'Database port (default: 3306): ') || '3306';
  config.user = await question(rl, 'Database username (default: root): ') || 'root';
  
  // Hide password input
  const password = await question(rl, 'Database password: ');
  config.password = password;
  
  config.database = await question(rl, 'Database name (default: to_the_pub): ') || 'to_the_pub';
  
  rl.close();
  
  return config;
}

async function testConnection(config) {
  log('\n🔌 Testing database connection...', colors.yellow);
  
  try {
    // First test connection without database
    const tempConfig = { ...config };
    delete tempConfig.database;
    
    const connection = await mysql.createConnection(tempConfig);
    log('✅ Successfully connected to MySQL server', colors.green);
    
    // Check if database exists
    const [databases] = await connection.execute('SHOW DATABASES LIKE ?', [config.database]);
    
    if (databases.length === 0) {
      log(`📁 Database '${config.database}' does not exist. Creating it...`, colors.yellow);
      await connection.execute(`CREATE DATABASE \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      log(`✅ Database '${config.database}' created successfully`, colors.green);
    } else {
      log(`📁 Database '${config.database}' already exists`, colors.green);
    }
    
    await connection.end();
    return true;
  } catch (error) {
    log(`❌ Database connection failed: ${error.message}`, colors.red);
    return false;
  }
}

async function executeSQL(config) {
  log('\n📊 Creating database schema...', colors.yellow);
  
  try {
    const connection = await mysql.createConnection(config);
    
    // Read the fresh schema SQL file
    const sqlFile = path.join(__dirname, 'fresh-schema.sql');
    const sqlContent = fs.readFileSync(sqlFile, 'utf8');
    
    // Split into statements and execute
    const statements = sqlContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    log(`📋 Executing ${statements.length} SQL statements...`, colors.blue);
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        try {
          await connection.execute(statement);
          process.stdout.write('.');
        } catch (error) {
          log(`\n❌ Error in statement ${i + 1}: ${error.message}`, colors.red);
          throw error;
        }
      }
    }
    
    console.log(''); // New line after dots
    log('✅ Database schema created successfully!', colors.green);
    
    await connection.end();
    return true;
  } catch (error) {
    log(`❌ Schema creation failed: ${error.message}`, colors.red);
    return false;
  }
}

async function runSetup() {
  log('🍺 Welcome to To The Pub - Database Setup', colors.bold + colors.green);
  log('==========================================\n', colors.green);
  
  try {
    // Check if .env already exists
    const envExists = await checkDotEnvExists();
    
    let config;
    if (envExists) {
      log('📁 Found existing .env file. Using existing configuration.', colors.yellow);
      require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
      config = {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
      };
    } else {
      // Get database configuration from user
      config = await getDatabaseConfig();
      
      // Create .env file
      await createDotEnv(config);
    }
    
    // Test connection and create database if needed
    const connected = await testConnection(config);
    if (!connected) {
      log('\n❌ Setup failed. Please check your database configuration and try again.', colors.red);
      process.exit(1);
    }
    
    // Execute SQL schema
    const schemaCreated = await executeSQL(config);
    if (!schemaCreated) {
      log('\n❌ Setup failed during schema creation.', colors.red);
      process.exit(1);
    }
    
    log('\n🎉 Database setup completed successfully!', colors.bold + colors.green);
    log('\nNext steps:', colors.blue);
    log('1. Start the server: npm start', colors.blue);
    log('2. Run tests: npm test', colors.blue);
    log('3. Check API documentation in docs/ folder', colors.blue);
    
  } catch (error) {
    log(`\n❌ Setup failed: ${error.message}`, colors.red);
    process.exit(1);
  }
}

// Run setup if called directly
if (require.main === module) {
  runSetup();
}

module.exports = { runSetup };