// =============================================================================
// 数据库初始化脚本
// 生成管理员密码的 bcrypt 哈希值并更新 init.sql 和数据库
// =============================================================================

const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

async function setup() {
  try {
    console.log('🔧 Initializing the database...\n');

    // 默认管理员密码
    const defaultPassword = 'admin123';

    // 生成 bcrypt 哈希
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(defaultPassword, salt);

    console.log(`✅ Password hash generated:`);
    console.log(`   Username: admin`);
    console.log(`   Password: ${defaultPassword}`);
    console.log(`   Hash: ${hashedPassword}\n`);

    // 读取 init.sql 模板文件
    const initSqlPath = path.join(__dirname, '../../db/init.sql');
    let initSqlContent = fs.readFileSync(initSqlPath, 'utf8');

    // 替换密码占位符（支持多种格式的哈希值）
    initSqlContent = initSqlContent.replace(
      /\$2[ab]\$10\$[A-Za-z0-9./]{53}/g,
      hashedPassword
    );

    // 写回文件
    fs.writeFileSync(initSqlPath, initSqlContent);

    console.log('✅ Updated db/init.sql 文件\n');

    // 尝试连接数据库并更新管理员密码
    console.log('🔍 Checking the database connection...');
    const pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER || 'blog_admin',
      password: process.env.DB_PASSWORD || 'blog_secret',
      database: process.env.DB_NAME || 'blog_db',
    });

    try {
      // 测试连接
      await pool.query('SELECT NOW()');
      console.log('✅ Database connection successful\n');

      // 更新管理员密码
      await pool.query(
        'UPDATE admins SET password = $1 WHERE username = $2',
        [hashedPassword, 'admin']
      );

      console.log('✅ Updated the admin password in the database\n');
    } catch (dbError) {
      console.log('⚠️  Database is unavailable or not initialized; skipping the database update');
      console.log('   （A new database volum will use the updated password hash when initialized）\n');
    } finally {
      await pool.end();
    }

    console.log('📝 Next steps：');
    console.log('   1. Start the database: docker-compose up -d');
    console.log('   2. Start the backend: cd server && npm start');
    console.log('   3. Start the frontend: cd client && npm run dev\n');

    console.log('🔐 Default login details：');
    console.log('   Username: admin');
    console.log('   Password: admin123\n');

  } catch (error) {
    console.error('❌ Initialization:', error.message);
    process.exit(1);
  }
}

setup();
