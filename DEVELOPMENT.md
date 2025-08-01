# Development Context & Architecture Guide

## 📋 Project Overview

**Repository**: `microservices-platform`  
**GitHub**: https://github.com/krellekrelle/microservices-platform  
**Architecture**: Centralized authentication microservices platform  
**Target**: Raspberry Pi deployment with Docker containerization  

## 🏗️ Project Evolution History

### Phase 1: Initial Concept
- Started as basic Raspberry Pi application suite
- Simple multi-service architecture concept

### Phase 2: Authentication Implementation
- Google OAuth 2.0 integration with passport.js
- Three-tier user management system (unknown/approved/rejected)
- File-based user storage in JSON format

### Phase 3: Architecture Refactor
- **Critical Decision**: Centralized all authentication logic in auth-service
- Made landing-page completely stateless (proxies all auth decisions)
- Implemented `/check-auth` endpoint for centralized status checking

### Phase 4: UX Enhancement
- Added logout functionality across all pages
- Implemented real-time status checking for pending users
- Forced Google account selection on login
- Removed confusing back buttons and improved navigation

### Phase 5: Production Readiness
- Complete Docker containerization with docker-compose
- Custom network (`app-network`) for service communication
- Auto-generated session secrets with file persistence
- Professional git repository with comprehensive documentation

## 🎯 Core Architecture Principles

### 1. Centralized Authentication
```
All services → auth-service → Google OAuth → User Management
```
- **Why**: Single source of truth for user states
- **Benefit**: Consistent auth logic, easier maintenance
- **Implementation**: All services call `/check-auth` endpoint

### 2. Stateless Service Design
- **auth-service**: Stateful (manages sessions, user data)
- **landing-page**: Stateless (proxies all auth decisions)
- **hello-world-app**: Stateless (example service pattern)

### 3. Container-First Development
- Each service runs in isolated Docker container
- Services communicate via Docker network names
- Volume mounting for persistent data

## 🔧 Technical Stack & Configuration

### Core Technologies
- **Backend**: Node.js 18 with Express
- **Authentication**: Passport.js with Google OAuth 2.0
- **Containerization**: Docker & Docker Compose
- **Session Management**: express-session with file store

### Environment Configuration
```env
GOOGLE_CLIENT_ID=13608024902-846ltke59gnc6bmql7fgi2fcapb6dkgj.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<your-secret>
GOOGLE_CALLBACK_URL=http://localhost:3001/auth/google/callback
FRONTEND_URL=http://localhost:3000
AUTH_SERVICE_URL=http://auth-service:3001
```

### Docker Network
- **Network Name**: `app-network`
- **Service Resolution**: Services communicate using service names
- **Port Mapping**: External ports mapped to host for development

## 🔐 Authentication Flow Deep Dive

### User Journey
1. **User visits landing page** (`http://localhost:3000`)
2. **Landing page checks auth** via `GET /check-auth` to auth-service
3. **Auth service determines user state**:
   - Not logged in → Serve login.html
   - Logged in + Unknown → Serve pending.html
   - Logged in + Approved → Serve dashboard.html
   - Logged in + Rejected → Serve rejected.html

### OAuth Configuration
- **Forced Account Selection**: `prompt: 'select_account'`
- **Callback URL**: Must match Google Cloud Console exactly
- **Session Secret**: Auto-generated 256-byte random secret, persisted to file

### User State Management
- **Files**: `approved_logins.json`, `rejected_logins.json`, `unknown_logins.json`
- **Format**: Array of email addresses
- **Admin API**: REST endpoints for user approval/rejection

## 🐳 Docker Architecture

### Service Configuration
```yaml
auth-service:
  port: 3001
  volumes: ./auth-service/data:/usr/src/app/data
  
landing-page:
  port: 3000
  depends_on: auth-service
  
hello-world-app:
  port: 3002
  example: true
```

### Key Docker Concepts Used
- **Multi-stage builds**: Not implemented yet (future optimization)
- **Volume mounting**: Persistent data storage
- **Service dependencies**: Proper startup ordering
- **Custom networks**: Inter-service communication

## 🚀 Development Workflow

### Local Development
```bash
# Start all services
docker-compose up --build -d

# Check logs
docker-compose logs -f [service-name]

# Stop services
docker-compose down
```

### Adding New Services
1. Create service directory with standard structure
2. Add Dockerfile (use Node.js 18 Alpine base)
3. Update docker-compose.yml
4. Implement auth integration pattern (see hello-world-app)

### Authentication Integration Pattern
```javascript
// Check auth status
const authResponse = await fetch(`${process.env.AUTH_SERVICE_URL}/check-auth`);
const authData = await authResponse.json();

if (!authData.authenticated || authData.userStatus !== 'approved') {
    return res.redirect(process.env.FRONTEND_URL);
}
```

## 🔄 Planned Enhancements

### High Priority
- **Caddy Integration**: HTTPS with automatic SSL certificates
- **Database Migration**: Move from JSON files to proper database
- **Health Checks**: Service monitoring and recovery

### Medium Priority
- **API Documentation**: OpenAPI/Swagger specs
- **Logging**: Centralized logging with structured format
- **Monitoring**: Metrics collection and alerting

### Low Priority
- **Multi-stage Docker builds**: Optimize image sizes
- **Kubernetes deployment**: For production scaling
- **CI/CD Pipeline**: Automated testing and deployment

## 🐛 Common Issues & Solutions

### Google OAuth Issues
- **Problem**: OAuth callback fails
- **Solution**: Verify GOOGLE_CALLBACK_URL matches Google Cloud Console exactly

### Docker Networking
- **Problem**: Services can't communicate
- **Solution**: Use service names (e.g., `auth-service:3001`) not localhost

### Session Persistence
- **Problem**: Sessions lost on container restart
- **Solution**: Volume mounting for `auth-service/data` directory

### Port Conflicts
- **Problem**: Ports 3000-3002 already in use
- **Solution**: Update docker-compose.yml port mappings

## 📚 Key Files Reference

### Configuration Files
- `docker-compose.yml`: Multi-container orchestration
- `.env.example`: Environment template
- `.gitignore`: Comprehensive exclusions

### Service Files
- `auth-service/server.js`: Core authentication logic
- `landing-page/server.js`: Stateless navigation proxy
- `hello-world-app/server.js`: Example service pattern

### Documentation
- `README.md`: User-facing setup instructions
- `DOCKER.md`: Docker command reference
- `DEVELOPMENT.md`: This file - development context

## 🎯 Testing Strategy

### Manual Testing
- OAuth flow with different Google accounts
- User approval/rejection workflow
- Service communication between containers

### Future Automated Testing
- Unit tests for authentication logic
- Integration tests for service communication
- End-to-end tests for complete user flows

## 📞 Support & Context

When starting new development sessions, provide this context:

> "Working on microservices-platform (GitHub: krellekrelle/microservices-platform). It's a Node.js microservices platform with centralized Google OAuth authentication. Architecture: auth-service (3001) handles all auth, landing-page (3000) is stateless proxy, hello-world-app (3002) is example service. Uses Docker with app-network for service communication. All services check auth via auth-service /check-auth endpoint."

---

**Last Updated**: July 31, 2025  
**Architecture Version**: v1.0 (Centralized Auth)
