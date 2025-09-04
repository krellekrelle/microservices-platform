const jwt = require('jsonwebtoken');

const requireAuth = async (req, res, next) => {
    try {
        // Check for JWT token in cookies (using auth-token to match other services)
        const token = req.cookies['auth-token'];
        
        if (!token) {
            console.log('No auth-token found, redirecting to landing page');
            console.log('Available cookies:', Object.keys(req.cookies));
            return res.redirect(process.env.FRONTEND_URL || 'https://kl-pi.tail9f5728.ts.net');
        }

        console.log('Token found, verifying...');
        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('Token decoded successfully:', { id: decoded.id, email: decoded.email });
        
        // Check if user exists and is valid (JWT uses 'id' not 'userId')
        if (!decoded.id || !decoded.email) {
            console.log('Invalid token payload, redirecting to landing page');
            return res.redirect(process.env.FRONTEND_URL || 'https://kl-pi.tail9f5728.ts.net');
        }

        // Attach user data to request (using the correct field names from JWT)
        req.user = {
            id: decoded.id,
            email: decoded.email,
            name: decoded.name,
            status: decoded.status,
            isAdmin: decoded.isAdmin || false
        };

        console.log('User authenticated successfully:', req.user.email);
        next();
    } catch (error) {
        console.error('Auth middleware error:', error.message);
        return res.redirect(process.env.FRONTEND_URL || 'https://kl-pi.tail9f5728.ts.net');
    }
};

const requireApproved = (req, res, next) => {
    if (req.user.status !== 'approved') {
        console.log(`User ${req.user.email} not approved (status: ${req.user.status}), redirecting`);
        return res.redirect(process.env.FRONTEND_URL || 'https://kl-pi.tail9f5728.ts.net');
    }
    next();
};

// Socket.IO authentication middleware
const socketAuth = async (socket, next) => {
    try {
        const cookies = socket.handshake.headers.cookie;
        if (!cookies) {
            return next(new Error('No cookies found'));
        }

        // Parse cookies to get auth-token (matching other services)
        const cookieObj = {};
        cookies.split(';').forEach(cookie => {
            const [name, value] = cookie.trim().split('=');
            cookieObj[name] = value;
        });

        const token = cookieObj['auth-token'];
        if (!token) {
            return next(new Error('No auth-token found'));
        }

        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Check if user exists and is valid (JWT uses 'id' not 'userId')
        if (!decoded.id || !decoded.email || decoded.status !== 'approved') {
            return next(new Error('Invalid or unapproved user'));
        }

        // Attach user data to socket (using correct field names from JWT)
        socket.user = {
            id: decoded.id,
            email: decoded.email,
            name: decoded.name,
            status: decoded.status,
            isAdmin: decoded.isAdmin || false
        };

        next();
    } catch (error) {
        console.error('Socket auth error:', error.message);
        next(new Error('Authentication failed'));
    }
};

module.exports = {
    requireAuth,
    requireApproved,
    socketAuth
};
