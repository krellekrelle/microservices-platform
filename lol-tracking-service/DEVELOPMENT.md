# LoL Tracking Service - Development Guide

## 🎯 Service Overview

**Purpose**: League of Legends account management and game tracking  
**Port**: 3003  
**Role**: Manage Riot accounts for authenticated users, track game data  
**Dependencies**: auth-service, PostgreSQL database, Riot Games API  
**Security**: Admin-only access with route-based protection (express.static removed for security)

## 🛡️ Security Architecture

**Admin-Only Pattern**: This service implements strict admin access control:

- ❌ **Removed**: `app.use(express.static())` - bypassed authentication completely
- ✅ **Added**: `checkAuth` middleware for user endpoints requiring approved status
- ✅ **Added**: `checkAdmin` middleware for admin endpoints requiring admin privileges
- ✅ **Added**: Protected `/static` route for authenticated asset serving
- ✅ **Added**: Redirect handling to landing page instead of JSON errors for better UX  

## 🏗️ Architecture Role

The lol-tracking-service extends the platform with LoL-specific functionality:
- **Riot Account Management**: Link summoner accounts to platform users
- **Game Data Tracking**: Fetch and store match history and statistics
- **Fine System**: Calculate penalties based on game performance
- **User Statistics**: Provide insights and leaderboards

## 📁 File Structure

```
lol-tracking-service/
├── server.js              # Main application logic
├── package.json           # Dependencies and scripts
├── Dockerfile            # Container configuration
└── DEVELOPMENT.md        # This documentation
```

## � Development Commands

### Docker Management
```bash
# Rebuild and restart lol-tracking service
docker compose up lol-tracking-service --build -d

# View service logs
docker compose logs -f lol-tracking-service

# Stop service
docker compose stop lol-tracking-service

# Full rebuild (if having issues)
docker compose down
docker compose up lol-tracking-service --build -d
```

### Database Access
```bash
# Connect to PostgreSQL database
docker exec -it microservices-platform-database-1 psql -U ${POSTGRES_USER} -d ${POSTGRES_DB}

# Check riot accounts
docker exec microservices-platform-database-1 psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c "SELECT * FROM riot_accounts;"

# Check matches count
docker exec microservices-platform-database-1 psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c "SELECT COUNT(*) as total_matches FROM lol_matches;"

# Check matches with known users
docker exec microservices-platform-database-1 psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c "SELECT * FROM lol_matches_with_users LIMIT 10;"

# Check fines
docker exec microservices-platform-database-1 psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c "SELECT * FROM lol_fines ORDER BY date DESC LIMIT 10;"

# Database structure overview
docker exec microservices-platform-database-1 psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c "\dt lol*"
```

### Database Credentials
- **Configuration**: Database credentials are defined in `docker-compose.yml`
- **Development**: Check the `database` service environment variables
- **Production**: Use secure credentials via environment variables
- **Host**: `database` (within Docker network)
- **Port**: 5432

### API Testing
```bash
# Test service health
curl http://localhost:3003/health

# Test via reverse proxy
curl https://kl-pi.tail9f5728.ts.net/lol/health
```

## �🔧 Core Functionality

### 1. Authentication Integration
```javascript
const checkAuth = async (req, res, next) => {
    const authResponse = await fetch(`${process.env.AUTH_SERVICE_URL}/check-auth`, {
        headers: { 'Cookie': req.headers.cookie || '' }
    });
    
    const authData = await authResponse.json();
    
    if (!authData.authenticated || authData.userStatus !== 'approved') {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    req.user = authData.user;
    next();
};
```

### 2. Riot API Integration
```javascript
const getRiotAccountByRiotId = async (gameName, tagLine, region = 'europe') => {
    const url = `${RIOT_API_BASE[region]}/riot/account/v1/accounts/by-riot-id/${gameName}/${tagLine}`;
    
    const response = await fetch(url, {
        headers: { 'X-Riot-Token': process.env.RIOT_API_KEY }
    });
    
    return await response.json();
};
```

### 3. Database Operations
- **Add Account**: Validates via Riot API, prevents duplicates
- **List Accounts**: Shows user's linked Riot accounts
- **Remove Account**: Soft delete (sets is_active = false)

## 🔗 API Endpoints

### Core Endpoints
| Method | Endpoint | Purpose | Auth Required |
|--------|----------|---------|---------------|
| GET | `/health` | Service health check | No |
| GET | `/riot-accounts` | List user's Riot accounts | Yes |
| POST | `/riot-accounts` | Add new Riot account | Yes |
| DELETE | `/riot-accounts/:id` | Remove Riot account | Yes |
| GET | `/riot-accounts/:id` | Get account details | Yes |

### Request/Response Examples

**Add Riot Account**:
```json
POST /riot-accounts
{
    "summonerName": "YourSummoner",
    "summonerTag": "EUW",
    "region": "europe"
}

Response:
{
    "success": true,
    "message": "Riot account added successfully",
    "account": {
        "id": 1,
        "puuid": "abc123...",
        "summoner_name": "YourSummoner",
        "summoner_tag": "EUW",
        "region": "europe",
        "created_at": "2025-08-03T..."
    }
}
```

## 🔧 Environment Variables

### Required Variables
```env
# Service Configuration
PORT=3003
AUTH_SERVICE_URL=http://auth-service:3001
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@database:5432/${POSTGRES_DB}

# Riot Games API
RIOT_API_KEY=your_riot_api_key_here
```

### Riot API Key Setup
1. Visit [Riot Developer Portal](https://developer.riotgames.com/)
2. Create an account and generate an API key
3. Add the key to your environment variables

## 💾 Database Schema

### Tables Used
- **users**: Existing user table (referenced by user_id)
- **riot_accounts**: New table for Riot account data

### Key Fields
- **puuid**: Riot's permanent unique identifier
- **summoner_name**: Current summoner name
- **summoner_tag**: Riot ID tag (e.g., "EUW")
- **user_id**: Links to platform user
- **is_active**: Soft delete flag

## 🔄 Business Logic

### Account Linking Flow
1. User provides summoner name and tag
2. Service queries Riot API to validate account
3. Checks for existing links (prevents duplicates)
4. Stores account data with user association

### Data Validation
- **Riot API Validation**: Ensures account exists
- **Duplicate Prevention**: One account per platform user
- **User Authorization**: Users can only manage their own accounts

## 🐳 Docker Integration

Add to your `docker-compose.yml`:
```yaml
lol-tracking-service:
  build: ./lol-tracking-service
  ports:
    - "3003:3003"
  environment:
    - PORT=3003
    - AUTH_SERVICE_URL=http://auth-service:3001
    - DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@database:5432/${POSTGRES_DB}
    - RIOT_API_KEY=${RIOT_API_KEY}
  depends_on:
    - auth-service
    - database
  networks:
    - app-network
```

## 🧪 Testing

### Manual Testing
```bash
# Health check
curl http://localhost:3003/health

# List accounts (requires auth cookie)
curl -b "connect.sid=..." http://localhost:3003/riot-accounts

# Add account
curl -X POST -H "Content-Type: application/json" \
  -b "connect.sid=..." \
  -d '{"summonerName":"TestUser","summonerTag":"EUW"}' \
  http://localhost:3003/riot-accounts
```

## 🚀 Next Steps

### Phase 2: Match Data
- Fetch match history from Riot API
- Store match data in database
- Calculate statistics and performance metrics

### Phase 3: Fine System
- Implement fine calculation rules
- Track ARAM wins/losses, champion picks
- Generate fine reports and leaderboards

### Phase 4: Real-time Updates
- Background jobs for match synchronization
- WebSocket updates for live data
- Notification system for fines

---

**Last Updated**: August 3, 2025  
**Service Version**: v1.0 (Basic Account Management)
