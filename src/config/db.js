// =============================================================================
// Database connection configuration
// Use pg to connect to PostgreSQL
// =============================================================================

const { Pool } = require('pg');
require('dotenv').config();

// ---------------------------------------------------------------------------
// Create the database connection pool
// Reuse database connections through the pool
// ---------------------------------------------------------------------------
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',           // Database host
  port: parseInt(process.env.DB_PORT) || 5432,        // Database port
  user: process.env.DB_USER || 'blog_admin',          // Database username
  password: process.env.DB_PASSWORD || 'blog_secret', // Database password
  database: process.env.DB_NAME || 'blog_db',         // Database name
  max: 20,                                             // Maximum number of pooled connections
  idleTimeoutMillis: 30000,                            // Idle connection timeout (30 seconds)
  connectionTimeoutMillis: 2000,                       // Connection timeout (2 seconds)
});

// ---------------------------------------------------------------------------
// Test the database connection
// Check database availability when the application starts
// ---------------------------------------------------------------------------
async function testConnection() {
  try {
    const client = await pool.connect();
    console.log('✅ Database connection successful');
    client.release(); // Return the connection to the pool
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Export the pool and connection test function
// ---------------------------------------------------------------------------
module.exports = {
  pool,
  testConnection
};
