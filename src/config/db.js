// =============================================================================
// 数据库连接配置模块
// 使用 pg 库连接 PostgreSQL 数据库
// =============================================================================

const { Pool } = require('pg');
require('dotenv').config();

// ---------------------------------------------------------------------------
// 创建数据库连接池
// 连接池可以复用数据库连接，提高性能
// ---------------------------------------------------------------------------
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',           // 数据库主机地址
  port: parseInt(process.env.DB_PORT) || 5432,        // 数据库端口
  user: process.env.DB_USER || 'blog_admin',          // 数据库用户名
  password: process.env.DB_PASSWORD || 'blog_secret', // 数据库密码
  database: process.env.DB_NAME || 'blog_db',         // 数据库名称
  max: 20,                                             // 连接池最大连接数
  idleTimeoutMillis: 30000,                            // 空闲连接超时时间（30秒）
  connectionTimeoutMillis: 2000,                       // 连接超时时间（2秒）
});

// ---------------------------------------------------------------------------
// 测试数据库连接
// 在应用启动时验证数据库是否可用
// ---------------------------------------------------------------------------
async function testConnection() {
  try {
    const client = await pool.connect();
    console.log('✅ 数据库连接成功');
    client.release(); // 释放连接回连接池
  } catch (error) {
    console.error('❌ 数据库连接失败:', error.message);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// 导出连接池和测试函数
// ---------------------------------------------------------------------------
module.exports = {
  pool,
  testConnection
};
