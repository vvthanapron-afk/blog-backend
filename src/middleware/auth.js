// =============================================================================
// JWT authentication middleware
// Verify authentication and protect routes that require a valid token
// =============================================================================

const jwt = require('jsonwebtoken');
require('dotenv').config();

// ---------------------------------------------------------------------------
// JWT authentication handler
// Extract and verify the token from the request headers
// ---------------------------------------------------------------------------
function authenticateToken(req, res, next) {
  // Read the token from the Authorization header
  // Format: Bearer <token>
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Extract the token value

  // Return 401 when no token is provided
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'No authentication token was provided. Please log in.'
    });
  }

  // Verify the token
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      // The token is invalid or expired
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Your session has expired. Please log in again.'
        });
      }
      return res.status(403).json({
        success: false,
        message: 'Invalid authentication token'
      });
    }

    // Attach the decoded user information to the request after verification
    // Route handlers can access the user information through req.user
    req.user = user;
    next(); // Continue to the next middleware or route handler
  });
}

// ---------------------------------------------------------------------------
// Export the middleware functions
// ---------------------------------------------------------------------------
module.exports = {
  authenticateToken
};
