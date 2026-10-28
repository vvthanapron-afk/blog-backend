// =============================================================================
// Authentication routes
// Handle administrator login, account information, and password changes
// =============================================================================

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
require('dotenv').config();

// ---------------------------------------------------------------------------
// POST /api/auth/login - Administrator login
// Verify the username and password, then return a JWT
// ---------------------------------------------------------------------------
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate that both username and password are provided
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }

    // Query the user information from the database
    // Use a parameterized query to prevent SQL injection
    const userResult = await pool.query(
      'SELECT id, username, password, email FROM admins WHERE username = $1',
      [username]
    );

    // Check whether the user exists
    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password'
      });
    }

    const user = userResult.rows[0];

    // Verify the password
    // Use bcrypt to compare the supplied password with the stored hash
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password'
      });
    }

    // Generate a JWT after password verification succeeds
    // Include the user ID and username; the default token lifetime is 24 hours
    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    // Return the successful login response
    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,                                    // The frontend stores this JWT and includes it in later requests
        user: {
          id: user.id,
          username: user.username,
          email: user.email
        }
      }
    });

  } catch (error) {
    console.error('Login failed:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error. Please try again later.'
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/auth/me - Get the current user's information
// Require a valid JWT
// ---------------------------------------------------------------------------
router.get('/me', async (req, res) => {
  try {
    // Extract and verify the token from the request headers
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Please log in first'
      });
    }

    // Verify the token and decode the user information
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Query the user's latest information from the database
    const userResult = await pool.query(
      'SELECT id, username, email, created_at FROM admins WHERE id = $1',
      [decoded.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: userResult.rows[0]
    });

  } catch (error) {
    console.error('Failed to fetch user information:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/change-password - Change password
// Authentication required
// ---------------------------------------------------------------------------
router.post('/change-password', async (req, res) => {
  try {
    // Verify the user's identity
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Please log in first'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { oldPassword, newPassword } = req.body;

    // Validate the request body
    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current and new passwords are required'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'The new password must be at least 6 characters long'
      });
    }

    // Query the user's current password hash
    const userResult = await pool.query(
      'SELECT password FROM admins WHERE id = $1',
      [decoded.id]
    );

    const user = userResult.rows[0];

    // Verify the current password
    const isValidOldPassword = await bcrypt.compare(oldPassword, user.password);
    if (!isValidOldPassword) {
      return res.status(400).json({
        success: false,
        message: 'The current password is incorrect'
      });
    }

    // Hash the new password and update the database
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await pool.query(
      'UPDATE admins SET password = $1 WHERE id = $2',
      [hashedPassword, decoded.id]
    );

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Failed to change password:', error);
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
