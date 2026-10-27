// =============================================================================
// 认证相关路由
// 处理管理员登录、登出等认证操作
// =============================================================================

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
require('dotenv').config();

// ---------------------------------------------------------------------------
// POST /api/auth/login - 管理员登录
// 验证用户名和密码，成功则返回 JWT token
// ---------------------------------------------------------------------------
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // 参数验证：确保用户名和密码都已提供
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: '用户名和密码不能为空'
      });
    }

    // 从数据库中查询用户信息
    // 使用参数化查询防止 SQL 注入攻击
    const userResult = await pool.query(
      'SELECT id, username, password, email FROM admins WHERE username = $1',
      [username]
    );

    // 检查用户是否存在
    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: '用户名或密码错误'
      });
    }

    const user = userResult.rows[0];

    // 验证密码
    // 使用 bcrypt 比较用户输入的密码和数据库中存储的哈希值
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: '用户名或密码错误'
      });
    }

    // 密码验证成功，生成 JWT token
    // token 中包含用户 ID 和用户名，有效期为 24 小时
    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    // 返回登录成功响应
    res.json({
      success: true,
      message: '登录成功',
      data: {
        token,                                    // JWT token，前端需要保存并在后续请求中携带
        user: {
          id: user.id,
          username: user.username,
          email: user.email
        }
      }
    });

  } catch (error) {
    console.error('登录失败:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，请稍后重试'
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/auth/me - 获取当前登录用户信息
// 需要认证（携带有效的 JWT token）
// ---------------------------------------------------------------------------
router.get('/me', async (req, res) => {
  try {
    // 从请求头中提取并验证 token
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: '未登录'
      });
    }

    // 验证 token 并提取用户信息
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 从数据库中查询用户最新信息
    const userResult = await pool.query(
      'SELECT id, username, email, created_at FROM admins WHERE id = $1',
      [decoded.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    res.json({
      success: true,
      data: userResult.rows[0]
    });

  } catch (error) {
    console.error('获取用户信息失败:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误'
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/change-password - 修改密码
// 需要认证
// ---------------------------------------------------------------------------
router.post('/change-password', async (req, res) => {
  try {
    // 验证用户身份
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: '未登录'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { oldPassword, newPassword } = req.body;

    // 参数验证
    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: '旧密码和新密码不能为空'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: '新密码长度不能少于 6 位'
      });
    }

    // 查询用户当前密码
    const userResult = await pool.query(
      'SELECT password FROM admins WHERE id = $1',
      [decoded.id]
    );

    const user = userResult.rows[0];

    // 验证旧密码
    const isValidOldPassword = await bcrypt.compare(oldPassword, user.password);
    if (!isValidOldPassword) {
      return res.status(400).json({
        success: false,
        message: '旧密码错误'
      });
    }

    // 加密新密码并更新数据库
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await pool.query(
      'UPDATE admins SET password = $1 WHERE id = $2',
      [hashedPassword, decoded.id]
    );

    res.json({
      success: true,
      message: '密码修改成功'
    });

  } catch (error) {
    console.error('修改密码失败:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误'
    });
  }
});

// ---------------------------------------------------------------------------
// 导出路由
// ---------------------------------------------------------------------------
module.exports = router;
