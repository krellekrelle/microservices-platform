# Auth Service - Development Guide

## 🎯 Service Overview

**Purpose**: Centralized authentication and user management service  
**Port**: 3001 (internal Docker network)  
**Role**: Core authentication provider for entire platform  
**Dependencies**: Google OAuth 2.0, file system for data persistence  
**Production Access**: Via Caddy reverse proxy at `https://kl-pi.tail9f5728.ts.net/auth/*`  

## 🏗️ Architecture Role

The auth-service is the **heart** of the platform's security model:
- **Single source of truth** for user authentication states
- **OAuth provider** handling Google authentication flow
- **Session manager** with auto-generated secrets
- **User state manager** with file-based persistence
- **Admin API** for user approval workflows

## 📁 File Structure

```
auth-service/
├── server.js              # Main application logic
├── package.json           # Dependencies and scripts
├── Dockerfile            # Container configuration
└── data/                 # Persistent data directory
    ├── approved_logins.json
    ├── rejected_logins.json
    ├── unknown_logins.json
    ├── session.secret
    └── .gitkeep          # Ensures directory exists in git
```

## 🔧 Core Functionality

### 1. Google OAuth Integration
```javascript
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
}, async (accessToken, refreshToken, profile, done) => {
    // User profile processing logic
}));
```

**Key Features**:
- Forced account selection (`prompt: 'select_account'`)
- Profile data extraction (email, name, picture)
- Automatic user categorization (unknown/approved/rejected)

### 2. Session Management
```javascript
// Auto-generated session secret
const sessionSecret = generateSessionSecret();
app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));
```

**Key Features**:
- 256-byte cryptographically secure session secrets
- File persistence survives container restarts
- 24-hour session expiration
- Automatic secret generation on first run

### 3. User State Management
```javascript
// Three-tier user system
const userStates = {
    approved: loadJSON('approved_logins.json'),
    rejected: loadJSON('rejected_logins.json'),
    unknown: loadJSON('unknown_logins.json')
};
```

**State Transitions**:
- New user → `unknown` (automatic)
- Admin approval → `approved` (manual via API)
- Admin rejection → `rejected` (manual via API)

### 4. Centralized Auth Endpoint
```javascript
app.get('/check-auth', (req, res) => {
    if (!req.isAuthenticated()) {
        return res.json({ authenticated: false });
    }
    
    const userStatus = getUserStatus(req.user.email);
    res.json({
        authenticated: true,
        user: req.user,
        userStatus: userStatus
    });
});
```

**Critical Endpoint**: All other services depend on this for auth decisions

## 🔗 API Endpoints

### Authentication Endpoints
| Method | Endpoint | Purpose | Parameters |
|--------|----------|---------|------------|
| GET | `/auth/google` | Initiate OAuth flow | `prompt=select_account` |
| GET | `/auth/google/callback` | OAuth callback | Google auth code |
| GET | `/check-auth` | Check auth status | None |
| POST | `/logout` | Clear session | None |

### Admin Management Endpoints
| Method | Endpoint | Purpose | Parameters |
|--------|----------|---------|------------|
| GET | `/admin/users` | List all users | None |
| POST | `/admin/approve/:email` | Approve user | Email in URL |
| POST | `/admin/reject/:email` | Reject user | Email in URL |

## 💾 Data Persistence

### JSON File Structure
```json
// approved_logins.json
[
    "user1@example.com",
    "user2@example.com"
]

// rejected_logins.json
[
    "blocked@example.com"
]

// unknown_logins.json
[
    "pending@example.com"
]
```

### Session Secret File
```
// session.secret (auto-generated)
a1b2c3d4e5f6... (256 bytes of random data)
```

## 🔄 Business Logic Flow

### New User Registration
1. User completes Google OAuth
2. Email extracted from Google profile
3. Check if email exists in any user list
4. If new → Add to `unknown_logins.json`
5. Redirect based on user status

### Authentication Check Flow
1. Other service calls `GET /check-auth`
2. Check if user has valid session
3. If authenticated → Determine user status
4. Return authentication state + user status
5. Calling service makes routing decision

### Admin Workflow
1. Admin calls `GET /admin/users` to see all users
2. Admin calls `POST /admin/approve/:email` or `POST /admin/reject/:email`
3. User moved between JSON files
4. User's next auth check reflects new status

## 🐳 Docker Configuration

### Dockerfile Key Points
```dockerfile
FROM node:18-alpine
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3001
CMD ["node", "server.js"]
```

### Volume Mounting (Critical)
```yaml
volumes:
  - ./auth-service/data:/usr/src/app/data
```
**Why**: Ensures user data and session secrets survive container restarts

## 🔧 Environment Variables

### Required Variables
```env
GOOGLE_CLIENT_ID=13608024902-846ltke59gnc6bmql7fgi2fcapb6dkgj.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<your-secret>
GOOGLE_CALLBACK_URL=http://localhost:3001/auth/google/callback
FRONTEND_URL=http://localhost:3000
```

### Google Cloud Console Setup
1. Create OAuth 2.0 credentials
2. Add authorized redirect URI: `http://localhost:3001/auth/google/callback`
3. Enable Google+ API (for profile access)

## 🐛 Common Issues & Debugging

### OAuth Callback Failures
```bash
# Check callback URL matches exactly
curl -I http://localhost:3001/auth/google/callback
```

### Session Issues
```bash
# Check if session secret exists
ls -la auth-service/data/session.secret

# Check file permissions
docker exec -it <container> ls -la /usr/src/app/data/
```

### User State Issues
```bash
# View current user states
curl http://localhost:3001/admin/users

# Check JSON file integrity
cat auth-service/data/approved_logins.json | jq '.'
```

## 🔄 Service Integration Pattern

Other services should integrate like this:

```javascript
// Example integration in new service
const checkAuth = async (req, res, next) => {
    try {
        const authResponse = await fetch(`${process.env.AUTH_SERVICE_URL}/check-auth`, {
            headers: {
                'Cookie': req.headers.cookie || ''
            }
        });
        
        const authData = await authResponse.json();
        
        if (!authData.authenticated || authData.userStatus !== 'approved') {
            return res.redirect(process.env.FRONTEND_URL);
        }
        
        req.user = authData.user;
        next();
    } catch (error) {
        console.error('Auth check failed:', error);
        res.redirect(process.env.FRONTEND_URL);
    }
};
```

## 📈 Future Enhancements

### High Priority
- **Database migration**: Move from JSON files to PostgreSQL/MongoDB
- **Health checks**: Add `/health` endpoint for monitoring
- **Rate limiting**: Prevent OAuth abuse

### Medium Priority
- **JWT tokens**: Replace sessions for stateless auth
- **Role-based access**: Move beyond approved/rejected binary
- **Audit logging**: Track all admin actions

### Low Priority
- **Multi-provider OAuth**: Support GitHub, Discord, etc.
- **2FA support**: Additional security layer
- **Password fallback**: Local accounts for development

## 🧪 Testing Strategies

### Manual Testing
```bash
# Test OAuth flow
open http://localhost:3001/auth/google

# Test auth check
curl -b cookies.txt http://localhost:3001/check-auth

# Test admin API
curl -X POST http://localhost:3001/admin/approve/test@example.com
```

### Future Automated Tests
- Unit tests for user state management
- Integration tests for OAuth flow
- API endpoint testing

## 📋 Development Checklist

When modifying auth-service:

- [ ] Test OAuth flow with multiple Google accounts
- [ ] Verify session persistence across container restarts  
- [ ] Test user state transitions (unknown → approved → rejected)
- [ ] Verify other services can authenticate via `/check-auth`
- [ ] Check file permissions in data directory
- [ ] Test admin API endpoints
- [ ] Verify proper error handling for network failures

---

**Last Updated**: July 31, 2025  
**Service Version**: v1.0 (Centralized Auth Architecture)
