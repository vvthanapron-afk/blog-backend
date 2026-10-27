// =============================================================================
// JWT 认证中间件
// 用于验证用户登录状态和保护需要认证的路由
// =============================================================================

const jwt = require('jsonwebtoken');
require('dotenv').config();

// ---------------------------------------------------------------------------
// JWT 认证中间件函数
// 从请求头中提取 token 并验证
// ---------------------------------------------------------------------------
function authenticateToken(req, res, next) {
  // 从 Authorization 头中提取 token
  // 格式：Bearer <token>
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // 提取 token 部分

  // 如果没有提供 token，返回 401 未授权
  if (!token) {
    return res.status(401).json({
      success: false,
      message: '未提供认证令牌，请先登录'
    });
  }

  // 验证 token 的有效性
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      // token 无效或已过期
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: '认证令牌已过期，请重新登录'
        });
      }
      return res.status(403).json({
        success: false,
        message: '无效的认证令牌'
      });
    }

    // token 验证成功，将用户信息附加到请求对象
    // 后续的路由处理器可以通过 req.user 访问用户信息
    req.user = user;
    next(); // 继续执行下一个中间件或路由处理器
  });
}

// ---------------------------------------------------------------------------
// 导出中间件函数
// ---------------------------------------------------------------------------
module.exports = {
  authenticateToken
};
