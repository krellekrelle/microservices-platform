const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:3001';

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Helper function to call auth service
const checkAuthService = async (req) => {
  try {
    const response = await fetch(`${AUTH_SERVICE_URL}/check-auth`, {
      headers: {
        'Cookie': req.headers.cookie || ''
      }
    });
    return await response.json();
  } catch (error) {
    console.error('Auth service error:', error);
    return {
      authenticated: false,
      redirectTo: '/',
      page: 'login'
    };
  }
};

// Routes
app.get('/', async (req, res) => {
  const authData = await checkAuthService(req);
  
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
            background: #4285f4;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 5px;
            font-size: 16px;
            cursor: pointer;
            transition: background 0.3s;
            text-decoration: none;
            display: inline-block;
        }
        .google-btn:hover {
            background: #357ae8;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <h1>Welcome to Personal Project</h1>
        <p>Please sign in with your Google account to access the applications.</p>
        <a href="${baseUrl}/auth/google" class="google-btn">
            Sign in with Google
        </a>
    </div>
</body>
</html>`;
    console.log(`Using BASE_URL: ${baseUrl} for Google OAuth link`);
    res.send(loginHtml);
  } else if (authData.status === 'approved') {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
  } else if (authData.status === 'rejected') {
    res.sendFile(path.join(__dirname, 'public', 'rejected.html'));
  } else {
    res.sendFile(path.join(__dirname, 'public', 'pending.html'));
  }
});

// Login route - redirect to root
app.get('/login', (req, res) => {
  res.redirect('/');
});

app.get('/dashboard', async (req, res) => {
  const authData = await checkAuthService(req);
  
  if (!authData.authenticated || authData.status !== 'approved') {
    res.redirect('/');
    return;
  }
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/pending', async (req, res) => {
  const authData = await checkAuthService(req);
  
  if (!authData.authenticated || authData.status !== 'unknown') {
    res.redirect('/');
    return;
  }
  res.sendFile(path.join(__dirname, 'public', 'pending.html'));
});

app.get('/rejected', async (req, res) => {
  const authData = await checkAuthService(req);
  
  if (!authData.authenticated || authData.status !== 'rejected') {
    res.redirect('/');
    return;
  }
  res.sendFile(path.join(__dirname, 'public', 'rejected.html'));
});

// API endpoint to get user info - proxy to auth service
app.get('/api/user', async (req, res) => {
  const authData = await checkAuthService(req);
  
  if (authData.authenticated) {
    res.json(authData.user);
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

// Check status endpoint - get fresh status from auth service
app.get('/api/status', async (req, res) => {
  const authData = await checkAuthService(req);
  res.json(authData);
});

// Logout endpoint - proxy to auth service
app.post('/logout', async (req, res) => {
  try {
    const response = await fetch(`${AUTH_SERVICE_URL}/logout`, {
      method: 'POST',
      headers: {
        'Cookie': req.headers.cookie || ''
      }
    });
    
    // Clear any local session cookies
    res.clearCookie('connect.sid');
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Logout proxy error:', error);
    // Clear cookies even if auth service fails
    res.clearCookie('connect.sid');
    res.status(500).json({ error: 'Logout failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Landing page running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} to access the application`);
});
