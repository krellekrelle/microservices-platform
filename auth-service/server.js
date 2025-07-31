const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

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

// File paths for user management
const UNKNOWN_LOGINS_FILE = path.join(__dirname, 'data', 'unknown_logins.json');
const APPROVED_LOGINS_FILE = path.join(__dirname, 'data', 'approved_logins.json');
const REJECTED_LOGINS_FILE = path.join(__dirname, 'data', 'rejected_logins.json');

// Helper functions for user management
const readJsonFile = async (filePath) => {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
};

const writeJsonFile = async (filePath, data) => {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
};

// Initialize files if they don't exist
const initializeFile = async (filePath) => {
  try {
    await fs.access(filePath);
  } catch (error) {
    await writeJsonFile(filePath, []);
  }
};

// Initialize application
async function initializeApp() {
  try {
    // Get session secret
    const sessionSecret = await getSessionSecret();
    
    // Ensure data directory exists
    await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });

    // Initialize all user files
    await initializeFile(UNKNOWN_LOGINS_FILE);
    await initializeFile(APPROVED_LOGINS_FILE);
    await initializeFile(REJECTED_LOGINS_FILE);

    // Middleware
    app.use(cors({
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      credentials: true
    }));

    app.use(express.json());
    app.use(session({
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: false, // Set to true in production with HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      }
    }));

    app.use(passport.initialize());
    app.use(passport.session());

    // User status check function
    const checkUserStatus = async (email) => {
      const approved = await readJsonFile(APPROVED_LOGINS_FILE);
      const rejected = await readJsonFile(REJECTED_LOGINS_FILE);
      const unknown = await readJsonFile(UNKNOWN_LOGINS_FILE);

      if (approved.find(user => user.email === email)) {
        return 'approved';
      }
      
      if (rejected.find(user => user.email === email)) {
        return 'rejected';
      }

      // Add to unknown if not in any list
      if (!unknown.find(user => user.email === email)) {
        unknown.push({ email, timestamp: new Date().toISOString() });
        await writeJsonFile(UNKNOWN_LOGINS_FILE, unknown);
      }
      
      return 'unknown';
    };

    // Passport Google OAuth Strategy
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || "/auth/google/callback"
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        const user = {
          id: profile.id,
          email: profile.emails[0].value,
          name: profile.displayName,
          photo: profile.photos[0].value
        };

        // Check user status
        const userStatus = await checkUserStatus(user.email);
        user.status = userStatus;

        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    }));

    passport.serializeUser((user, done) => {
      done(null, user);
    });

    passport.deserializeUser((user, done) => {
      done(null, user);
    });

    // Routes
    app.get('/', (req, res) => {
      res.json({ 
        message: 'Authentication Service Running',
        status: 'OK',
        timestamp: new Date().toISOString()
      });
    });

    // Check authentication status
    app.get('/auth/status', async (req, res) => {
      if (req.isAuthenticated()) {
        // Re-check the user's current status from files
        const currentStatus = await checkUserStatus(req.user.email);
        
        // Update user object with fresh status
        req.user.status = currentStatus;
        
        res.json({ 
          authenticated: true, 
          user: req.user,
          status: currentStatus 
        });
      } else {
        res.json({ authenticated: false });
      }
    });

    // Comprehensive auth check endpoint - returns auth status and redirect suggestions
    app.get('/check-auth', async (req, res) => {
      if (req.isAuthenticated()) {
        // Re-check the user's current status from files
        const currentStatus = await checkUserStatus(req.user.email);
        
        // Update user object with fresh status
        req.user.status = currentStatus;
        
        // Determine appropriate page/redirect
        let redirectTo = '/';
        let page = 'login';
        
        if (currentStatus === 'approved') {
          redirectTo = '/dashboard';
          page = 'dashboard';
        } else if (currentStatus === 'rejected') {
          redirectTo = '/rejected';
          page = 'rejected';
        } else {
          redirectTo = '/pending';
          page = 'pending';
        }
        
        res.json({
          authenticated: true,
          user: req.user,
          status: currentStatus,
          redirectTo,
          page
        });
      } else {
        res.json({
          authenticated: false,
          redirectTo: '/',
          page: 'login'
        });
      }
    });

    // Start Google OAuth
    app.get('/auth/google', 
      passport.authenticate('google', { 
        scope: ['profile', 'email'],
        prompt: 'select_account' // Force account selection
      })
    );

    // Google OAuth callback
    app.get('/auth/google/callback',
      passport.authenticate('google', { failureRedirect: '/auth/failure' }),
      (req, res) => {
        const { status } = req.user;
        
        if (status === 'approved') {
          res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard`);
        } else if (status === 'rejected') {
          res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/rejected`);
        } else {
          res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/pending`);
        }
      }
    );

    // Logout
    app.post('/auth/logout', (req, res) => {
      req.logout((err) => {
        if (err) {
          return res.status(500).json({ error: 'Logout failed' });
        }
        // Clear session cookie
        res.clearCookie('connect.sid');
        res.json({ message: 'Logged out successfully' });
      });
    });

    // Convenient logout route
    app.post('/logout', (req, res) => {
      req.logout((err) => {
        if (err) {
          return res.status(500).json({ error: 'Logout failed' });
        }
        // Clear session cookie
        res.clearCookie('connect.sid');
        res.json({ message: 'Logged out successfully' });
      });
    });

    // Auth failure
    app.get('/auth/failure', (req, res) => {
      res.status(401).json({ error: 'Authentication failed' });
    });

    // Admin routes (for managing users)
    app.get('/admin/users', async (req, res) => {
      try {
        const [unknown, approved, rejected] = await Promise.all([
          readJsonFile(UNKNOWN_LOGINS_FILE),
          readJsonFile(APPROVED_LOGINS_FILE),
          readJsonFile(REJECTED_LOGINS_FILE)
        ]);
        res.json({ unknown, approved, rejected });
      } catch (error) {
        res.status(500).json({ error: 'Failed to read user files' });
      }
    });

    app.post('/admin/approve/:email', async (req, res) => {
      try {
        const email = decodeURIComponent(req.params.email);
        
        // Remove from unknown and rejected
        let unknown = await readJsonFile(UNKNOWN_LOGINS_FILE);
        let rejected = await readJsonFile(REJECTED_LOGINS_FILE);
        let approved = await readJsonFile(APPROVED_LOGINS_FILE);
        
        unknown = unknown.filter(user => user.email !== email);
        rejected = rejected.filter(user => user.email !== email);
        
        // Add to approved if not already there
        if (!approved.find(user => user.email === email)) {
          approved.push({ email, timestamp: new Date().toISOString() });
        }
        
        await Promise.all([
          writeJsonFile(UNKNOWN_LOGINS_FILE, unknown),
          writeJsonFile(REJECTED_LOGINS_FILE, rejected),
          writeJsonFile(APPROVED_LOGINS_FILE, approved)
        ]);
        
        res.json({ message: 'User approved successfully' });
      } catch (error) {
        res.status(500).json({ error: 'Failed to approve user' });
      }
    });

    app.post('/admin/reject/:email', async (req, res) => {
      try {
        const email = decodeURIComponent(req.params.email);
        
        // Remove from unknown and approved
        let unknown = await readJsonFile(UNKNOWN_LOGINS_FILE);
        let approved = await readJsonFile(APPROVED_LOGINS_FILE);
        let rejected = await readJsonFile(REJECTED_LOGINS_FILE);
        
        unknown = unknown.filter(user => user.email !== email);
        approved = approved.filter(user => user.email !== email);
        
        // Add to rejected if not already there
        if (!rejected.find(user => user.email === email)) {
          rejected.push({ email, timestamp: new Date().toISOString() });
        }
        
        await Promise.all([
          writeJsonFile(UNKNOWN_LOGINS_FILE, unknown),
          writeJsonFile(APPROVED_LOGINS_FILE, approved),
          writeJsonFile(REJECTED_LOGINS_FILE, rejected)
        ]);
        
        res.json({ message: 'User rejected successfully' });
      } catch (error) {
        res.status(500).json({ error: 'Failed to reject user' });
      }
    });

    // Start the server
    app.listen(PORT, () => {
      console.log(`🚀 Auth service running on http://localhost:${PORT}`);
      console.log('✅ Session secret configured');
      console.log('📁 Data files initialized');
      console.log('🔧 Google OAuth configured');
      console.log('');
      console.log('📝 Next steps:');
      console.log('1. Make sure Google OAuth credentials are set in .env');
      console.log('2. Test the service at http://localhost:3001');
      console.log('3. Start the landing page service on port 3000');
    });

  } catch (error) {
    console.error('❌ Failed to initialize app:', error);
    process.exit(1);
  }
}

// Start the application
initializeApp();
