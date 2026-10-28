// =============================================================================
// Post routes
// Handle create, read, update, and delete (CRUD) operations for posts
// =============================================================================

const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// ---------------------------------------------------------------------------
// GET /api/posts - Get posts without authentication
// Support pagination and status filtering
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    // Read pagination parameters and apply defaults
    const page = parseInt(req.query.page) || 1;          // Current page; defaults to page 1
    const limit = parseInt(req.query.limit) || 10;       // Posts per page; defaults to 10
    const offset = (page - 1) * limit;                   // Calculate the pagination offset
    const status = req.query.status;                     // Optional status filter

    // Build the query
    let query = `
      SELECT 
        p.id, p.title, p.summary, p.status, p.view_count,
        p.created_at, p.updated_at,
        a.username as author_name
      FROM posts p
      LEFT JOIN admins a ON p.author_id = a.id
    `;
    const params = [];

    // Add a WHERE clause when a status filter is provided
    if (status) {
      query += ' WHERE p.status = $1';
      params.push(status);
    }

    // Sort by creation time, with the newest posts first
    query += ' ORDER BY p.created_at DESC';

    // Add pagination limits
    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    // Run the query
    const postsResult = await pool.query(query, params);

    // Count matching posts to calculate the number of pages
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
          total,                                    // Total number of posts
          page,                                     // Current page number
          limit,                                    // Number of posts per page
          totalPages: Math.ceil(total / limit)      // Total number of pages
        }
      }
    });

  } catch (error) {
    console.error('Failed to fetch posts:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/posts/:id - Get the details of one post without authentication
// Increment the view count when loading the post
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const postId = req.params.id;

    // Query the post details and author information
    const postResult = await pool.query(`
      SELECT 
        p.id, p.title, p.content, p.summary, p.status, p.view_count,
        p.created_at, p.updated_at,
        a.username as author_name
      FROM posts p
      LEFT JOIN admins a ON p.author_id = a.id
      WHERE p.id = $1
    `, [postId]);

    // Check whether the post exists
    if (postResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    const post = postResult.rows[0];

    // Query the post's tags
    const tagsResult = await pool.query(`
      SELECT t.id, t.name
      FROM tags t
      INNER JOIN post_tags pt ON t.id = pt.tag_id
      WHERE pt.post_id = $1
    `, [postId]);

    // Increment the view count
    await pool.query(
      'UPDATE posts SET view_count = view_count + 1 WHERE id = $1',
      [postId]
    );

    // Return the post details and tags
    res.json({
      success: true,
      data: {
        ...post,
        tags: tagsResult.rows,
        view_count: post.view_count + 1  // Return the updated view count
      }
    });

  } catch (error) {
    console.error('Failed to fetch post details:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/posts - Create a post; authentication required
// ---------------------------------------------------------------------------
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { title, content, summary, status, tags } = req.body;

    // Validate the required title and content
    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: 'Title and content are required'
      });
    }

    // Insert the post into the database
    const insertResult = await pool.query(`
      INSERT INTO posts (title, content, summary, author_id, status)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [title, content, summary || '', req.user.id, status || 'draft']);

    const newPost = insertResult.rows[0];

    // Create tag links when tags are provided
    if (tags && tags.length > 0) {
      for (const tagName of tags) {
        // Insert the tag or get its existing ID
        const tagResult = await pool.query(`
          INSERT INTO tags (name) VALUES ($1)
          ON CONFLICT (name) DO UPDATE SET name = $1
          RETURNING id
        `, [tagName]);

        const tagId = tagResult.rows[0].id;

        // Link the post to the tag
        await pool.query(`
          INSERT INTO post_tags (post_id, tag_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
        `, [newPost.id, tagId]);
      }
    }

    res.status(201).json({
      success: true,
      message: 'Post created successfully',
      data: newPost
    });

  } catch (error) {
    console.error('Failed to create post:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/posts/:id - Update a post; authentication required
// ---------------------------------------------------------------------------
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const postId = req.params.id;
    const { title, content, summary, status, tags } = req.body;

    // Validate the request body
    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: 'Title and content are required'
      });
    }

    // Check whether the post exists
    const existingPost = await pool.query('SELECT * FROM posts WHERE id = $1', [postId]);
    if (existingPost.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Update a post
    await pool.query(`
      UPDATE posts
      SET title = $1, content = $2, summary = $3, status = $4
      WHERE id = $5
    `, [title, content, summary || '', status || 'draft', postId]);

    // Replace the existing tag links with the submitted tags
    if (tags) {
      // Delete the old post-tag links
      await pool.query('DELETE FROM post_tags WHERE post_id = $1', [postId]);

      // Add the new post-tag links
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

    // Query the updated post
    const updatedPost = await pool.query('SELECT * FROM posts WHERE id = $1', [postId]);

    res.json({
      success: true,
      message: 'Post updated successfully',
      data: updatedPost.rows[0]
    });

  } catch (error) {
    console.error('Failed to update post:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/posts/:id - Delete a post; authentication required
// ---------------------------------------------------------------------------
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const postId = req.params.id;

    // Check whether the post exists
    const existingPost = await pool.query('SELECT * FROM posts WHERE id = $1', [postId]);
    if (existingPost.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Delete the post; ON DELETE CASCADE removes its post_tags links
    await pool.query('DELETE FROM posts WHERE id = $1', [postId]);

    res.json({
      success: true,
      message: 'Post deleted successfully'
    });

  } catch (error) {
    console.error('Failed to delete post:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/posts/tags/all - Get all tags
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
    console.error('Failed to fetch tags:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// ---------------------------------------------------------------------------
// Export the router
// ---------------------------------------------------------------------------
module.exports = router;
