const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const DatabaseService = require('./database');
require('dotenv').config();

// Initialize database service
const db = new DatabaseService();

// Generate or load JWT secret
async function getJWTSecret() {
  // If explicitly set in .env and not the default, use it
  if (process.env.JWT_SECRET && process.env.JWT_SECRET !== 'your-jwt-secret-here') {
    return process.env.JWT_SECRET;
  }
  
  const secretFile = path.join(__dirname, 'data', 'jwt.secret');
  
  try {
    // Try to load existing secret
    const existingSecret = await fs.readFile(secretFile, 'utf8');
    console.log('✅ Loaded existing JWT secret');
    return existingSecret.trim();
  } catch (error) {
    // Generate new secret if file doesn't exist
    const generatedSecret = crypto.randomBytes(64).toString('hex');
    
    // Ensure data directory exists
    await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });
    
    // Save the secret
    await fs.writeFile(secretFile, generatedSecret);
    
    console.log('� Generated and saved new JWT secret');
    console.log('💡 Secret saved to data/jwt.secret and will persist across restarts');
    
    return generatedSecret;
  }
}

const app = express();
const PORT = process.env.PORT || 3001;

// JWT utility functions
let JWT_SECRET;

const generateTokens = (user) => {
  const payload = {
    id: user.id,
    email: user.email,
    name: user.name,
    status: user.status,
    isAdmin: user.is_admin || false,
    profilePicture: user.profile_picture_url
  };

  const accessToken = jwt.sign(payload, JWT_SECRET, {
    expiresIn: '24h',
    issuer: 'microservices-platform',
    audience: 'platform-services'
  });

  const refreshToken = jwt.sign(
    { id: user.id, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET, {
      issuer: 'microservices-platform',
      audience: 'platform-services'
    });
  } catch (error) {
    return null;
  }
};

// JWT Middleware
const authenticateJWT = (req, res, next) => {
  const token = req.cookies['auth-token'];
  
  if (!token) {
    return res.status(401).json({ 
      authenticated: false, 
      error: 'No token provided' 
    });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    res.clearCookie('auth-token');
    res.clearCookie('refresh-token');
    return res.status(401).json({ 
      authenticated: false, 
      error: 'Invalid or expired token' 
    });
  }

  req.user = decoded;
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Initialize application
async function initializeApp() {
  try {
    // Test database connection
    const dbConnected = await db.testConnection();
    if (!dbConnected) {
      console.error('❌ Failed to connect to database');
      process.exit(1);
    }

    // Get JWT secret
    JWT_SECRET = await getJWTSecret();
    
    // Ensure data directory exists
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
    app.use(cookieParser());
    
    // Keep minimal session for OAuth state only
    app.use(session({
      secret: 'oauth-state-secret',
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: false,
        maxAge: 10 * 60 * 1000, // 10 minutes for OAuth flow only
        httpOnly: true,
        sameSite: 'lax'
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

    // Serialize user for OAuth session (temporary)
    passport.serializeUser((user, done) => {
      done(null, user.id);
    });

    // Deserialize user from OAuth session (temporary)
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

    // Google OAuth callback - now generates JWT tokens
    app.get('/google/callback',
      passport.authenticate('google', { failureRedirect: '/failure' }),
      (req, res) => {
        const user = req.user;
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        
        // Generate JWT tokens
        const { accessToken, refreshToken } = generateTokens(user);
        
        // Set JWT tokens as httpOnly cookies
        res.cookie('auth-token', accessToken, {
          httpOnly: true,
          secure: false, // Set to true in production with HTTPS
          sameSite: 'lax',
          maxAge: 24 * 60 * 60 * 1000, // 24 hours
          path: '/'
        });
        
        res.cookie('refresh-token', refreshToken, {
          httpOnly: true,
          secure: false,
          sameSite: 'lax',
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
          path: '/'
        });
        
        // Clear OAuth session (no longer needed)
        req.session.destroy();
        
        // Redirect based on user status
        switch (user.status) {
          case 'approved':
            res.redirect(`${frontendUrl}/dashboard`);
            break;
          case 'rejected':
            res.redirect(`${frontendUrl}/rejected`);
            break;
          default: // unknown
            res.redirect(`${frontendUrl}/pending`);
        }
      }
    );

    // Auth failure redirect
    app.get('/failure', (req, res) => {
      res.status(401).json({ error: 'Authentication failed' });
    });

    // Check authentication status (JWT-based)
    app.get('/check-auth', async (req, res) => {
      const token = req.cookies['auth-token'];
      
      if (!token) {
        return res.json({ authenticated: false });
      }

      const decoded = verifyToken(token);
      if (!decoded) {
        res.clearCookie('auth-token');
        res.clearCookie('refresh-token');
        return res.json({ authenticated: false });
      }

      // Get fresh user data from database to ensure status is current
      try {
        const user = await db.getUserById(decoded.id);
        const freshPayload = {
          id: user.id,
          email: user.email,
          name: user.name,
          status: user.status,
          isAdmin: user.is_admin,
          profilePicture: user.profile_picture_url
        };

        res.json({
          authenticated: true,
          user: freshPayload
        });
      } catch (error) {
        console.error('Error fetching fresh user data:', error);
        res.json({
          authenticated: true,
          user: {
            id: decoded.id,
            email: decoded.email,
            name: decoded.name,
            status: decoded.status,
            isAdmin: decoded.isAdmin,
            profilePicture: decoded.profilePicture
          }
        });
      }
    });

    // Logout (JWT-based)
    app.post('/logout', (req, res) => {
      res.clearCookie('auth-token');
      res.clearCookie('refresh-token');
      res.json({ message: 'Logged out successfully' });
    });

    // API endpoint to get current user info (JWT-based)
    app.get('/user', authenticateJWT, (req, res) => {
      res.json({
        authenticated: true,
        user: {
          id: req.user.id,
          email: req.user.email,
          name: req.user.name,
          photo: req.user.profilePicture,
          status: req.user.status,
          isAdmin: req.user.isAdmin
        }
      });
    });

    // JWT token refresh endpoint
    app.post('/refresh', (req, res) => {
      const refreshToken = req.cookies['refresh-token'];
      
      if (!refreshToken) {
        return res.status(401).json({ error: 'No refresh token provided' });
      }

      try {
        const decoded = jwt.verify(refreshToken, JWT_SECRET);
        
        if (decoded.type !== 'refresh') {
          return res.status(401).json({ error: 'Invalid refresh token' });
        }

        // Get fresh user data and generate new tokens
        db.getUserById(decoded.id).then(user => {
          const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);
          
          res.cookie('auth-token', accessToken, {
            httpOnly: true,
            secure: false,
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000,
            path: '/'
          });
          
          res.cookie('refresh-token', newRefreshToken, {
            httpOnly: true,
            secure: false,
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/'
          });
          
          res.json({ message: 'Tokens refreshed successfully' });
        }).catch(error => {
          console.error('Error refreshing tokens:', error);
          res.status(500).json({ error: 'Failed to refresh tokens' });
        });
        
      } catch (error) {
        res.clearCookie('refresh-token');
        res.status(401).json({ error: 'Invalid refresh token' });
      }
    });

    // Admin routes - now using JWT middleware

    // Get all users (admin only)
    app.get('/admin/users', authenticateJWT, requireAdmin, async (req, res) => {
      try {
        const users = await db.getAllUsers();
        res.json(users);
      } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
      }
    });

    // Get users by status (admin only)
    app.get('/admin/users/:status', authenticateJWT, requireAdmin, async (req, res) => {
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
    app.post('/admin/approve/:email', authenticateJWT, requireAdmin, async (req, res) => {
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
    app.post('/admin/reject/:email', authenticateJWT, requireAdmin, async (req, res) => {
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
    app.get('/admin/users/:id/history', authenticateJWT, requireAdmin, async (req, res) => {
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
    app.delete('/admin/users/:email', authenticateJWT, requireAdmin, async (req, res) => {
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
    app.post('/admin/promote/:email', authenticateJWT, requireAdmin, async (req, res) => {
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
    app.post('/admin/demote/:email', authenticateJWT, requireAdmin, async (req, res) => {
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
      console.log(`🔐 JWT-based authentication enabled`);
      console.log(`🔑 Admin user: klarsen1997@gmail.com`);
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
