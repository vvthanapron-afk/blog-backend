// =============================================================================
// Database initialization script
// Hash the administrator password and update init.sql and the database
// =============================================================================

const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

async function setup() {
  try {
    console.log('🔧 Initializing the database...\n');

    // Default administrator password
    const defaultPassword = 'admin123';

    // Generate a bcrypt password hash
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(defaultPassword, salt);

    console.log(`✅ Password hash generated:`);
    console.log(`   Username: admin`);
    console.log(`   Password: ${defaultPassword}`);
    console.log(`   Hash: ${hashedPassword}\n`);

    // Read the init.sql template
    const initSqlPath = path.join(__dirname, '../../db/init.sql');
    let initSqlContent = fs.readFileSync(initSqlPath, 'utf8');

    // Replace the password hash placeholder, supporting multiple bcrypt formats
    initSqlContent = initSqlContent.replace(
      /\$2[ab]\$10\$[A-Za-z0-9./]{53}/g,
      hashedPassword
    );

    // Write the updated file
    fs.writeFileSync(initSqlPath, initSqlContent);

    console.log('✅ Updated db/init.sql file\n');

    // Connect to the database and update the administrator password
    console.log('🔍 Checking the database connection...');
    const pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER || 'blog_admin',
      password: process.env.DB_PASSWORD || 'blog_secret',
      database: process.env.DB_NAME || 'blog_db',
    });

    try {
      // Test the database connection
      await pool.query('SELECT NOW()');
      console.log('✅ Database connection successful\n');

      // Update the administrator password
      await pool.query(
        'UPDATE admins SET password = $1 WHERE username = $2',
        [hashedPassword, 'admin']
      );

      console.log('✅ Updated the admin password in the database\n');
    } catch (dbError) {
      console.log('⚠️  Database is unavailable or not initialized; skipping the database update');
      console.log('   (A new database volume will use the updated password hash when initialized)\n');
    } finally {
      await pool.end();
    }

    console.log('📝 Next steps: ');
    console.log('   1. Start the database: docker-compose up -d');
    console.log('   2. Start the backend: cd server && npm start');
    console.log('   3. Start the frontend: cd client && npm run dev\n');

    console.log('🔐 Default login details: ');
    console.log('   Username: admin');
    console.log('   Password: admin123\n');

  } catch (error) {
    console.error('❌ Initialization:', error.message);
    process.exit(1);
  }
}

setup();
