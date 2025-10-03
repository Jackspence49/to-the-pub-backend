// MySQL database configuration
module.exports = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'Jackspence20!',
  database: process.env.DB_NAME || 'to_the_pub',
  connectionLimit: process.env.DB_CONNECTION_LIMIT || 10,
  charset: 'utf8mb4'
}; 