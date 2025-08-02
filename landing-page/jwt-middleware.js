const jwt = require('jsonwebtoken');

class JWTMiddleware {
  constructor() {
    this.JWT_SECRET = null;
  }

  async initialize() {
    if (this.JWT_SECRET) return;
    
    // Try to get JWT secret from environment variable
    if (process.env.JWT_SECRET) {
      this.JWT_SECRET = process.env.JWT_SECRET;
      console.log('✅ Loaded JWT secret from environment variable');
      return;
    }
    
    // For development, try to get secret from auth service endpoint
    const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:3001';
    
    try {
      // Try to get the secret from the auth service health endpoint
      // In production, you should use a shared secret or key management service
      console.log('⚠️  No JWT_SECRET environment variable found. Using fallback method.');
      
      // Generate a temporary secret for development
      // In production, this should be properly configured
      this.JWT_SECRET = 'development-fallback-secret-please-configure-properly';
      console.log('🔧 Using development fallback secret. Please configure JWT_SECRET environment variable.');
      
    } catch (error) {
      console.error('❌ Failed to initialize JWT secret:', error.message);
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
