# Microservices Platform

A microservices-based application suite with Google OAuth authentication, PostgreSQL database, and comprehensive admin panel, designed for Raspberry Pi deployment with public HTTPS access via Tailscale.

## 🚀 Features

- **Google OAuth Authentication** with professional sign-in button following Google's design guidelines
- **JWT Token Authentication** - secure, stateless authentication with httpOnly cookies
- **Three-tier User Management** - approval system (unknown/approved/rejected)
- **PostgreSQL Database** - complete user data persistence with audit trails
- **Web Admin Panel** - full user management interface with statistics and actions
- **CLI Admin Tools** - command-line interface for user management and database operations
- **League of Legends Integration** - Riot Games API integration for account tracking and match loading
- **Admin Analytics** - comprehensive overview of linked accounts across all users
- **Microservices Architecture** with Docker containerization
- **Centralized Authentication** - all auth logic handled by dedicated auth service
- **Public HTTPS Access** - via Tailscale Funnel (no port forwarding required)
- **Caddy Reverse Proxy** - automatic SSL termination and request routing
- **Working Inter-Service Routing** - proper path handling between services
- **JWT Token Management** - 24-hour access tokens with 7-day refresh tokens
- **Account Switching** - forced Google account selection on login
- **Real-time Status Checking** - users can check approval status without page refresh

## 🎯 Current Status (August 2025)

**Latest Updates**:
- ✅ **Match Loading System**: Complete match data loading and management for League of Legends
- ✅ **Summoner Name Display**: Fixed fine displays to show LoL summoner names instead of real names
- ✅ **Delete All Functionality**: Admin can delete all matches with proper confirmation
- ✅ **Routing Fix**: Corrected Express.js route order for proper endpoint matching
- ✅ **Database Integration**: All LoL data properly stored with foreign key relationships

**Production Ready**: All core features functional with proper error handling and user feedback.

## 📋 Usage

1. **Navigate to the landing page**: `http://localhost:3000`
2. **Login with Google** (forced account selection)
3. **Wait for approval** if first-time user (pending page)
4. **Access dashboard** once approved

### Available Applications

Once approved, users have access to:

- **🌍 Hello World App** - Example service demonstrating authentication integration
- **🎮 LoL Tracker** - League of Legends account management and match tracking
  - Link Riot accounts to your profile
  - View linked accounts and statistics
  - Admin panel for viewing all accounts across users
  - **Match Loading** - Load and analyze match history for date ranges (Admin only)OAuth Authentication** with professional sign-in button following Google's design guidelines
- **JWT Token Authentication** - secure, stateless authentication with httpOnly cookies
- **Three-tier User Management** - approval system (unknown/approved/rejected)
- **PostgreSQL Database** - complete user data persistence with audit trails
- **Web Admin Panel** - full user management interface with statistics and actions
- **CLI Admin Tools** - command-line interface for user management and database operations
- **League of Legends Integration** - Riot Games API integration for account tracking and match loading
- **Admin Analytics** - comprehensive overview of linked accounts across all users
- **Microservices Architecture** with Docker containerization
- **Centralized Authentication** - all auth logic handled by dedicated auth service
- **Public HTTPS Access** - via Tailscale Funnel (no port forwarding required)
- **Caddy Reverse Proxy** - automatic SSL termination and request routing
- **Working Inter-Service Routing** - proper path handling between services
- **JWT Token Management** - 24-hour access tokens with 7-day refresh tokens
- **Account Switching** - forced Google account selection on login
- **Real-time Status Checking** - users can check approval status without page refresh

## 🏗️ Architecture

### Services

1. **Caddy Reverse Proxy** (Port 80/443)
   - HTTPS termination and automatic SSL certificates
   - Request routing to internal services
   - Public access via Tailscale Funnel

2. **Auth Service** (Port 3001)
   - Handles Google OAuth flow
   - Manages user approval states (unknown/approved/rejected)
   - Generates and validates JWT tokens
   - Provides centralized authentication endpoints
   - PostgreSQL database integration for user management

3. **Database** (Port 5432)
   - PostgreSQL 16 with persistent data storage
   - User management with audit trails
   - Automatic schema initialization
   - Health checks and connection pooling

4. **Landing Page** (Port 3000)
   - Main entry point and navigation hub
   - Serves authentication pages (login/dashboard/pending/rejected)
   - JWT token validation and routing
   - Stateless design with JWT-based authentication

5. **Hello World App** (Port 3002)
   - Example microservice demonstrating the JWT authentication integration pattern
   - Template for creating new authenticated services
   - Accessible via `/hello/` path through reverse proxy
   - Shows user information with JWT token validation

6. **LoL Tracking Service** (Port 3003)
   - League of Legends account management and game tracking
   - Riot Games API integration for account validation and match data
   - User account linking with PUUID tracking
   - **Match Loading System** - Admin can load match history for specific date ranges
   - **Match Analytics** - View loaded matches with known users and statistics
   - Admin panel for viewing all linked accounts across users
   - Accessible via `/lol/` path through reverse proxy

### Authentication Flow

```
User → Caddy Proxy → Landing Page → JWT Validation → Auth Service → Google OAuth → JWT Generation → Protected Routes
```

### Network Architecture

```
Internet → Tailscale Funnel → Caddy (Port 80) → Internal Services
```

- **External Access**: `https://kl-pi.tail9f5728.ts.net` (public HTTPS)
- **Internal Network**: Docker `app-network` for service communication
- **No Port Forwarding**: Tailscale bypasses CGNAT and ISP restrictions

### User States

- **Unknown**: New users awaiting admin approval → Pending page
- **Approved**: Users granted access → Dashboard with app links
- **Rejected**: Users denied access → Rejection page with logout option

## 🛠️ Setup & Installation

### Prerequisites

- Docker and Docker Compose
- Google OAuth credentials
- Tailscale account (for public access)
- Node.js 18+ (for local development)

### Environment Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd microservices-platform
   ```

2. **Create environment file**
   ```bash
   cp .env.example .env
   ```

3. **Configure Google OAuth**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing
   - Enable Google+ API
   - Create OAuth 2.0 credentials
   - For production with Tailscale Funnel, add authorized redirect URI: 
     `https://your-tailscale-domain.ts.net/auth/google/callback`
   - For local development, add: `http://localhost:3001/auth/google/callback`
   - Copy Client ID and Client Secret to `.env`:
   ```env
   # Production configuration
   GOOGLE_CLIENT_ID=your-google-client-id
   GOOGLE_CLIENT_SECRET=your-google-client-secret
   GOOGLE_CALLBACK_URL=https://your-domain.ts.net/auth/google/callback
   FRONTEND_URL=https://your-domain.ts.net
   BASE_URL=https://your-domain.ts.net
   AUTH_SERVICE_URL=http://auth-service:3001
   
   # Riot Games API (for LoL Tracking Service)
   RIOT_API_KEY=your-riot-api-key-here
   
   # For local development, use:
   # GOOGLE_CALLBACK_URL=http://localhost:3001/auth/google/callback
   # FRONTEND_URL=http://localhost:3000
   # BASE_URL=http://localhost:3000
   ```

4. **Setup Riot Games API (for LoL features)**
   - Visit [Riot Developer Portal](https://developer.riotgames.com/)
   - Create account and generate development API key
   - Add the key to your `.env` file as `RIOT_API_KEY`

5. **Setup Tailscale (for public access)**
   ```bash
   # Install Tailscale
   curl -fsSL https://tailscale.com/install.sh | sh
   
   # Authenticate with your Tailscale account
   sudo tailscale up
   
   # Enable Funnel for port 80
   sudo tailscale funnel 80
   
   # Get your public domain
   tailscale status
   ```

### Running with Docker (Recommended)

1. **Start all services**
   ```bash
   docker compose up --build -d
   ```

2. **Check service status**
   ```bash
   docker compose ps
   ```

3. **View logs**
   ```bash
   docker compose logs -f
   
   # View specific service logs
   docker compose logs -f auth-service
   docker compose logs -f lol-tracking-service
   ```

4. **Access the application**
   - **Local**: http://localhost:3000
   - **Public** (with Tailscale): https://your-domain.ts.net

5. **Stop services**
   ```bash
   docker compose down
   ```

### ⚠️ Important: Container Rebuilding

**When making code changes, containers must be rebuilt to reflect changes!**

```bash
# Rebuild and restart specific service (CORRECT COMMAND)
docker compose up auth-service --build -d
docker compose up lol-tracking-service --build -d
docker compose up landing-page --build -d
docker compose up hello-world-app --build -d

# For major changes or persistent issues, rebuild without cache
docker compose down
docker compose build --no-cache
docker compose up -d

# Quick restart (for minor changes)
docker compose restart service-name
```

### Database Access

**Database Credentials**: 
- Credentials are configured via environment variables in `docker-compose.yml`
- For development: Check the `database` service environment in `docker-compose.yml`
- For production: Use secure credentials and proper secrets management

```bash
# Connect to PostgreSQL database (use credentials from docker-compose.yml)
docker exec -it microservices-platform-database-1 psql -U ${POSTGRES_USER} -d ${POSTGRES_DB}

# Example database queries
docker exec microservices-platform-database-1 psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c "SELECT COUNT(*) as total_users FROM users;"
docker exec microservices-platform-database-1 psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c "SELECT * FROM users WHERE status = 'approved';"
docker exec microservices-platform-database-1 psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c "SELECT COUNT(*) as total_matches FROM lol_matches;"
docker exec microservices-platform-database-1 psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c "SELECT * FROM riot_accounts;"

# View database structure
docker exec microservices-platform-database-1 psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c "\dt"
```

> **🔒 Security Note**: For production deployments, use strong, unique database credentials and proper secrets management. Never commit production credentials to version control.

**Note**: Browser caching can also cause issues. Use hard refresh (Ctrl+F5) or incognito mode when testing changes.

### Running Locally (Development)

1. **Install dependencies for each service**
   ```bash
   # Auth service
   cd auth-service && npm install
   
   # Landing page
   cd ../landing-page && npm install
   
   # Hello world app
   cd ../hello-world-app && npm install
   ```

2. **Start services** (in separate terminals)
   ```bash
   # Terminal 1 - Auth service
   cd auth-service && npm start
   
   # Terminal 2 - Landing page
   cd landing-page && npm start
   
   # Terminal 3 - Hello world app
   cd hello-world-app && npm start
   ```

## � JWT Migration

This project has been migrated from Express sessions to JWT token authentication. If you're upgrading from a previous version:

### Quick Migration
```bash
# Run the automated migration script
./migrate-to-jwt.sh
```

### Manual Migration Steps
1. **Update Dependencies**: JWT packages added to all services
2. **Rebuild Containers**: `docker-compose build --no-cache`
3. **Environment Variables**: JWT_SECRET added to docker-compose.yml
4. **Service Updates**: All services now use JWT middleware

### Key Changes
- **Authentication**: JWT tokens instead of Express sessions
- **Token Storage**: Secure httpOnly cookies with automatic refresh
- **Token Lifetime**: 24-hour access tokens, 7-day refresh tokens
- **Stateless Services**: Independent token validation per service

For detailed migration information, see `JWT-MIGRATION.md`.

## �📋 Usage

1. **Navigate to the landing page**: `http://localhost:3000`
2. **Login with Google** (forced account selection)
3. **Wait for approval** if first-time user (pending page)
4. **Access dashboard** once approved

## 👑 Admin Panel & User Management

### Web Admin Panel

The platform includes a comprehensive web-based admin panel for user management:

**Access**: Available in the dashboard navigation for admin users, or directly at `/admin.html`

**Features**:
- **User Statistics**: Real-time counts of approved, pending, and rejected users
- **User Tables**: Organized by status with search and filtering
- **User Actions**: 
  - Approve/Reject pending users
  - Promote users to admin
  - Demote admin users
  - Delete users permanently
- **Confirmation Dialogs**: All destructive actions require confirmation
- **Real-time Updates**: Tables refresh automatically after actions

### CLI Admin Tools

Use the included admin script for command-line user management:

```bash
# Show database statistics
./admin.sh stats

# List all users
./admin.sh list

# List pending users
./admin.sh pending

# Approve a user
./admin.sh approve user@example.com

# Reject a user
./admin.sh reject user@example.com

# Show user status history
./admin.sh history user@example.com
```

### Direct API Access

Or use the auth service API endpoints directly:

```bash
# View all users (requires admin authentication)
curl http://localhost/auth/admin/users

# Get current user info
curl http://localhost/api/user

# User management endpoints
curl -X PUT http://localhost/auth/admin/users/{id}/approve
curl -X PUT http://localhost/auth/admin/users/{id}/reject
curl -X PUT http://localhost/auth/admin/users/{id}/promote
curl -X PUT http://localhost/auth/admin/users/{id}/demote
curl -X DELETE http://localhost/auth/admin/users/{id}
```

### User Management (Admin)

Use the included admin script for easy user management:

```bash
# View all users
curl http://localhost:3001/admin/users

# Approve a user
curl -X POST http://localhost:3001/admin/approve/user@example.com

# Reject a user
curl -X POST http://localhost:3001/admin/reject/user@example.com
```

### User Actions

- **Check Status**: Users on pending page can check if they've been approved
- **Logout**: Available on all authenticated pages
- **Account Switching**: Login forces Google account selection

## 🌐 Production Status

The platform is currently deployed and accessible at:

**🔗 Live Demo**: https://kl-pi.tail9f5728.ts.net

### Current Configuration
- **Platform**: Raspberry Pi 4
- **Network**: Tailscale Funnel (bypasses CGNAT)
- **SSL**: Automatic HTTPS via Caddy
- **Authentication**: Google OAuth 2.0 with professional sign-in button
- **Routing**: Fully functional inter-service communication
- **Status**: ✅ Fully Operational

### Recent Updates (August 2025)
- ✅ **Professional Google Sign-in Button** - Official Google "G" logo with proper branding
- ✅ **Working Service Routing** - Hello World app accessible via dashboard
- ✅ **Authentication Integration** - Proper auth checks across all services
- ✅ **Path Handling** - Correct Caddy reverse proxy configuration with path stripping

### Architecture Highlights
- No port forwarding required (Tailscale handles external access)
- Automatic SSL certificate management
- Containerized microservices with Docker
- JWT-based authentication with token persistence

## 🔗 API Endpoints

### Auth Service (Port 3001)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/auth/google` | Initiate Google OAuth |
| GET | `/auth/google/callback` | OAuth callback |
| GET | `/check-auth` | Check authentication status (legacy) |
| POST | `/auth/refresh` | Refresh JWT tokens |
| POST | `/logout` | Logout and clear JWT tokens |
| GET | `/admin/users` | View all users (admin) |
| POST | `/admin/approve/:email` | Approve user (admin) |
| POST | `/admin/reject/:email` | Reject user (admin) |

### Landing Page (Port 3000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Main landing page (login or dashboard) |
| GET | `/api/user` | Get user info (proxy to auth service) |
| GET | `/api/status` | Check auth status (proxy to auth service) |
| POST | `/logout` | Logout (proxy to auth service) |

### Hello World App (Port 3002)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/` | Hello World application | Yes (approved users) |
| GET | `/api/message` | Get random greeting message | Yes (approved users) |
| GET | `/health` | Service health check | No |

**Access via Reverse Proxy**: `https://kl-pi.tail9f5728.ts.net/hello/`

## 📁 Project Structure

```
microservices-platform/
├── auth-service/              # Authentication microservice
│   ├── data/                  # JWT secret storage
│   │   └── jwt.secret        # JWT signing secret
│   ├── database.js           # Database service layer
│   ├── server.js
│   ├── package.json
│   └── Dockerfile
├── landing-page/              # Main navigation service
│   ├── public/                # Static HTML files
│   │   ├── login.html
│   │   ├── dashboard.html
│   │   ├── pending.html
│   │   ├── rejected.html
│   │   └── jwt-auth.js       # Frontend JWT utilities
│   ├── server.js
│   ├── jwt-middleware.js     # Local JWT middleware
│   ├── package.json
│   └── Dockerfile
├── hello-world-app/           # Example microservice
│   ├── server.js
│   ├── jwt-middleware.js     # Local JWT middleware
│   ├── package.json
│   └── Dockerfile
├── database/                  # Database schema and initialization
│   └── init.sql              # PostgreSQL schema and initial data
├── jwt-middleware.js          # Shared JWT middleware template
├── admin.sh                  # Database administration script
├── migrate-to-jwt.sh         # JWT migration script
├── docker-compose.yml         # Multi-container orchestration
├── .env.example               # Environment template
├── JWT-MIGRATION.md          # JWT migration documentation
├── MIGRATION-SUMMARY.md      # Migration changes summary
├── CHANGELOG.md              # Version history and changes
├── EXAMPLE-NEW-SERVICE.js    # Template for new JWT services
├── .gitignore
└── README.md
```

## 🐳 Docker Configuration

- **Custom Network**: `app-network` for inter-service communication
- **Volume Mounting**: Persistent data storage for user management
- **Environment Variables**: Centralized configuration
- **Health Checks**: Service monitoring and dependency management

### Container Details

| Service | Port | Image | Purpose |
|---------|------|-------|---------|
| database | 5432 | PostgreSQL 16 Alpine | User data and authentication |
| auth-service | 3001 | Node.js 18 Alpine | OAuth & user management |
| landing-page | 3000 | Node.js 18 Alpine | Main navigation |
| hello-world-app | 3002 | Node.js 18 Alpine | Example microservice |

## 🔧 Development

### Adding New Microservices

1. Create new service directory
2. Add `package.json` and `server.js`
3. Create `Dockerfile`
4. Add service to `docker-compose.yml`
5. Update auth integration if needed

### File Persistence

- PostgreSQL database data persists in Docker volume `postgres_data`
- JWT secrets persist in `auth-service/data/jwt.secret` file
- Docker volumes ensure data survives container restarts
- Database includes automatic backups and audit trails

## 🚀 Deployment

### Production Considerations

- Set secure JWT secrets in production
- Use environment-specific Google OAuth credentials
- Configure proper reverse proxy (nginx)
- Set up SSL/TLS certificates
- Monitor container health and logs

### 🔒 Security Best Practices

**Database Security:**
- Never use default credentials in production
- Use strong, unique database passwords (minimum 16 characters)
- Implement database connection encryption (SSL/TLS)
- Regularly rotate database credentials
- Use secrets management systems (e.g., Docker Secrets, Kubernetes Secrets, HashiCorp Vault)

**Environment Variables:**
- Store sensitive credentials in environment variables or secrets management
- Never commit production credentials to version control
- Use different credentials for development, staging, and production
- Implement proper access controls for environment variable access

**JWT Security:**
- Generate cryptographically secure JWT secrets (256+ bits)
- Rotate JWT secrets regularly
- Use appropriate token expiration times
- Implement proper token validation and error handling

**Network Security:**
- Use firewalls to restrict database access
- Implement network segmentation
- Use VPNs or private networks for database connections
- Enable audit logging for database access

### Environment Variables

Required for production:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET` 
- `GOOGLE_CALLBACK_URL`
- `FRONTEND_URL`
- `AUTH_SERVICE_URL`
- `DATABASE_URL` (with secure credentials)
- `RIOT_API_KEY` (for LoL Tracking Service)
- `POSTGRES_USER` (secure username)
- `POSTGRES_PASSWORD` (strong password)
- `POSTGRES_DB` (database name)

## 📝 License

This project is open source and available under the [MIT License](LICENSE).

## 👥 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 🔍 Troubleshooting

### Common Issues

- **OAuth not working**: Check Google Cloud Console configuration
- **Services not communicating**: Verify Docker network and service names
- **JWT token issues**: Check if jwt.secret file exists and JWT_SECRET environment variable is set
- **Port conflicts**: Ensure ports 3000-3002 are available

### Debug Commands

```bash
# Check container logs
docker-compose logs auth-service
docker-compose logs landing-page
docker-compose logs hello-world-app

# Test service connectivity
curl http://localhost:3001/check-auth
curl http://localhost:3000/
curl http://localhost:3002/
```
