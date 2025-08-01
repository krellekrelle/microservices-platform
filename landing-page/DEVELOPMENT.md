# Landing Page Service - Development Guide

## 🎯 Service Overview

**Purpose**: Stateless navigation hub and HTML interface provider  
**Port**: 3000  
**Role**: Main entry point, serves authentication pages, proxies auth decisions  
**Dependencies**: auth-service for all authentication logic  

## 🏗️ Architecture Role

The landing-page service follows a **stateless proxy pattern**:
- **No authentication logic** - delegates everything to auth-service
- **HTML interface provider** - serves different pages based on auth status
- **Navigation hub** - main entry point for users
- **Proxy service** - forwards auth requests to auth-service
- **User experience coordinator** - determines which page to show

## 📁 File Structure

```
landing-page/
├── server.js              # Main application logic
├── package.json           # Dependencies and scripts
├── Dockerfile            # Container configuration
└── public/               # Static HTML files
    ├── login.html        # Unauthenticated users
    ├── dashboard.html    # Approved users
    ├── pending.html      # Unknown users awaiting approval
    └── rejected.html     # Rejected users
```

## 🔧 Core Functionality

### 1. Stateless Auth Checking
```javascript
const checkAuthService = async (req) => {
    try {
        const response = await fetch(`${process.env.AUTH_SERVICE_URL}/check-auth`, {
            method: 'GET',
            headers: {
                'Cookie': req.headers.cookie || ''
            }
        });
        return await response.json();
    } catch (error) {
        console.error('Auth service check failed:', error);
        return { authenticated: false };
    }
};
```

**Key Principle**: Never makes auth decisions locally - always asks auth-service

### 2. Page Routing Logic
```javascript
app.get('/', async (req, res) => {
    const authData = await checkAuthService(req);
    
    if (!authData.authenticated) {
        return res.sendFile(path.join(__dirname, 'public', 'login.html'));
    }
    
    switch (authData.userStatus) {
        case 'approved':
            return res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
        case 'rejected':
            return res.sendFile(path.join(__dirname, 'public', 'rejected.html'));
        default: // 'unknown'
            return res.sendFile(path.join(__dirname, 'public', 'pending.html'));
    }
});
```

**Flow**: Auth check → Status determination → Appropriate HTML page

### 3. Proxy Endpoints
```javascript
// Proxy auth status checks to auth-service
app.get('/check-auth', async (req, res) => {
    const authData = await checkAuthService(req);
    res.json(authData);
});

// Proxy logout to auth-service
app.post('/logout', async (req, res) => {
    // Forward logout request to auth-service
    await fetch(`${process.env.AUTH_SERVICE_URL}/logout`, {
        method: 'POST',
        headers: { 'Cookie': req.headers.cookie || '' }
    });
    res.redirect('/');
});
```

**Purpose**: Provides consistent API for frontend JavaScript while delegating to auth-service

## 🎨 HTML Interface Pages

### 1. login.html
**Purpose**: Entry point for unauthenticated users  
**Features**:
- Google OAuth login button
- Clean, professional design
- Links to auth-service OAuth endpoint

**Key Elements**:
```html
<a href="http://localhost:3001/auth/google" class="login-btn">
    Login with Google
</a>
```

### 2. dashboard.html
**Purpose**: Main interface for approved users  
**Features**:
- Welcome message with user info
- Navigation to available microservices
- Logout functionality
- Links to hello-world-app and future services

**Key Elements**:
```html
<div class="apps-grid">
    <a href="http://localhost:3002" class="app-card">
        <h3>Hello World App</h3>
        <p>Example microservice</p>
    </a>
</div>
```

### 3. pending.html
**Purpose**: Holding page for users awaiting admin approval  
**Features**:
- Status explanation
- "Check Status" button for real-time updates
- Logout option
- Professional waiting experience

**Key JavaScript**:
```javascript
async function checkStatus() {
    const response = await fetch('/check-auth');
    const data = await response.json();
    if (data.userStatus === 'approved') {
        window.location.reload();
    }
}
```

### 4. rejected.html
**Purpose**: Information page for rejected users  
**Features**:
- Clear rejection message
- Logout functionality
- Contact information for appeals
- Professional, respectful tone

## 🔗 API Endpoints

### Page Serving
| Method | Endpoint | Purpose | Returns |
|--------|----------|---------|---------|
| GET | `/` | Main landing page | Appropriate HTML based on auth status |

### Proxy Endpoints
| Method | Endpoint | Purpose | Proxies To |
|--------|----------|---------|------------|
| GET | `/check-auth` | Check auth status | `auth-service:3001/check-auth` |
| POST | `/logout` | User logout | `auth-service:3001/logout` |

## 🔄 Business Logic Flow

### User Visit Flow
1. User navigates to `http://localhost:3000`
2. Service calls `checkAuthService(req)` 
3. Auth-service determines authentication status
4. Service serves appropriate HTML page
5. HTML page provides interface for next actions

### Status Check Flow (from pending.html)
1. User clicks "Check Status" button
2. JavaScript calls `GET /check-auth` (landing-page)
3. Landing-page proxies to `auth-service:3001/check-auth`
4. Auth-service returns current status
5. If approved → Page reload → Dashboard shown

### Logout Flow
1. User clicks logout button
2. JavaScript calls `POST /logout` (landing-page)
3. Landing-page proxies to `auth-service:3001/logout`
4. Auth-service clears session
5. User redirected to login page

## 🐳 Docker Configuration

### Dockerfile Key Points
```dockerfile
FROM node:18-alpine
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

### Service Dependencies
```yaml
depends_on:
  - auth-service
```
**Why**: Landing-page cannot function without auth-service

## 🔧 Environment Variables

### Required Variables
```env
AUTH_SERVICE_URL=http://auth-service:3001
```

**Critical**: Must use Docker service name (`auth-service`) not localhost

## 🎨 Frontend JavaScript Patterns

### Status Checking Pattern
```javascript
async function checkStatus() {
    try {
        const response = await fetch('/check-auth');
        const data = await response.json();
        
        if (data.userStatus === 'approved') {
            window.location.reload(); // Will now show dashboard
        } else {
            // Update UI to show current status
        }
    } catch (error) {
        console.error('Status check failed:', error);
    }
}
```

### Logout Pattern
```javascript
async function logout() {
    try {
        await fetch('/logout', { method: 'POST' });
        window.location.href = '/'; // Redirect to main page
    } catch (error) {
        console.error('Logout failed:', error);
    }
}
```

## 🐛 Common Issues & Debugging

### Auth Service Communication Issues
```bash
# Test auth service connectivity from container
docker exec -it landing-page-container curl http://auth-service:3001/check-auth
```

### HTML Not Updating
- Check browser cache (hard refresh: Cmd+Shift+R)
- Verify HTML files are properly mounted
- Check for JavaScript errors in browser console

### Proxy Endpoint Issues
```bash
# Test proxy endpoints
curl -b cookies.txt http://localhost:3000/check-auth
curl -X POST -b cookies.txt http://localhost:3000/logout
```

## 🔄 Service Integration Pattern

Landing-page demonstrates the **stateless service pattern** for the platform:

```javascript
// ✅ CORRECT: Always delegate auth decisions
const authData = await checkAuthService(req);
if (!authData.authenticated || authData.userStatus !== 'approved') {
    // Handle unauthorized state
}

// ❌ WRONG: Never make local auth decisions
if (req.session.user) { // Don't do this!
    // This breaks the centralized auth model
}
```

## 📈 Future Enhancements

### High Priority
- **Dynamic service discovery**: Auto-populate dashboard with available services
- **Health checks**: Add `/health` endpoint
- **Error pages**: Better error handling and user messaging

### Medium Priority
- **Progressive Web App**: Add service worker, offline support
- **User preferences**: Store UI preferences (theme, layout)
- **Admin interface**: Web UI for user management

### Low Priority
- **Multi-language support**: i18n for different languages
- **Theming**: Customizable UI themes
- **Analytics**: User interaction tracking

## 🧪 Testing Strategies

### Manual Testing Checklist
- [ ] Unauthenticated user sees login page
- [ ] Login redirects to Google OAuth
- [ ] Unknown user sees pending page
- [ ] Status check works on pending page
- [ ] Approved user sees dashboard
- [ ] Dashboard links work to other services
- [ ] Rejected user sees rejection page
- [ ] Logout works from all pages

### Browser Testing
```javascript
// Test in browser console
fetch('/check-auth').then(r => r.json()).then(console.log);
fetch('/logout', {method: 'POST'}).then(() => location.reload());
```

## 🎯 Development Guidelines

### Adding New HTML Pages
1. Create HTML file in `public/` directory
2. Add route in `server.js` with auth check
3. Update navigation in dashboard.html if needed
4. Test auth integration

### Modifying Existing Pages
1. Update HTML file
2. Test with different user states (unknown/approved/rejected)
3. Verify JavaScript functions work
4. Check responsive design

### Adding New Proxy Endpoints
1. Add route that calls `checkAuthService()`
2. Forward request to appropriate auth-service endpoint
3. Handle errors gracefully
4. Document in API table above

## 📋 Development Checklist

When modifying landing-page service:

- [ ] All auth decisions delegated to auth-service
- [ ] HTML pages work for all user states
- [ ] JavaScript functions handle errors gracefully
- [ ] Proxy endpoints forward cookies correctly
- [ ] Service can start without auth-service (graceful degradation)
- [ ] Responsive design works on mobile
- [ ] No hardcoded URLs (use environment variables)

---

**Last Updated**: July 31, 2025  
**Service Version**: v1.0 (Stateless Proxy Architecture)
