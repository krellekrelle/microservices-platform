const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const DatabaseService = require('./database');
require('dotenv').config();

// Initialize database service
const db = new DatabaseService();

// Generate or load session secret
async function getSessionSecret() {
  // If explicitly set in .env and not the default, use it
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET !== 'your-secure-session-secret-here') {
    return process.env.SESSION_SECRET;
  }
  
  const secretFile = path.join(__dirname, 'data', 'session.secret');
  
  try {
    // Try to load existing secret
    const existingSecret = await fs.readFile(secretFile, 'utf8');
    console.log('✅ Loaded existing session secret');
    return existingSecret.trim();
  } catch (error) {
    // Generate new secret if file doesn't exist
    const generatedSecret = crypto.randomBytes(32).toString('hex');
    
    // Ensure data directory exists
    await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });
    
    // Save the secret
    await fs.writeFile(secretFile, generatedSecret);
    
    console.log('🔑 Generated and saved new session secret');
    console.log('💡 Secret saved to data/session.secret and will persist across restarts');
    
    return generatedSecret;
  }
}

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize application
async function initializeApp() {
  try {
    // Test database connection
    const dbConnected = await db.testConnection();
    if (!dbConnected) {
      console.error('❌ Failed to connect to database');
      process.exit(1);
    }

    // Get session secret
    const sessionSecret = await getSessionSecret();
    
    // Ensure data directory exists (for session.secret file)
    await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });

    // Middleware
    app.use(cors({
      origin: [
        process.env.FRONTEND_URL || 'http://localhost:3000',
        process.env.BASE_URL || 'http://localhost',
        'http://localhost',
        'https://kl-pi.tail9f5728.ts.net'
      ],
      credentials: true
    }));

    app.use(express.json());
    app.use(session({
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: false, // Set to true in production with HTTPS
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        path: '/', // Ensure cookies work across all paths
        httpOnly: true, // Security: prevent XSS access to cookies
        sameSite: 'lax' // Allow cookies to be sent with cross-site requests
      }
    }));

    app.use(passport.initialize());
    app.use(passport.session());

    // Passport Google OAuth Strategy
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || "/auth/google/callback"
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        // Create or update user in database
        const user = await db.createOrUpdateUser(profile);
        return done(null, user);
      } catch (error) {
        console.error('Error in Google OAuth callback:', error);
        return done(error, null);
      }
    }));

    // Serialize user for session
    passport.serializeUser((user, done) => {
      done(null, user.id);
    });

    // Deserialize user from session
    passport.deserializeUser(async (id, done) => {
      try {
        const user = await db.getUserById(id);
        done(null, user);
      } catch (error) {
        done(error, null);
      }
    });

    console.log('📍 Registering routes...');

    // Health check
    app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        database: 'connected'
      });
    });

    // Start Google OAuth
    app.get('/google', passport.authenticate('google', {
      scope: ['profile', 'email'],
      prompt: 'select_account' // Force account selection
    }));

    // Google OAuth callback
    app.get('/google/callback',
      passport.authenticate('google', { failureRedirect: '/failure' }),
      (req, res) => {
        const user = req.user;
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        
        // Redirect based on user status
        switch (user.status) {
          case 'approved':
            res.redirect(`${frontendUrl}/dashboard.html`);
            break;
          case 'rejected':
            res.redirect(`${frontendUrl}/rejected.html`);
            break;
          default: // unknown
            res.redirect(`${frontendUrl}/pending.html`);
        }
      }
    );

    // Auth failure redirect
    app.get('/failure', (req, res) => {
      res.status(401).json({ error: 'Authentication failed' });
    });

    // Check authentication status
    app.get('/check-auth', async (req, res) => {
      if (req.isAuthenticated()) {
        // Get fresh user data from database
        const user = await db.getUserById(req.user.id);
        res.json({
          authenticated: true,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            status: user.status,
            isAdmin: user.is_admin,
            profilePicture: user.profile_picture_url
          }
        });
      } else {
        res.json({ authenticated: false });
      }
    });

    // Logout
    app.post('/logout', (req, res) => {
      req.logout((err) => {
        if (err) {
          return res.status(500).json({ error: 'Logout failed' });
        }
        req.session.destroy((err) => {
          if (err) {
            return res.status(500).json({ error: 'Session destruction failed' });
          }
          res.clearCookie('connect.sid');
          res.json({ message: 'Logged out successfully' });
        });
      });
    });

    // API endpoint to get current user info
    app.get('/user', (req, res) => {
      if (req.isAuthenticated()) {
        res.json({
          authenticated: true,
          user: {
            id: req.user.id,
            email: req.user.email,
            name: req.user.name,
            photo: req.user.photo,
            status: req.user.status,
            isAdmin: req.user.is_admin || false
          }
        });
      } else {
        res.json({
          authenticated: false,
          user: null
        });
      }
    });

    // Admin routes

    // Get all users (admin only)
    app.get('/admin/users', requireAdmin, async (req, res) => {
      try {
        const users = await db.getAllUsers();
        res.json(users);
      } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
      }
    });

    // Get users by status (admin only)
    app.get('/admin/users/:status', requireAdmin, async (req, res) => {
      try {
        const { status } = req.params;
        if (!['unknown', 'approved', 'rejected'].includes(status)) {
          return res.status(400).json({ error: 'Invalid status' });
        }
        
        const users = await db.getUsersByStatus(status);
        res.json(users);
      } catch (error) {
        console.error('Error fetching users by status:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
      }
    });

    // Approve user (admin only)
    app.post('/admin/approve/:email', requireAdmin, async (req, res) => {
      try {
        const { email } = req.params;
        const adminId = req.user.id;
        
        const user = await db.approveUser(email, adminId);
        res.json({ 
          message: 'User approved successfully', 
          user: {
            email: user.email,
            name: user.name,
            status: user.status
          }
        });
      } catch (error) {
        console.error('Error approving user:', error);
        if (error.message === 'User not found') {
          res.status(404).json({ error: 'User not found' });
        } else {
          res.status(500).json({ error: 'Failed to approve user' });
        }
      }
    });

    // Reject user (admin only)
    app.post('/admin/reject/:email', requireAdmin, async (req, res) => {
      try {
        const { email } = req.params;
        const adminId = req.user.id;
        
        const user = await db.rejectUser(email, adminId);
        res.json({ 
          message: 'User rejected successfully', 
          user: {
            email: user.email,
            name: user.name,
            status: user.status
          }
        });
      } catch (error) {
        console.error('Error rejecting user:', error);
        if (error.message === 'User not found') {
          res.status(404).json({ error: 'User not found' });
        } else {
          res.status(500).json({ error: 'Failed to reject user' });
        }
      }
    });

    // Get user status history (admin only)
    app.get('/admin/users/:id/history', requireAdmin, async (req, res) => {
      try {
        const { id } = req.params;
        const history = await db.getUserStatusHistory(id);
        res.json(history);
      } catch (error) {
        console.error('Error fetching user history:', error);
        res.status(500).json({ error: 'Failed to fetch user history' });
      }
    });

    // Delete user (admin only)
    app.delete('/admin/users/:email', requireAdmin, async (req, res) => {
      try {
        const { email } = req.params;
        const adminId = req.user.id;
        
        // Don't allow admins to delete themselves
        if (email === req.user.email) {
          return res.status(400).json({ error: 'Cannot delete your own account' });
        }
        
        const user = await db.deleteUser(email, adminId);
        res.json({ 
          message: 'User deleted successfully', 
          user: {
            email: user.email,
            name: user.name
          }
        });
      } catch (error) {
        console.error('Error deleting user:', error);
        if (error.message === 'User not found') {
          res.status(404).json({ error: 'User not found' });
        } else {
          res.status(500).json({ error: 'Failed to delete user' });
        }
      }
    });

    // Promote user to admin (admin only)
    app.post('/admin/promote/:email', requireAdmin, async (req, res) => {
      try {
        const { email } = req.params;
        const adminId = req.user.id;
        
        const user = await db.promoteToAdmin(email, adminId);
        res.json({ 
          message: 'User promoted to admin successfully', 
          user: {
            email: user.email,
            name: user.name,
            isAdmin: user.is_admin
          }
        });
      } catch (error) {
        console.error('Error promoting user:', error);
        if (error.message === 'User not found') {
          res.status(404).json({ error: 'User not found' });
        } else {
          res.status(500).json({ error: 'Failed to promote user' });
        }
      }
    });

    // Demote admin to user (admin only)
    app.post('/admin/demote/:email', requireAdmin, async (req, res) => {
      try {
        const { email } = req.params;
        const adminId = req.user.id;
        
        // Don't allow admins to demote themselves
        if (email === req.user.email) {
          return res.status(400).json({ error: 'Cannot demote your own account' });
        }
        
        const user = await db.demoteFromAdmin(email, adminId);
        res.json({ 
          message: 'Admin demoted to user successfully', 
          user: {
            email: user.email,
            name: user.name,
            isAdmin: user.is_admin
          }
        });
      } catch (error) {
        console.error('Error demoting user:', error);
        if (error.message === 'User not found') {
          res.status(404).json({ error: 'User not found' });
        } else {
          res.status(500).json({ error: 'Failed to demote user' });
        }
      }
    });

    // Middleware functions
    function requireAdmin(req, res, next) {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      if (!req.user.is_admin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      
      next();
    }

    console.log('✅ Routes registered successfully');

    // Error handling middleware
    app.use((error, req, res, next) => {
      console.error('Unhandled error:', error);
      res.status(500).json({ error: 'Internal server error' });
    });

    // 404 handler
    app.use((req, res) => {
      res.status(404).json({ error: 'Endpoint not found' });
    });

    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 Auth service running on port ${PORT}`);
      console.log(`📊 Database: Connected to PostgreSQL`);
      console.log(`🔐 Admin user: klarsen1997@gmail.com`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });

  } catch (error) {
    console.error('❌ Failed to initialize app:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  await db.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  await db.close();
  process.exit(0);
});

// Initialize and start the application
initializeApp().catch((error) => {
  console.error('❌ Application initialization failed:', error);
  process.exit(1);
});
