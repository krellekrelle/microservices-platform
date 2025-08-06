const jwt = require('jsonwebtoken');

class JWTMiddleware {
  constructor() {
    this.JWT_SECRET = process.env.JWT_SECRET || 'development-fallback-secret-please-configure-properly';
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
      // Redirect to main landing page instead of returning JSON error
      return res.redirect(process.env.FRONTEND_URL || '/');
    }
    const decoded = this.verifyToken(token);
    if (!decoded) {
      return res.redirect(process.env.FRONTEND_URL || '/');
    }
    req.user = decoded;
    next();
  };

  // Middleware function for requiring approved status
  requireApproved = (req, res, next) => {
    if (req.user?.status !== 'approved') {
      return res.redirect(process.env.FRONTEND_URL || '/');
    }
    next();
  };
}

module.exports = JWTMiddleware;
