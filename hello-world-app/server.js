const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const JWTMiddleware = require('./jwt-middleware');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Initialize JWT middleware
const jwtMiddleware = new JWTMiddleware();

// DO NOT use express.static here - it bypasses authentication
// app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieParser());

// Initialize the app
async function initializeApp() {
  try {
    // Initialize JWT middleware
    await jwtMiddleware.initialize();
    
    console.log('✅ JWT middleware initialized');

    // Routes
    app.get('/', jwtMiddleware.authenticate, jwtMiddleware.requireApproved, (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    app.get('/api/message', jwtMiddleware.authenticate, jwtMiddleware.requireApproved, (req, res) => {
      const messages = [
        "Hello, World!",
        "Welcome to the Hello World application!",
        "This is running in its own container!",
        "Greetings from the microservice architecture!",
        "Hello from your Raspberry Pi project!"
      ];
      
      const randomMessage = messages[Math.floor(Math.random() * messages.length)];
      res.json({ 
        message: randomMessage,
        timestamp: new Date().toISOString(),
        service: 'hello-world-app',
        user: {
          name: req.user.name,
          email: req.user.email,
          status: req.user.status
        }
      });
    });

    // Health check endpoint (no auth required)
    app.get('/health', (req, res) => {
        res.json({ 
            status: 'healthy', 
            timestamp: new Date().toISOString(),
            service: 'hello-world-app'
        });
    });

    app.listen(PORT, () => {
      console.log(`🚀 Hello World app running on port ${PORT}`);
      console.log(`🔐 JWT authentication enabled`);
    });

  } catch (error) {
    console.error('❌ Failed to initialize Hello World app:', error);
    process.exit(1);
  }
}

// Start the application
initializeApp();
