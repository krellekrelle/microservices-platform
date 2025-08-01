# Hello World App - Development Guide

## 🎯 Service Overview

**Purpose**: Example microservice demonstrating authentication integration pattern  
**Port**: 3002  
**Role**: Template for new services, demonstrates auth integration  
**Dependencies**: auth-service for authentication validation  

## 🏗️ Architecture Role

The hello-world-app serves as the **reference implementation** for new microservices:
- **Authentication integration**: Shows how to check auth with auth-service
- **Service template**: Provides boilerplate for new services
- **Testing endpoint**: Simple service for platform validation
- **Documentation example**: Demonstrates service development patterns

## 📁 File Structure

```
hello-world-app/
├── server.js              # Main application logic
├── package.json           # Dependencies and scripts
├── Dockerfile            # Container configuration
└── DEVELOPMENT.md        # This file
```

## 🔧 Core Functionality

### 1. Authentication Integration Pattern
```javascript
const checkAuth = async (req, res, next) => {
    try {
        const authResponse = await fetch(`${process.env.AUTH_SERVICE_URL}/check-auth`, {
            method: 'GET',
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

**Key Principles**:
- Always forward cookies to auth-service
- Check both `authenticated` and `userStatus` 
- Redirect unauthorized users to landing page
- Attach user data to request for downstream use

### 2. Simple Service Logic
```javascript
app.get('/', checkAuth, (req, res) => {
    res.json({
        message: 'Hello World!',
        user: req.user,
        timestamp: new Date().toISOString(),
        service: 'hello-world-app'
    });
});
```

**Features**:
- Protected endpoint (requires authentication)
- Returns user information from auth check
- Simple JSON response format
- Service identification

## 🔗 API Endpoints

### Main Endpoints
| Method | Endpoint | Purpose | Auth Required |
|--------|----------|---------|---------------|
| GET | `/` | Hello world response | Yes (approved users only) |

### Future Endpoint Examples
```javascript
// Additional endpoints you might add:
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/user-info', checkAuth, (req, res) => {
    res.json({ user: req.user });
});

app.post('/api/data', checkAuth, (req, res) => {
    // Process authenticated user data
});
```

## 🔄 Business Logic Flow

### Request Processing Flow
1. User requests `http://localhost:3002/`
2. Express middleware `checkAuth` executes
3. Auth check calls `auth-service:3001/check-auth`
4. Auth-service validates session and returns user status
5. If approved → Continue to route handler
6. If not approved → Redirect to landing page
7. Route handler returns hello world response with user data

### Error Handling Flow
1. Auth-service unreachable → Redirect to landing page
2. Invalid session → Redirect to landing page  
3. User not approved → Redirect to landing page
4. Service error → Return 500 error

## 🐳 Docker Configuration

### Dockerfile Key Points
```dockerfile
FROM node:18-alpine
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3002
CMD ["node", "server.js"]
```

### Service Dependencies
```yaml
depends_on:
  - auth-service
networks:
  - app-network
```

**Why**: Needs auth-service for authentication and app-network for communication

## 🔧 Environment Variables

### Required Variables
```env
AUTH_SERVICE_URL=http://auth-service:3001
FRONTEND_URL=http://localhost:3000
```

### Variable Usage
- `AUTH_SERVICE_URL`: Where to check authentication
- `FRONTEND_URL`: Where to redirect unauthorized users

## 🧩 Reusable Patterns

### 1. Auth Middleware Pattern
```javascript
const checkAuth = async (req, res, next) => {
    // Standard auth checking logic
    // Copy this to new services
};

// Apply to protected routes
app.get('/protected-route', checkAuth, (req, res) => {
    // Route logic here
});
```

### 2. Error Handling Pattern
```javascript
try {
    const authResponse = await fetch(authServiceUrl);
    // Process response
} catch (error) {
    console.error('Auth service error:', error);
    res.redirect(process.env.FRONTEND_URL);
}
```

### 3. Response Format Pattern
```javascript
res.json({
    success: true,
    data: responseData,
    user: req.user,
    timestamp: new Date().toISOString(),
    service: 'service-name'
});
```

## 🔄 Service Integration Examples

### Adding Database Operations
```javascript
app.get('/data', checkAuth, async (req, res) => {
    try {
        // Database query here
        const data = await db.query('SELECT * FROM user_data WHERE user_id = ?', [req.user.id]);
        res.json({
            success: true,
            data: data,
            user: req.user
        });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
```

### Adding File Operations
```javascript
app.post('/upload', checkAuth, upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    
    res.json({
        success: true,
        filename: req.file.filename,
        user: req.user
    });
});
```

## 🐛 Common Issues & Debugging

### Auth Service Communication
```bash
# Test auth service connectivity from container
docker exec -it hello-world-app-container curl http://auth-service:3001/check-auth
```

### Cookie Forwarding Issues
```javascript
// Debug cookie forwarding
console.log('Request cookies:', req.headers.cookie);
console.log('Auth response:', authData);
```

### Environment Variable Issues
```bash
# Check environment variables in container
docker exec -it hello-world-app-container env | grep -E "(AUTH_SERVICE_URL|FRONTEND_URL)"
```

## 📈 Future Enhancements

### Service-Specific Features
- Add business logic specific to your use case
- Implement database operations
- Add file upload/download capabilities
- Integrate with external APIs

### Common Microservice Features
- Health check endpoints (`/health`)
- Metrics endpoints (`/metrics`)
- API versioning (`/api/v1/...`)
- Request logging middleware
- Rate limiting

## 🧪 Testing Strategies

### Manual Testing
```bash
# Test without authentication (should redirect)
curl -I http://localhost:3002/

# Test with valid session cookie
curl -b "session-cookie=value" http://localhost:3002/
```

### Integration Testing
```javascript
// Example test cases
describe('Hello World App', () => {
    it('should redirect unauthenticated users', async () => {
        const response = await request(app).get('/');
        expect(response.status).toBe(302);
    });
    
    it('should return hello world for authenticated users', async () => {
        // Mock auth service response
        // Test endpoint
    });
});
```

## 🔨 Development Workflow

### Creating New Microservices (Based on Hello World App)

1. **Copy the service structure**:
   ```bash
   cp -r hello-world-app new-service-name
   cd new-service-name
   ```

2. **Update package.json**:
   ```json
   {
     "name": "new-service-name",
     "description": "Description of new service"
   }
   ```

3. **Update docker-compose.yml**:
   ```yaml
   new-service-name:
     build: ./new-service-name
     ports:
       - "3003:3003"  # New port
     environment:
       - AUTH_SERVICE_URL=http://auth-service:3001
       - FRONTEND_URL=http://localhost:3000
   ```

4. **Modify server.js**:
   - Keep the `checkAuth` middleware
   - Replace business logic
   - Update port number

5. **Test integration**:
   - Verify auth integration works
   - Test redirect behavior
   - Confirm service shows in dashboard

## 📋 Development Checklist

When creating new services based on hello-world-app:

- [ ] Copy `checkAuth` middleware exactly
- [ ] Forward cookies to auth-service correctly
- [ ] Check both `authenticated` and `userStatus`
- [ ] Redirect unauthorized users to landing page
- [ ] Add service to docker-compose.yml
- [ ] Update landing-page dashboard with new service link
- [ ] Test auth integration thoroughly
- [ ] Add appropriate error handling
- [ ] Document service-specific functionality

## 🎯 Best Practices

### Security
- Always use the `checkAuth` middleware on protected routes
- Never trust client-side authentication state
- Forward all cookies to auth-service
- Handle auth failures gracefully

### Performance
- Cache auth responses if needed (with short TTL)
- Use connection pooling for databases
- Implement proper error handling

### Maintenance
- Follow the established patterns
- Document any deviations from standard patterns
- Keep auth integration logic consistent
- Update service documentation

---

**Last Updated**: August 1, 2025  
**Service Version**: v1.0 (Reference Implementation)
