# Microservices Platform

A microservices-based application suite with Google OAuth authentication, designed for Raspberry Pi deployment with public HTTPS access via Tailscale.

## 🚀 Features

- **Google OAuth Authentication** with three-tier approval system (unknown/approved/rejected)
- **Microservices Architecture** with Docker containerization
- **Centralized Authentication** - all auth logic handled by dedicated auth service
- **Public HTTPS Access** - via Tailscale Funnel (no port forwarding required)
- **Caddy Reverse Proxy** - automatic SSL termination and request routing
- **User Management** - file-based user approval system for admins
- **Session Management** - auto-generated session secrets with persistence
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
   - Provides centralized authentication endpoints
   - Auto-generates and persists session secrets

3. **Landing Page** (Port 3000)
   - Main entry point and navigation hub
   - Serves authentication pages (login/dashboard/pending/rejected)
   - Proxies all auth requests to auth service
   - Stateless design - all auth logic delegated to auth service

4. **Hello World App** (Port 3002)
   - Example microservice demonstrating the architecture
   - Shows how to integrate with the auth system

### Authentication Flow

```
User → Caddy Proxy → Landing Page → Auth Service → Google OAuth → User Management → Appropriate Page
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
   
   # For local development, use:
   # GOOGLE_CALLBACK_URL=http://localhost:3001/auth/google/callback
   # FRONTEND_URL=http://localhost:3000
   # BASE_URL=http://localhost:3000
   ```

4. **Setup Tailscale (for public access)**
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
   docker-compose up --build -d
   ```

2. **Check service status**
   ```bash
   docker-compose ps
   ```

3. **View logs**
   ```bash
   docker-compose logs -f
   ```

4. **Access the application**
   - **Local**: http://localhost:3000
   - **Public** (with Tailscale): https://your-domain.ts.net

5. **Stop services**
   ```bash
   docker-compose down
   ```

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

## 📋 Usage

1. **Navigate to the landing page**: `http://localhost:3000`
2. **Login with Google** (forced account selection)
3. **Wait for approval** if first-time user (pending page)
4. **Access dashboard** once approved

### User Management (Admin)

Use the auth service API endpoints to manage users:

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
- **Authentication**: Google OAuth 2.0
- **Status**: ✅ Fully Operational

### Architecture Highlights
- No port forwarding required (Tailscale handles external access)
- Automatic SSL certificate management
- Containerized microservices with Docker
- Centralized authentication with session persistence

## 🔗 API Endpoints

### Auth Service (Port 3001)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/auth/google` | Initiate Google OAuth |
| GET | `/auth/google/callback` | OAuth callback |
| GET | `/check-auth` | Check authentication status |
| POST | `/logout` | Logout and clear session |
| GET | `/admin/users` | View all users (admin) |
| POST | `/admin/approve/:email` | Approve user (admin) |
| POST | `/admin/reject/:email` | Reject user (admin) |

### Landing Page (Port 3000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Main landing page |
| GET | `/check-auth` | Check auth (proxy to auth service) |
| POST | `/logout` | Logout (proxy to auth service) |

## 📁 Project Structure

```
microservices-platform/
├── auth-service/              # Authentication microservice
│   ├── data/                  # User management files
│   │   ├── approved_logins.json
│   │   ├── rejected_logins.json
│   │   ├── unknown_logins.json
│   │   └── session.secret
│   ├── server.js
│   ├── package.json
│   └── Dockerfile
├── landing-page/              # Main navigation service
│   ├── public/                # Static HTML files
│   │   ├── login.html
│   │   ├── dashboard.html
│   │   ├── pending.html
│   │   └── rejected.html
│   ├── server.js
│   ├── package.json
│   └── Dockerfile
├── hello-world-app/           # Example microservice
│   ├── server.js
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml         # Multi-container orchestration
├── .env.example               # Environment template
├── .gitignore
├── DOCKER.md                  # Docker commands reference
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

- User data persists in `auth-service/data/`
- Session secrets auto-generate and persist
- Docker volumes ensure data survives container restarts

## 🚀 Deployment

### Production Considerations

- Set secure session secrets in production
- Use environment-specific Google OAuth credentials
- Configure proper reverse proxy (nginx)
- Set up SSL/TLS certificates
- Monitor container health and logs

### Environment Variables

Required for production:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALLBACK_URL`
- `FRONTEND_URL`
- `AUTH_SERVICE_URL`

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
- **Session issues**: Check if session.secret file exists and is readable
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
