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
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
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
