# Changelog

## [2.0.0] - JWT Authentication Migration - 2025-08-02

### 🔄 Major Changes
- **BREAKING CHANGE**: Migrated from Express sessions to JWT token authentication
- All services now use stateless JWT validation instead of centralized session checking
- JWT tokens stored in secure httpOnly cookies with automatic refresh mechanism

### ✨ Features Added
- **JWT Token Authentication**: 24-hour access tokens with 7-day refresh tokens
- **Shared JWT Middleware**: Reusable authentication module for all services
- **Independent Token Validation**: Services can validate tokens without calling auth service
- **Automatic Token Refresh**: Seamless token renewal for authenticated users
- **Migration Script**: Automated JWT migration with comprehensive documentation

### 🏗️ Architecture Changes
- **Auth Service**: Now generates and validates JWT tokens instead of managing sessions
- **Landing Page**: Direct JWT validation instead of proxying auth requests
- **Hello World App**: Local JWT validation with shared middleware
- **Docker Configuration**: JWT secrets shared via environment variables

### 📁 Files Added
- `jwt-middleware.js` - Shared JWT middleware for all services
- `JWT-MIGRATION.md` - Comprehensive migration documentation
- `MIGRATION-SUMMARY.md` - Summary of all changes made
- `migrate-to-jwt.sh` - Automated migration script
- `EXAMPLE-NEW-SERVICE.js` - Template for adding JWT to new services
- `CHANGELOG.md` - This changelog file

### 📁 Files Modified
- `auth-service/server.js` - Complete rewrite for JWT authentication
- `auth-service/package.json` - Added JWT dependencies
- `landing-page/server.js` - Replaced with JWT-based authentication
- `landing-page/package.json` - Added JWT dependencies
- `hello-world-app/server.js` - Updated to use JWT middleware
- `hello-world-app/package.json` - Added JWT dependencies
- `docker-compose.yml` - Added JWT_SECRET environment variable
- `README.md` - Updated documentation to reflect JWT changes
- `DEVELOPMENT.md` - Added JWT migration phase and updated architecture notes

### 🔧 Technical Details
- **Token Structure**: Includes user ID, email, role, and approval status
- **Security**: HMAC SHA256 signing with shared secret
- **Storage**: HttpOnly cookies with SameSite=Lax and secure path settings
- **Refresh Flow**: Automatic refresh before token expiration
- **Error Handling**: Graceful fallback to login for invalid/expired tokens

### 🧪 Testing
- All services tested and verified working with JWT authentication
- Login/logout flow verified
- Admin functionality tested
- Cross-service authentication validated

### 📋 Migration Steps Completed
1. ✅ Stopped current containers
2. ✅ Updated auth-service with JWT generation
3. ✅ Created shared JWT middleware
4. ✅ Updated all services to use JWT validation
5. ✅ Updated Docker configuration with JWT secrets
6. ✅ Rebuilt and tested all containers
7. ✅ Updated documentation and development guides

### 🔗 Related Documentation
- See `JWT-MIGRATION.md` for detailed technical implementation
- See `MIGRATION-SUMMARY.md` for complete file change list
- See `migrate-to-jwt.sh` for automated setup script
- See `EXAMPLE-NEW-SERVICE.js` for adding JWT to new services

---

## [1.0.0] - 2025-07-30

### Initial Release
- Google OAuth authentication with Express sessions
- PostgreSQL database integration
- Microservices architecture with Docker
- Tailscale public access
- Admin panel and CLI tools
