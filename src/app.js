// =============================================================================
// 博客系统后端主入口文件
// Express 应用配置和路由注册
// =============================================================================

const express = require('express');
const cors = require('cors');
const path = require('path');
const { testConnection } = require('./config/db');
require('dotenv').config();

// 导入路由模块
const authRoutes = require('./routes/auth');
const postRoutes = require('./routes/posts');

// 创建 Express 应用实例
const app = express();

// ---------------------------------------------------------------------------
// 中间件配置
// ---------------------------------------------------------------------------

// CORS 跨域配置
// 允许前端（Vue）访问后端 API
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',  // 前端地址
  credentials: true,                                           // 允许携带认证信息
  methods: ['GET', 'POST', 'PUT', 'DELETE'],                  // 允许的 HTTP 方法
  allowedHeaders: ['Content-Type', 'Authorization']           // 允许的头信息
}));

// 解析 JSON 格式的请求体
// 限制请求体大小为 10MB，防止大文件攻击
app.use(express.json({ limit: '10mb' }));

// 解析 URL 编码格式的请求体（表单提交）
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 请求日志中间件
// 在控制台打印每个请求的方法、URL 和时间戳
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ---------------------------------------------------------------------------
// 路由注册
// ---------------------------------------------------------------------------

// 健康检查接口（无需认证）
// 用于监控和负载均衡器检测服务状态
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Service is running normally',
    timestamp: new Date().toISOString()
  });
});

// 认证相关路由
// 所有以 /api/auth 开头的请求都会路由到 authRoutes
app.use('/api/auth', authRoutes);

// 文章相关路由
// 所有以 /api/posts 开头的请求都会路由到 postRoutes
app.use('/api/posts', postRoutes);

// ---------------------------------------------------------------------------
// 静态文件服务
// 提供前端构建后的静态文件
// ---------------------------------------------------------------------------
const clientDistPath = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDistPath));

// 对于所有非 API 路由，返回 index.html（支持 Vue Router 的 history 模式）
app.get('*', (req, res, next) => {
  // 如果是 API 请求，跳过，交给后面的 404 处理
  if (req.path.startsWith('/api/')) {
    return next();
  }
  
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// ---------------------------------------------------------------------------
// 404 处理
// 当请求的路由不存在时，返回 404 错误
// ---------------------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found'
  });
});

// ---------------------------------------------------------------------------
// 全局错误处理中间件
// 捕获所有未处理的错误，防止应用崩溃
// ---------------------------------------------------------------------------
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message ||'Internal server eeror'
  });
});

// ---------------------------------------------------------------------------
// 启动服务器
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // 先测试数据库连接
    await testConnection();

    // 启动 HTTP 服务器
    app.listen(PORT, () => {
      console.log('='.repeat(60));
      console.log('🚀 blog backend server started');
      console.log(`📡 Server: http://localhost:${PORT}`);
      console.log(`🔗 Health Check: http://localhost:${PORT}/api/health`);
      console.log('='.repeat(60));
    });
  } catch (error) {
    console.error('Failed to start the server:', error);
    process.exit(1); // 启动失败，退出进程
  }
}

startServer();

// ---------------------------------------------------------------------------
// 优雅关闭
// 当接收到 SIGINT 信号（Ctrl+C）时，先关闭服务器再退出
// ---------------------------------------------------------------------------
process.on('SIGINT', () => {
  console.log('\nShutting down the server...');
  process.exit(0);
});

