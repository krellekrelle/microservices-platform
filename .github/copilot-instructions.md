# Microservices Platform - AI Agent Instructions

## Architecture Overview

This is a **centralized-auth microservices platform** running on Docker with Caddy reverse proxy. All authentication is handled by the `auth-service`, while individual services remain stateless.

### Frontend Technology
- **Hearts Game Service**: Migrated to **Vue.js 3** with Vite build system
- **Static Services**: Traditional HTML/CSS/JS for simpler services
- **Build Process**: Vue apps are built during Docker image creation

### Core Services
- **auth-service** (3001): Google OAuth + JWT token management + user database
- **landing-page** (3000): Stateless dashboard that proxies all auth decisions to auth-service
- **Individual services** (3002+): JWT-protected microservices with shared middleware

### Key Design Decisions
- **Centralized Authentication**: All auth logic lives in auth-service, other services just verify JWT tokens
- **Path-Based Routing**: Caddy strips prefixes (`/hearts/*` → service root) for clean service isolation
- **JWT Secret Sharing**: Generated once by auth-service, shared via filesystem (`auth-service/data/jwt.secret`)
- **Three-Tier User Status**: `unknown` (pending) → `approved` → `rejected` with admin controls

## Development Patterns

### Adding New Services
1. Copy `EXAMPLE-NEW-SERVICE.js` as template
2. Add JWT middleware: `const JWTMiddleware = require('../jwt-middleware')`
3. Initialize with `await jwtMiddleware.initialize()` before starting server
4. Add to `docker-compose.yml` and `Caddyfile` with unique port and path prefix
5. Use middleware layers: `authenticate` → `requireApproved` → `requireAdmin`

### Vue.js Services (Hearts Game Pattern)
1. **Development**: `npm run vue:dev` for live Vue development server
2. **Production Build**: `npm run build` creates `/public/dist/` assets
3. **Docker Build**: Automatically runs `npm run build` during image creation
4. **Serving**: Express serves Vue app at root route with authentication
5. **File Structure**: `/src/` for Vue source, `/public/dist/` for built assets

### Authentication Flow
```javascript
// Standard service setup
app.use(cookieParser());
app.use(jwtMiddleware.authenticate, jwtMiddleware.requireApproved);
app.use(express.static(path.join(__dirname, 'public'))); // Now protected
```

### Database Access
- PostgreSQL with connection pooling via `DatabaseService` class
- Migration files in `/database/` run automatically on container startup
- Admin CLI: `./admin.sh` for user management without web interface
- Test with: `docker compose exec database psql -U app_user -d microservices_platform`

### Static File Security Pattern
```javascript
// CRITICAL: Serve unprotected assets BEFORE auth middleware
app.use('/favicon.svg', express.static(path.join(__dirname, 'public/favicon.svg')));
app.use('/bridge3-box-qr-Large', express.static(path.join(__dirname, 'public/bridge3-box-qr-Large')));

// Then apply auth middleware
app.use(jwtMiddleware.authenticate, jwtMiddleware.requireApproved);

// Finally serve protected static files
app.use(express.static(path.join(__dirname, 'public')));
```

## Service-Specific Patterns

### Real-Time Services (Hearts Game)
- Use Socket.IO with Caddy WebSocket proxying
- Initialize socket handler: `socketHandler.initialize(io)` 
- Dual API support: WebSocket events + HTTP endpoints for same actions
- Database persistence for game state with comprehensive audit trails

### External API Integration (LoL Tracking)
- Rate limiting: Conservative 80 req/2min with retry logic
- Background sync jobs every 30 minutes with gap recovery
- Admin dashboard at `/service-name/admin/` with real-time status

### System Monitoring
- Prometheus + Grafana at `/monitor/` (admin-only)
- JWT-protected system metrics without separate auth
- Pure configuration approach using standard Docker images

## Common Commands

```bash
# Development
docker compose up -d                    # Start all services
docker compose logs -f auth-service     # Debug auth issues
./admin.sh                              # User management CLI

# Vue.js Development (Hearts Game Service)
docker compose up -d                    # Start backend services
cd hearts-game-service && npm run vue:dev  # Start Vue dev server (localhost:5173)

# Database operations  
docker compose exec database psql -U app_user -d microservices_platform
./admin.sh approve user@email.com       # Approve user
./admin.sh list pending                 # List pending users

# Testing
cd tests && npm run test               # Full E2E test suite
npm run test:headed                    # Debug with visible browser

# Production deployment
docker compose -f docker-compose.yml up -d --build
```

## Error Patterns & Debugging

### JWT Issues
- Services fail if `auth-service/data/jwt.secret` missing → start auth-service first
- Token verification fails → check JWT_SECRET consistency across services
- "Cannot read properties" → ensure `await jwtMiddleware.initialize()` before server start

### Routing Issues  
- 404s → verify Caddyfile path mapping matches service expectations
- Auth bypassed → check static file middleware order (unprotected assets must come first)
- WebSocket fails → ensure Caddy proxy includes WebSocket headers for Socket.IO services

### Database Connectivity
- Connection refused → check database health with `docker compose ps database`
- Permission denied → verify `DATABASE_URL` environment variable format
- Migration failures → check `/database/` file naming and SQL syntax

## Code Style Conventions

- **Error Handling**: Always return JSON errors with consistent format: `{ error: 'message', authenticated: false }`
- **Logging**: Use timestamps and structured logging: `console.log('${new Date().toISOString()} - ${message}')`
- **Environment**: All config via environment variables with fallback defaults
- **Routes**: RESTful APIs under `/api/`, admin interfaces at `/${service}/admin/`
- **Database**: Use connection pooling, always handle client release, parameterized queries only

This platform prioritizes **security** (centralized auth), **maintainability** (shared patterns), and **operational simplicity** (Docker + CLI tools).