# Personal Project Application SuiteA microservices-based application suite with Google OAuth authentication, designed for Raspberry Pi deployment.## 🚀 Features- **Google OAuth Authentication** with three-tier approval system (unknown/approved/rejected)- **Microservices Architecture** with Docker containerization- **Centralized Authentication** - all auth logic handled by dedicated auth service- **User Management** - file-based user approval system for admins- **Session Management** - auto-generated session secrets with persistence- **Account Switching** - forced Google account selection on login- **Real-time Status Checking** - users can check approval status without page refresh## 🏗️ Architecture### Services1. **Auth Service** (Port 3001)   - Handles Google OAuth flow   - Manages user approval states (unknown/approved/rejected)   - Provides centralized authentication endpoints   - Auto-generates and persists session secrets2. **Landing Page** (Port 3000)   - Main entry point and navigation hub   - Serves authentication pages (login/dashboard/pending/rejected)   - Proxies all auth requests to auth service   - Stateless design - all auth logic delegated to auth service3. **Hello World App** (Port 3002)   - Example microservice demonstrating the architecture   - Shows how to integrate with the auth system### Authentication Flow```User → Landing Page → Auth Service → Google OAuth → User Management → Appropriate Page```### User States- **Unknown**: New users awaiting admin approval → Pending page- **Approved**: Users granted access → Dashboard with app links- **Rejected**: Users denied access → Rejection page with logout option## 🛠️ Setup & Installation### Prerequisites- Docker and Docker Compose- Google OAuth credentials- Node.js 18+ (for local development)### Environment Setup1. **Clone the repository**   ```bash   git clone <repository-url>   cd personal-project   ```2. **Create environment file**   ```bash   cp .env.example .env   ```3. **Configure Google OAuth**   - Go to [Google Cloud Console](https://console.cloud.google.com/)   - Create a new project or select existing   - Enable Google+ API   - Create OAuth 2.0 credentials   - Add authorized redirect URI: `http://localhost:3001/auth/google/callback`   - Copy Client ID and Client Secret to `.env`:   ```env   GOOGLE_CLIENT_ID=your-google-client-id   GOOGLE_CLIENT_SECRET=your-google-client-secret   GOOGLE_CALLBACK_URL=http://localhost:3001/auth/google/callback   FRONTEND_URL=http://localhost:3000   AUTH_SERVICE_URL=http://auth-service:3001   ```### Running with Docker (Recommended)1. **Start all services**   ```bash   docker-compose up --build -d   ```2. **Check service status**   ```bash   docker-compose ps   ```3. **View logs**   ```bash   docker-compose logs -f   ```4. **Stop services**   ```bash   docker-compose down   ```### Running Locally (Development)1. **Install dependencies for each service**   ```bash   # Auth service   cd auth-service && npm install      # Landing page
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

### Accessing the Application

1. **Visit** `http://localhost:3000`
2. **Login** with Google account
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
- **Account Switching**: Logout and login to switch Google accounts

## 🔧 API Endpoints

### Auth Service (Port 3001)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Service health check |
| GET | `/check-auth` | Comprehensive auth status check |
| GET | `/auth/status` | Authentication status |
| GET | `/auth/google` | Start Google OAuth flow |
| GET | `/auth/google/callback` | Google OAuth callback |
| POST | `/logout` | Logout user |
| GET | `/admin/users` | Get all users (admin) |
| POST | `/admin/approve/:email` | Approve user (admin) |
| POST | `/admin/reject/:email` | Reject user (admin) |

### Landing Page (Port 3000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Main entry point |
| GET | `/dashboard` | Dashboard page (approved users) |
| GET | `/pending` | Pending approval page |
| GET | `/rejected` | Rejection page |
| GET | `/api/user` | Get user info |
| GET | `/api/status` | Check user status |
| POST | `/logout` | Logout (proxy to auth service) |

## 📁 Project Structure

```
personal-project/
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
├── .env.example              # Environment template
├── .gitignore
├── DOCKER.md                 # Docker commands reference
└── README.md
```

## 🐳 Docker Configuration

- **Custom Network**: `app-network` for inter-service communication
- **Volume Mounting**: Persistent data storage for user management
- **Environment Variables**: Centralized configuration
- **Health Checks**: Service monitoring and dependency management

## 🔒 Security Features

- **Session Security**: Auto-generated cryptographic session secrets
- **CORS Configuration**: Proper cross-origin request handling
- **Cookie Security**: Secure session cookie management
- **OAuth Security**: Google OAuth 2.0 with proper redirect validation

## 🚧 Future Enhancements

- **NATS Integration**: Message queue for inter-service communication
- **Caddy Reverse Proxy**: Production-ready load balancing and SSL
- **Chat Application**: Real-time messaging between approved users
- **Database Integration**: Replace JSON files with proper database
- **Admin Dashboard**: Web interface for user management
- **Rate Limiting**: API protection against abuse
- **Logging System**: Centralized logging with log aggregation

## 🐛 Troubleshooting

### Common Issues

1. **Port conflicts**: Ensure ports 3000, 3001, 3002 are available
2. **Google OAuth errors**: Check redirect URI configuration
3. **Docker networking**: Services communicate via service names, not localhost
4. **Session issues**: Clear browser cookies and restart services

### Debug Commands

```bash
# Check container logs
docker-compose logs auth-service
docker-compose logs landing-page

# Access container shell
docker-compose exec auth-service sh

# Restart specific service
docker-compose restart auth-service
```

## 📝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 🙏 Acknowledgments

- Google OAuth for authentication
- Docker for containerization
- Node.js and Express for microservices
- The open source community

---

**Happy coding!** 🎉