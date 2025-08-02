const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const JWTMiddleware = require('./jwt-middleware');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:3001';

// Initialize JWT middleware
const jwtMiddleware = new JWTMiddleware();

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(cookieParser());

// Initialize the app
async function initializeApp() {
  try {
    // Initialize JWT middleware
    await jwtMiddleware.initialize();
    console.log('✅ JWT middleware initialized');

    // Helper function to check auth via JWT
    const checkAuthJWT = (req) => {
      const token = req.cookies['auth-token'];
      
      if (!token) {
        return {
          authenticated: false,
          redirectTo: '/',
          page: 'login'
        };
      }

      const decoded = jwtMiddleware.verifyToken(token);
      if (!decoded) {
        return {
          authenticated: false,
          redirectTo: '/',
          page: 'login'
        };
      }

      return {
        authenticated: true,
        user: decoded
      };
    };
async function initializeApp() {
  try {
    // Initialize JWT middleware
    await jwtMiddleware.initialize();
    
    console.log('✅ JWT middleware initialized');

    // Routes
    app.get('/', (req, res) => {
      const authData = checkAuthJWT(req);
      
      if (!authData.authenticated) {
        // Serve login page with dynamic auth URL
        const baseUrl = process.env.BASE_URL || 'https://kl-pi.tail9f5728.ts.net';
        const loginHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Personal Project - Login</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500&display=swap" rel="stylesheet">
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
        }
        .login-container {
            background: white;
            padding: 2rem;
            border-radius: 10px;
            box-shadow: 0 15px 35px rgba(0, 0, 0, 0.1);
            text-align: center;
            max-width: 400px;
            width: 90%;
        }
        h1 {
            color: #333;
            margin-bottom: 1rem;
        }
        p {
            color: #666;
            margin-bottom: 2rem;
        }
        .google-btn {
            background: #fff;
            color: #757575;
            border: 1px solid #dadce0;
            padding: 0;
            border-radius: 4px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.3s;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 240px;
            height: 50px;
            font-family: 'Roboto', sans-serif;
            box-shadow: 0 2px 4px 0 rgba(0,0,0,.25);
        }
        .google-btn:hover {
            background: #f8f9fa;
            border-color: #dadce0;
            box-shadow: 0 4px 8px 0 rgba(0,0,0,.25);
        }
        .google-btn:focus {
            outline: none;
            box-shadow: 0 4px 8px 0 rgba(0,0,0,.25);
        }
        .google-icon {
            width: 18px;
            height: 18px;
            margin-right: 12px;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <h1>Welcome</h1>
        <p>Please sign in with your Google account to access the platform.</p>
        <a href="${baseUrl}/auth/google" class="google-btn">
            <svg class="google-icon" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign in with Google
        </a>
    </div>
</body>
</html>
        `;
        res.send(loginHtml);
      } else {
        // Redirect based on user status
        switch (authData.user.status) {
          case 'approved':
            res.redirect('/dashboard.html');
            break;
          case 'rejected':
            res.redirect('/rejected.html');
            break;
          default:
            res.redirect('/pending.html');
        }
      }
    });

    // Login route - redirect to root
    app.get('/login', (req, res) => {
      res.redirect('/');
    });

    app.get('/dashboard', (req, res) => {
      const authData = checkAuthJWT(req);
      
      if (!authData.authenticated || authData.user.status !== 'approved') {
        res.redirect('/');
        return;
      }
      res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
    });

    app.get('/pending', (req, res) => {
      const authData = checkAuthJWT(req);
      
      if (!authData.authenticated || authData.user.status !== 'unknown') {
        res.redirect('/');
        return;
      }
      res.sendFile(path.join(__dirname, 'public', 'pending.html'));
    });

    app.get('/rejected', (req, res) => {
      const authData = checkAuthJWT(req);
      
      if (!authData.authenticated || authData.user.status !== 'rejected') {
        res.redirect('/');
        return;
      }
      res.sendFile(path.join(__dirname, 'public', 'rejected.html'));
    });

    // API endpoint to get user info - now uses JWT directly
    app.get('/api/user', jwtMiddleware.optionalAuth, (req, res) => {
      if (req.user) {
        res.json({
          authenticated: true,
          user: {
            id: req.user.id,
            email: req.user.email,
            name: req.user.name,
            status: req.user.status,
            isAdmin: req.user.isAdmin,
            profilePicture: req.user.profilePicture
          }
        });
      } else {
        res.json({ authenticated: false });
      }
    });

    // Admin routes - now protected with JWT
    app.get('/admin', jwtMiddleware.authenticate, jwtMiddleware.requireAdmin, (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'admin.html'));
    });

    // API endpoint for logout
    app.post('/api/logout', (req, res) => {
      res.clearCookie('auth-token');
      res.clearCookie('refresh-token');
      res.json({ success: true, message: 'Logged out successfully' });
    });

    // Health check
    app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        service: 'landing-page'
      });
    });

    app.listen(PORT, () => {
      console.log(`🚀 Landing page running on port ${PORT}`);
      console.log(`🔐 JWT authentication enabled`);
    });

  } catch (error) {
    console.error('❌ Failed to initialize landing page:', error);
    process.exit(1);
  }
}

// Start the application
initializeApp();
