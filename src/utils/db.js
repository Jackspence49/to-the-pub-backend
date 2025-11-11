const mysql = require('mysql2/promise');
const dbConfig = require('../../config/database');

// Create a singleton pool to be reused across the app
const pool = mysql.createPool({
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  password: dbConfig.password,
  database: dbConfig.database,
  waitForConnections: true,
  connectionLimit: dbConfig.connectionLimit || 10,
  charset: dbConfig.charset || 'utf8mb4'
});

// Add query method for convenience
pool.query = pool.execute;

module.exports = pool;
