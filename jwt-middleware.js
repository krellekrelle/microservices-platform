const jwt = require('jsonwebtoken');
const fs = require('fs').promises;
const path = require('path');

class JWTMiddleware {
  constructor() {
    this.JWT_SECRET = null;
  }

  async initialize() {
    if (this.JWT_SECRET) return;
    
    // Try to get JWT secret from environment or file
    if (process.env.JWT_SECRET && process.env.JWT_SECRET !== 'your-jwt-secret-here') {
      this.JWT_SECRET = process.env.JWT_SECRET;
      return;
    }
    
    // Try to load from auth service secret file
    const secretFile = path.join(__dirname, '..', 'auth-service', 'data', 'jwt.secret');
    
    try {
      const secret = await fs.readFile(secretFile, 'utf8');
      this.JWT_SECRET = secret.trim();
      console.log('✅ Loaded JWT secret from auth service');
    } catch (error) {
      console.error('❌ Failed to load JWT secret. Make sure auth service is running first.');
      throw new Error('JWT secret not available');
    }
  }

  verifyToken(token) {
    try {
      return jwt.verify(token, this.JWT_SECRET, {
        issuer: 'microservices-platform',
        audience: 'platform-services'
      });
    } catch (error) {
      return null;
    }
  }

  // Middleware function for authentication
  authenticate = (req, res, next) => {
    const token = req.cookies ? req.cookies['auth-token'] : null;
    
    if (!token) {
      return res.status(401).json({ 
        authenticated: false, 
        error: 'No token provided' 
      });
    }

    const decoded = this.verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ 
        authenticated: false, 
        error: 'Invalid or expired token' 
      });
    }

    req.user = decoded;
    next();
  };

  // Middleware function for requiring admin privileges
  requireAdmin = (req, res, next) => {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  };

  // Middleware function for requiring approved status
  requireApproved = (req, res, next) => {
    if (req.user?.status !== 'approved') {
      return res.status(403).json({ error: 'Approved user status required' });
    }
    next();
  };

  // Check authentication without requiring it (for optional auth)
  optionalAuth = (req, res, next) => {
    const token = req.cookies ? req.cookies['auth-token'] : null;
    
    if (token) {
      const decoded = this.verifyToken(token);
      if (decoded) {
        req.user = decoded;
      }
    }
    
    next();
  };
}

module.exports = JWTMiddleware;
