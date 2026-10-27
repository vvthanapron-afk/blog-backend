// =============================================================================
// 文章相关路由
// 处理文章的增删改查（CRUD）操作
// =============================================================================

const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// ---------------------------------------------------------------------------
// GET /api/posts - 获取文章列表（公开接口，无需认证）
// 支持分页和状态筛选
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    // 获取分页参数，设置默认值
    const page = parseInt(req.query.page) || 1;          // 当前页码，默认第 1 页
    const limit = parseInt(req.query.limit) || 10;       // 每页数量，默认 10 条
    const offset = (page - 1) * limit;                   // 计算偏移量
    const status = req.query.status;                     // 状态筛选（可选）

    // 构建查询条件
    let query = `
      SELECT 
        p.id, p.title, p.summary, p.status, p.view_count,
        p.created_at, p.updated_at,
        a.username as author_name
      FROM posts p
      LEFT JOIN admins a ON p.author_id = a.id
    `;
    const params = [];

    // 如果有状态筛选，添加 WHERE 条件
    if (status) {
      query += ' WHERE p.status = $1';
      params.push(status);
    }

    // 按创建时间倒序排列，最新的在前面
    query += ' ORDER BY p.created_at DESC';

    // 添加分页限制
    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    // 执行查询
    const postsResult = await pool.query(query, params);

    // 查询总数（用于计算总页数）
    let countQuery = 'SELECT COUNT(*) FROM posts p';
    const countParams = [];
    if (status) {
      countQuery += ' WHERE p.status = $1';
      countParams.push(status);
    }
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      data: {
        posts: postsResult.rows,
        pagination: {
          total,                                    // 总文章数
          page,                                     // 当前页码
          limit,                                    // 每页数量
          totalPages: Math.ceil(total / limit)      // 总页数
        }
      }
    });

  } catch (error) {
    console.error('获取文章列表失败:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误'
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/posts/:id - 获取单篇文章详情（公开接口）
// 同时增加浏览次数
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const postId = req.params.id;

    // 查询文章详情，包括作者信息和标签
    const postResult = await pool.query(`
      SELECT 
        p.id, p.title, p.content, p.summary, p.status, p.view_count,
        p.created_at, p.updated_at,
        a.username as author_name
      FROM posts p
      LEFT JOIN admins a ON p.author_id = a.id
      WHERE p.id = $1
    `, [postId]);

    // 检查文章是否存在
    if (postResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '文章不存在'
      });
    }

    const post = postResult.rows[0];

    // 查询文章的标签
    const tagsResult = await pool.query(`
      SELECT t.id, t.name
      FROM tags t
      INNER JOIN post_tags pt ON t.id = pt.tag_id
      WHERE pt.post_id = $1
    `, [postId]);

    // 增加浏览次数
    await pool.query(
      'UPDATE posts SET view_count = view_count + 1 WHERE id = $1',
      [postId]
    );

    // 返回文章详情（包含标签）
    res.json({
      success: true,
      data: {
        ...post,
        tags: tagsResult.rows,
        view_count: post.view_count + 1  // 返回更新后的浏览次数
      }
    });

  } catch (error) {
    console.error('获取文章详情失败:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误'
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/posts - 创建新文章（需要认证）
// ---------------------------------------------------------------------------
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { title, content, summary, status, tags } = req.body;

    // 参数验证：标题和内容必填
    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: '标题和内容不能为空'
      });
    }

    // 插入文章到数据库
    const insertResult = await pool.query(`
      INSERT INTO posts (title, content, summary, author_id, status)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [title, content, summary || '', req.user.id, status || 'draft']);

    const newPost = insertResult.rows[0];

    // 如果提供了标签，处理标签关联
    if (tags && tags.length > 0) {
      for (const tagName of tags) {
        // 先插入或获取标签 ID
        const tagResult = await pool.query(`
          INSERT INTO tags (name) VALUES ($1)
          ON CONFLICT (name) DO UPDATE SET name = $1
          RETURNING id
        `, [tagName]);

        const tagId = tagResult.rows[0].id;

        // 建立文章和标签的关联
        await pool.query(`
          INSERT INTO post_tags (post_id, tag_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
        `, [newPost.id, tagId]);
      }
    }

    res.status(201).json({
      success: true,
      message: '文章创建成功',
      data: newPost
    });

  } catch (error) {
    console.error('创建文章失败:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误'
    });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/posts/:id - 更新文章（需要认证）
// ---------------------------------------------------------------------------
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const postId = req.params.id;
    const { title, content, summary, status, tags } = req.body;

    // 参数验证
    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: '标题和内容不能为空'
      });
    }

    // 检查文章是否存在
    const existingPost = await pool.query('SELECT * FROM posts WHERE id = $1', [postId]);
    if (existingPost.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '文章不存在'
      });
    }

    // 更新文章
    await pool.query(`
      UPDATE posts
      SET title = $1, content = $2, summary = $3, status = $4
      WHERE id = $5
    `, [title, content, summary || '', status || 'draft', postId]);

    // 更新标签：先删除旧标签，再添加新标签
    if (tags) {
      // 删除旧的标签关联
      await pool.query('DELETE FROM post_tags WHERE post_id = $1', [postId]);

      // 添加新的标签关联
      for (const tagName of tags) {
        const tagResult = await pool.query(`
          INSERT INTO tags (name) VALUES ($1)
          ON CONFLICT (name) DO UPDATE SET name = $1
          RETURNING id
        `, [tagName]);

        const tagId = tagResult.rows[0].id;
        await pool.query(`
          INSERT INTO post_tags (post_id, tag_id)
          VALUES ($1, $2)
        `, [postId, tagId]);
      }
    }

    // 查询更新后的文章
    const updatedPost = await pool.query('SELECT * FROM posts WHERE id = $1', [postId]);

    res.json({
      success: true,
      message: '文章更新成功',
      data: updatedPost.rows[0]
    });

  } catch (error) {
    console.error('更新文章失败:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误'
    });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/posts/:id - 删除文章（需要认证）
// ---------------------------------------------------------------------------
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const postId = req.params.id;

    // 检查文章是否存在
    const existingPost = await pool.query('SELECT * FROM posts WHERE id = $1', [postId]);
    if (existingPost.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '文章不存在'
      });
    }

    // 删除文章（关联的标签会自动删除，因为设置了 ON DELETE CASCADE）
    await pool.query('DELETE FROM posts WHERE id = $1', [postId]);

    res.json({
      success: true,
      message: '文章删除成功'
    });

  } catch (error) {
    console.error('删除文章失败:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误'
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/posts/tags/all - 获取所有标签
// ---------------------------------------------------------------------------
router.get('/tags/all', async (req, res) => {
  try {
    const tagsResult = await pool.query(`
      SELECT t.id, t.name, COUNT(pt.post_id) as post_count
      FROM tags t
      LEFT JOIN post_tags pt ON t.id = pt.tag_id
      GROUP BY t.id, t.name
      ORDER BY post_count DESC
    `);

    res.json({
      success: true,
      data: tagsResult.rows
    });

  } catch (error) {
    console.error('获取标签列表失败:', error);
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
