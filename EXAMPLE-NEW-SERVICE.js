// Example: Adding JWT Authentication to a New Microservice
// File: my-new-service/server.js

const express = require('express');
const cookieParser = require('cookie-parser');
const JWTMiddleware = require('../jwt-middleware');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3003;

// Initialize JWT middleware
const jwtMiddleware = new JWTMiddleware();

app.use(express.json());
app.use(cookieParser());

// Initialize the service
async function initializeService() {
  try {
    // Initialize JWT middleware (loads secret from auth service)
    await jwtMiddleware.initialize();
    console.log('✅ JWT middleware initialized');

    // Public routes (no authentication required)
    app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        service: 'my-new-service'
      });
    });

    // Routes requiring authentication
    app.get('/api/protected', jwtMiddleware.authenticate, (req, res) => {
      res.json({
        message: 'This is a protected route',
        user: {
          id: req.user.id,
          name: req.user.name,
          email: req.user.email
        }
      });
    });

    // Routes requiring approved users only
    app.get('/api/approved-only', 
      jwtMiddleware.authenticate, 
      jwtMiddleware.requireApproved, 
      (req, res) => {
        res.json({
          message: 'This route requires approved status',
          user: req.user
        });
      }
    );

    // Routes requiring admin privileges
    app.get('/api/admin-only', 
      jwtMiddleware.authenticate, 
      jwtMiddleware.requireAdmin, 
      (req, res) => {
        res.json({
          message: 'This route requires admin privileges',
          admin: req.user
        });
      }
    );

    // Routes with optional authentication
    app.get('/api/optional-auth', jwtMiddleware.optionalAuth, (req, res) => {
      if (req.user) {
        res.json({
          message: 'Hello authenticated user!',
          user: req.user
        });
      } else {
        res.json({
          message: 'Hello anonymous user!'
        });
      }
    });

    // Custom middleware example
    const requireSpecificUser = (req, res, next) => {
      if (req.user.email !== 'specific@example.com') {
        return res.status(403).json({ error: 'Access denied for this user' });
      }
      next();
    };

    app.get('/api/specific-user-only',
      jwtMiddleware.authenticate,
      requireSpecificUser,
      (req, res) => {
        res.json({ message: 'Access granted to specific user' });
      }
    );

    // Error handling middleware
    app.use((error, req, res, next) => {
      console.error('Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    });

    // 404 handler
    app.use((req, res) => {
      res.status(404).json({ error: 'Endpoint not found' });
    });

    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 My New Service running on port ${PORT}`);
      console.log(`🔐 JWT authentication enabled`);
    });

  } catch (error) {
    console.error('❌ Failed to initialize service:', error);
    process.exit(1);
  }
}

// Start the service
initializeService();

// Package.json dependencies needed:
/*
{
  "dependencies": {
    "express": "^4.18.2",
    "cookie-parser": "^1.4.6",
    "jsonwebtoken": "^9.0.2",
    "dotenv": "^16.3.1"
  }
}
*/

// Docker Compose service entry:
/*
  my-new-service:
    build: ./my-new-service
    environment:
      - PORT=3003
      - JWT_SECRET=your-jwt-secret-here  # or omit to use auth service secret
    volumes:
      - ./my-new-service:/app
    networks:
      - app-network
    depends_on:
      - auth-service
*/

// Caddy reverse proxy configuration:
/*
# Add to Caddyfile
/my-service/* {
    uri strip_prefix /my-service
    reverse_proxy my-new-service:3003
}
*/
