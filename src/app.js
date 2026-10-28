// =============================================================================
// Main entry point for the blog backend
// Configure Express and register routes
// =============================================================================

const express = require('express');
const cors = require('cors');
const path = require('path');
const { testConnection } = require('./config/db');
require('dotenv').config();

// Import route modules
const authRoutes = require('./routes/auth');
const postRoutes = require('./routes/posts');

// Create the Express application
const app = express();

// ---------------------------------------------------------------------------
// Middleware configuration
// ---------------------------------------------------------------------------

// CORS configuration
// Allow the Vue frontend to call the backend API
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',  
  credentials: true,                                           
  methods: ['GET', 'POST', 'PUT', 'DELETE'],                  
  allowedHeaders: ['Content-Type', 'Authorization']           
}));

// Parse JSON request bodies
// Limit request bodies to 10 MB
app.use(express.json({ limit: '10mb' }));

// Parse URL-encoded form data
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
// Log the method, URL, and timestamp for each request
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

// Public health check endpoint
// Report service status for monitoring
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Service is running normally',
    timestamp: new Date().toISOString()
  });
});

// Authentication routes
// Forward requests starting with /api/auth to authRoutes
app.use('/api/auth', authRoutes);

// Post routes
// Forward requests starting with /api/posts to postRoutes
app.use('/api/posts', postRoutes);

// ---------------------------------------------------------------------------
// Static file serving
// Serve the built frontend files
// ---------------------------------------------------------------------------
const clientDistPath = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDistPath));

// Return index.html for non-API routes to support Vue Router history mode
app.get('*', (req, res, next) => {
  // Pass API requests to the API not-found handler below
  if (req.path.startsWith('/api/')) {
    return next();
  }
  
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// ---------------------------------------------------------------------------
// 404 handler
// Return 404 when no endpoint matches the request
// ---------------------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found'
  });
});

// ---------------------------------------------------------------------------
// Global error-handling middleware
// Handle errors passed to Express error middleware
// ---------------------------------------------------------------------------
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message ||'Internal server error'
  });
});

// ---------------------------------------------------------------------------
// Start the server
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Test the database connection before starting
    await testConnection();

    // Start the HTTP server
    app.listen(PORT, () => {
      console.log('='.repeat(60));
      console.log('🚀 Blog backend server started');
      console.log(`📡 Server: http://localhost:${PORT}`);
      console.log(`🔗 Health Check: http://localhost:${PORT}/api/health`);
      console.log('='.repeat(60));
    });
  } catch (error) {
    console.error('Failed to start the server:', error);
    process.exit(1); // Exit the process if startup fails
  }
}

startServer();

// ---------------------------------------------------------------------------
// Shutdown handler
// Exit when SIGINT (Ctrl+C) is received
// ---------------------------------------------------------------------------
process.on('SIGINT', () => {
  console.log('\nShutting down the server...');
  process.exit(0);
});

