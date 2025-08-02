# JWT Authentication Migration Guide

## Overview

This migration converts your microservices platform from Express sessions to JWT (JSON Web Tokens) for authentication. This provides better scalability and security for microservices communication.

## Key Changes

### 1. Authentication Flow
- **Before**: Google OAuth → Express session → Cookie-based authentication
- **After**: Google OAuth → JWT token generation → Token-based authentication

### 2. Token Storage
- JWT tokens stored in httpOnly cookies for security
- Access token: 24-hour expiration
- Refresh token: 7-day expiration
- Automatic token refresh mechanism

### 3. Microservices Communication
- Each service can independently validate JWT tokens
- Shared JWT secret for token verification
- No dependency on central session store

## Implementation Details

### Auth Service Changes (`auth-service/server.js`)

#### New Dependencies
```json
{
  "jsonwebtoken": "^9.0.2",
  "cookie-parser": "^1.4.6"
}
```

#### JWT Utilities
- `generateTokens(user)`: Creates access and refresh tokens
- `verifyToken(token)`: Validates JWT tokens
- `authenticateJWT`: Middleware for protecting routes
- `requireAdmin`: Middleware for admin-only routes

#### Token Payload Structure
```javascript
{
  id: user.id,
  email: user.email,
  name: user.name,
  status: user.status,
  isAdmin: user.is_admin,
  profilePicture: user.profile_picture_url,
  iss: 'microservices-platform',
  aud: 'platform-services',
  exp: // 24 hours from now
}
```

#### Modified Endpoints
- `/google/callback`: Now generates JWT tokens instead of sessions
- `/check-auth`: Validates JWT from cookies
- `/logout`: Clears JWT cookies
- `/refresh`: Refreshes expired access tokens
- All `/admin/*` routes: Now use JWT middleware

### Hello World App Changes (`hello-world-app/server.js`)

#### New Dependencies
```json
{
  "jsonwebtoken": "^9.0.2",
  "cookie-parser": "^1.4.6"
}
```

#### JWT Middleware Integration
- Uses shared `jwt-middleware.js` for token validation
- Replaces HTTP calls to auth service with direct token verification
- Requires approved user status for access

### Landing Page Changes (`landing-page/server.js`)

#### Direct JWT Validation
- Eliminates HTTP calls to auth service for authentication
- Uses JWT middleware for protecting admin routes
- Maintains same user flow based on token payload

### Shared JWT Middleware (`jwt-middleware.js`)

A reusable module for JWT authentication across all services:

```javascript
const jwtMiddleware = new JWTMiddleware();
await jwtMiddleware.initialize();

app.use(jwtMiddleware.authenticate); // Require authentication
app.use(jwtMiddleware.requireAdmin);  // Require admin privileges
app.use(jwtMiddleware.requireApproved); // Require approved status
app.use(jwtMiddleware.optionalAuth);  // Optional authentication
```

## Security Improvements

### 1. HttpOnly Cookies
- Prevents XSS attacks by making tokens inaccessible to JavaScript
- Tokens automatically included in requests

### 2. Token Expiration
- Short-lived access tokens (24 hours)
- Longer refresh tokens (7 days)
- Automatic token refresh on API calls

### 3. Stateless Authentication
- No server-side session storage required
- Tokens contain all necessary user information
- Better scalability for microservices

## Environment Variables

Add to your `.env` file or Docker environment:

```bash
JWT_SECRET=your-very-secure-jwt-secret-key-here
```

If not provided, the auth service will generate and persist a secret automatically.

## Migration Steps

1. **Stop Current Services**
   ```bash
   docker-compose down
   ```

2. **Run Migration Script**
   ```bash
   ./migrate-to-jwt.sh
   ```

3. **Verify Services**
   ```bash
   docker-compose ps
   docker-compose logs -f auth-service
   ```

## API Changes

### Authentication Check
```javascript
// Before (session-based)
GET /auth/check-auth (requires session cookies)

// After (JWT-based)
GET /auth/check-auth (requires JWT in auth-token cookie)
```

### Logout
```javascript
// Before
POST /auth/logout (destroys session)

// After  
POST /auth/logout (clears JWT cookies)
POST /api/logout (local logout for frontend)
```

### Protected Routes
```javascript
// Before
if (req.isAuthenticated()) { ... }

// After
app.use(authenticateJWT);
// req.user contains JWT payload
```

## Frontend Changes

### New JWT Authentication Helper (`jwt-auth.js`)
```javascript
// Initialize authentication
const user = await window.jwtAuth.initializeUI();

// Make authenticated API calls
const response = await window.jwtAuth.apiCall('/api/data');

// Logout
await window.jwtAuth.logout();
```

### Updated Logout Calls
All frontend logout buttons now use `/api/logout` instead of `/auth/logout`.

## Troubleshooting

### Common Issues

1. **JWT Secret Not Found**
   - Ensure auth service runs first to generate the secret
   - Or set JWT_SECRET environment variable

2. **Token Validation Failures**
   - Check that all services use the same JWT secret
   - Verify cookie names match (`auth-token`, `refresh-token`)

3. **Redirect Loops**
   - Clear browser cookies if migrating from sessions
   - Check that Google OAuth callback URLs are correct

### Debug Commands
```bash
# Check service logs
docker-compose logs auth-service
docker-compose logs hello-world-app
docker-compose logs landing-page

# Verify JWT secret exists
docker-compose exec auth-service cat /app/data/jwt.secret

# Test endpoints
curl -c cookies.txt http://localhost/auth/google
curl -b cookies.txt http://localhost/auth/check-auth
```

## Benefits of JWT Migration

1. **Scalability**: No shared session storage required
2. **Security**: HttpOnly cookies prevent XSS attacks
3. **Performance**: Faster authentication (no database lookups)
4. **Flexibility**: Services can validate tokens independently
5. **Debugging**: Token payload contains all user information

## Rollback Plan

If you need to revert to sessions:

1. Restore original files:
   ```bash
   cp auth-service/server.js.backup auth-service/server.js
   cp landing-page/server-original.js landing-page/server.js
   ```

2. Rebuild and restart:
   ```bash
   docker-compose down
   docker-compose build --no-cache
   docker-compose up -d
   ```

## Next Steps

After successful migration:

1. Monitor authentication logs for any issues
2. Test all user flows (login, logout, admin functions)
3. Update any additional microservices to use JWT middleware
4. Consider implementing JWT token rotation for enhanced security
5. Set up monitoring for token expiration and refresh patterns
