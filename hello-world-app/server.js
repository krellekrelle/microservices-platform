const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:3001';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

app.use(express.static(path.join(__dirname, 'public')));

// Authentication middleware
const checkAuth = async (req, res, next) => {
    try {
        console.log('🔍 Checking authentication for:', req.url);
        console.log('🍪 Cookies:', req.headers.cookie);
        
        const authResponse = await fetch(`${AUTH_SERVICE_URL}/check-auth`, {
            method: 'GET',
            headers: {
                'Cookie': req.headers.cookie || ''
            }
        });
        
        const authData = await authResponse.json();
        console.log('🔐 Auth response:', authData);
        
        if (!authData.authenticated || authData.status !== 'approved') {
            console.log('❌ Authentication failed, redirecting to:', FRONTEND_URL);
            return res.redirect(FRONTEND_URL);
        }
        
        console.log('✅ Authentication successful for:', authData.user?.name);
        req.user = authData.user;
        next();
    } catch (error) {
        console.error('🚨 Auth check failed:', error);
        res.redirect(FRONTEND_URL);
    }
};

app.get('/', checkAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/message', checkAuth, (req, res) => {
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
    user: req.user
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
  console.log(`Hello World app running on port ${PORT}`);
});
