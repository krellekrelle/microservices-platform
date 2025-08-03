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

### Phase 6: Network & Public Access (August 2025)
- **Tailscale Integration**: Implemented mesh VPN for bypassing CGNAT
- **Tailscale Funnel**: Enabled public access without port forwarding
- **Caddy v2 Reverse Proxy**: HTTPS termination and request routing
- **Domain Access**: Public HTTPS access via `kl-pi.tail9f5728.ts.net`
- **OAuth Update**: Fresh Google OAuth credentials for production domain

### Phase 7: UI/UX & Routing Improvements (August 2025)
- **Professional Google Sign-in Button**: Implemented official Google branding with "G" logo
- **Working Inter-Service Routing**: Fixed Caddy path handling for microservices
- **Hello World App Integration**: Fully functional authentication and user display
- **Proper Path Stripping**: Caddy `handle_path` configuration for clean URLs

### Phase 8: Database Migration & Admin Panel (August 2025)
- **PostgreSQL Integration**: Complete migration from JSON files to PostgreSQL database
- **Database Schema**: Users, sessions, audit trails with automatic initialization
- **Web Admin Panel**: Full-featured user management interface with statistics
- **CLI Admin Tools**: Command-line interface for database operations
- **API Endpoints**: RESTful admin API with proper authentication
- **Container Rebuild Issues Discovered**: Critical lesson about Docker caching

### Phase 9: JWT Authentication Migration (August 2025)
- **JWT Token Implementation**: Migrated from Express sessions to JWT tokens
- **Stateless Authentication**: Services now validate tokens independently
- **Token Storage**: HttpOnly cookies with 24-hour access tokens and 7-day refresh tokens
- **Shared JWT Middleware**: Created reusable JWT validation module for all services
- **Docker Environment Integration**: JWT secrets shared via environment variables
- **Migration Script**: Automated migration process with comprehensive documentation

### Phase 11: Match Loading System (August 2025)
- **Match Database Schema**: Extended database with match, participant, team, and ban tables
- **Match Loading API**: Admin endpoints for loading match history from Riot API
- **Date Range Selection**: UI for selecting start/end dates for match loading
- **Match Analytics**: Statistics and overview of loaded matches with known users
- **Admin Match Management**: Comprehensive interface for viewing and managing match data
- **Database Views**: Created views for efficient match querying with user relationships

### Phase 10: League of Legends Integration (August 2025)
- **LoL Tracking Service**: New microservice for League of Legends account management
- **Riot Games API Integration**: Account validation and data fetching
- **User Account Linking**: Link Riot accounts to platform users with PUUID tracking
- **Admin Analytics**: Comprehensive overview of all linked accounts across users
- **Database Extension**: New tables for riot accounts with proper relationships
- **Service Pattern Implementation**: Follows established auth and routing patterns

### Phase 8: Database Migration & Admin Panel (August 2025)
- **PostgreSQL Integration**: Complete migration from JSON files to PostgreSQL database
- **Database Schema**: Users, sessions, audit trails with automatic initialization
- **Web Admin Panel**: Full-featured user management interface with statistics
- **CLI Admin Tools**: Command-line interface for database operations
- **API Endpoints**: RESTful admin API with proper authentication
- **Container Rebuild Issues Discovered**: Critical lesson about Docker caching

### Phase 9: JWT Authentication Migration (August 2025)
- **JWT Token Implementation**: Migrated from Express sessions to JWT tokens
- **Stateless Authentication**: Services now validate tokens independently
- **Token Storage**: HttpOnly cookies with 24-hour access tokens and 7-day refresh tokens
- **Shared JWT Middleware**: Created reusable JWT validation module for all services
- **Docker Environment Integration**: JWT secrets shared via environment variables
- **Migration Script**: Automated migration process with comprehensive documentation

## ⚠️ Critical Development Lessons

### Container Rebuilding Requirements
**MAJOR ISSUE DISCOVERED**: Docker container caching can prevent code changes from taking effect!

**Symptoms**:
- Code changes not reflected in running services
- Old endpoints/behavior persisting after updates
- Authentication or routing issues after modifications

**Solutions**:
```bash
# Always rebuild containers after code changes
docker-compose build service-name --no-cache
docker-compose up -d service-name

# For major issues, full rebuild
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

**Browser Caching**: Also use hard refresh (Ctrl+F5) or incognito mode when testing changes.

## 🎯 Current Production Status

**Live Application**: https://kl-pi.tail9f5728.ts.net  
**Status**: ✅ Fully Operational  
**Last Updated**: August 3, 2025  

### Working Features
- ✅ **Professional Google OAuth** - Official sign-in button with Google branding
- ✅ **User Authentication** - Three-tier approval system (unknown/approved/rejected)
- ✅ **Service Routing** - Hello World app and LoL Tracker accessible via dashboard
- ✅ **Authentication Integration** - Proper auth checks across all services
- ✅ **League of Legends Integration** - Riot account linking and management
- ✅ **Match Loading System** - Admin interface for loading and analyzing match history
- ✅ **Admin Analytics** - Comprehensive overview of all linked accounts and match data
- ✅ **Public HTTPS Access** - Via Tailscale Funnel without port forwarding
- ✅ **Automatic SSL** - Caddy handles certificate management
- ✅ **Docker Orchestration** - All services containerized and communicating

### Recent Achievements (August 3, 2025)
- **Match Loading System**: Complete match data loading and analytics functionality
- **Match Database**: Comprehensive schema matching C# models from original .NET application
- **Admin Match Management**: Date range selection, loading progress, and match analytics
- **Match Statistics**: Real-time statistics and overview of loaded matches with known users
- **Database Optimization**: Views and indexes for efficient match querying and user relationships

## 🎯 Core Architecture Principles

### 1. Centralized Authentication
```
All services → auth-service → Google OAuth → User Management
```
- **Why**: Single source of truth for user states
- **Benefit**: Consistent auth logic, easier maintenance
- **Implementation**: All services call `/check-auth` endpoint

### 2. Stateless Service Design
- **auth-service**: Stateful (manages JWT tokens, user data)
- **landing-page**: Stateless (JWT token validation)
- **hello-world-app**: Stateless (JWT token validation)

### 3. Container-First Development
- Each service runs in isolated Docker container
- Services communicate via Docker network names
- Volume mounting for persistent data

## 🔧 Technical Stack & Configuration

### Core Technologies
- **Backend**: Node.js 18 with Express
- **Database**: PostgreSQL 16 Alpine with persistent volumes
- **Authentication**: Passport.js with Google OAuth 2.0 and JWT tokens
- **Containerization**: Docker & Docker Compose
- **Token Management**: JWT with httpOnly cookies and automatic refresh
- **Reverse Proxy**: Caddy v2 with automatic HTTPS
- **Frontend**: Vanilla HTML/CSS/JavaScript with modern UI components

### Environment Configuration
```env
# Google OAuth Credentials (Production)
GOOGLE_CLIENT_ID=13608024902-6e22ofrtkjb6464qk7o0uqvr7793fooe.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<your-secret>
GOOGLE_CALLBACK_URL=https://kl-pi.tail9f5728.ts.net/auth/google/callback
FRONTEND_URL=https://kl-pi.tail9f5728.ts.net
BASE_URL=https://kl-pi.tail9f5728.ts.net
AUTH_SERVICE_URL=http://auth-service:3001

# Database Configuration
DATABASE_URL=postgresql://app_user:secure_password_change_in_production@database:5432/microservices_platform

# Riot Games API (for LoL tracking service)
RIOT_API_KEY=<your-riot-development-api-key>

# For local development, use:
# GOOGLE_CALLBACK_URL=http://localhost:3001/auth/google/callback
# FRONTEND_URL=http://localhost:3000
# BASE_URL=http://localhost:3000
```

### Network Architecture
- **Internal Network**: Docker `app-network` for service communication
- **External Access**: Tailscale Funnel for public HTTPS access
- **Reverse Proxy**: Caddy v2 handling SSL termination and routing
- **Public Domain**: `kl-pi.tail9f5728.ts.net` (Tailscale Funnel domain)

## 🔐 Authentication Flow Deep Dive

### User Journey
1. **User visits landing page** (`https://kl-pi.tail9f5728.ts.net`)
2. **Landing page checks auth** via `GET /check-auth` to auth-service
3. **Auth service determines user state**:
   - Not logged in → Serve login.html
   - Logged in + Unknown → Serve pending.html
   - Logged in + Approved → Serve dashboard.html
   - Logged in + Rejected → Serve rejected.html

### OAuth Configuration
- **Forced Account Selection**: `prompt: 'select_account'`
- **Production Callback URL**: `https://kl-pi.tail9f5728.ts.net/auth/google/callback`
- **Session Secret**: Auto-generated 256-byte random secret, persisted to file
- **HTTPS**: Handled by Caddy with automatic certificate management via Tailscale

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
- **Database Migration**: Move from JSON files to proper database
- **Health Checks**: Service monitoring and recovery
- **Hello World Routing**: Fix path stripping for `/hello/*` routes

### Medium Priority
- **API Documentation**: OpenAPI/Swagger specs
- **Logging**: Centralized logging with structured format
- **Monitoring**: Metrics collection and alerting

### Low Priority
- **Multi-stage Docker builds**: Optimize image sizes
- **Kubernetes deployment**: For production scaling
- **CI/CD Pipeline**: Automated testing and deployment

## 🌐 Network & Deployment Solutions

### CGNAT & ISP Restrictions
- **Problem**: Many ISPs block ports 80/443 and use CGNAT
- **Solution**: Tailscale mesh VPN with Funnel for public access
- **Benefit**: No port forwarding required, automatic HTTPS

### Tailscale Setup
1. **Install Tailscale**: `curl -fsSL https://tailscale.com/install.sh | sh`
2. **Authenticate**: `sudo tailscale up`
3. **Enable Funnel**: `sudo tailscale funnel 80`
4. **Get Domain**: `tailscale status` shows your `.ts.net` domain

## 🐛 Common Issues & Solutions

### Google OAuth Issues
- **Problem**: OAuth callback fails
- **Solution**: Verify GOOGLE_CALLBACK_URL matches Google Cloud Console exactly
- **Production**: Use HTTPS domain for production OAuth callbacks

### Docker Networking
- **Problem**: Services can't communicate
- **Solution**: Use service names (e.g., `auth-service:3001`) not localhost

### Session Persistence
- **Problem**: Sessions lost on container restart
- **Solution**: Volume mounting for `auth-service/data` directory

### Environment Variables Not Loading
- **Problem**: New .env values not picked up by containers
- **Solution**: Complete restart with `docker compose down && docker compose up -d`

### CGNAT & Port Forwarding
- **Problem**: ISP blocks standard ports or uses CGNAT
- **Solution**: Use Tailscale Funnel for public access without port forwarding

## 📚 Key Files Reference

### Configuration Files
- `docker-compose.yml`: Multi-container orchestration
- `Caddyfile`: Reverse proxy configuration for HTTPS and routing
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

> "Working on microservices-platform (GitHub: krellekrelle/microservices-platform). It's a Node.js microservices platform with centralized Google OAuth authentication running on Raspberry Pi. Architecture: auth-service (3001) handles all auth, landing-page (3000) is stateless proxy, hello-world-app (3002) is example service. Uses Docker with app-network for service communication. Public access via Tailscale Funnel at https://kl-pi.tail9f5728.ts.net. All services check auth via auth-service /check-auth endpoint."

---

**Last Updated**: August 2, 2025  
**Architecture Version**: v1.1 (Tailscale + Production HTTPS)
