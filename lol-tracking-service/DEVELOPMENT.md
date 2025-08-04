# LoL Tracking Service - Development Guide

## 🎯 Service Overview

**Purpose**: League of Legends match tracking with automated background synchronization and intelligent fine calculation  
**Port**: 3003  
**Role**: Comprehensive LoL match data management with real-time sync and automated fine processing  
**Dependencies**: auth-service, PostgreSQL database, Riot Games API  
**Security**: Multi-tier access control (user/admin) with protected routes

## � Key Features

### Background Sync System
- **Automatic Match Loading**: Runs every 30 minutes to fetch new matches
- **Historical Backfill**: Processes matches from June 2024 onwards for new accounts
- **Gap Recovery**: Automatically catches up on missed matches after server restarts
- **Rate Limiting**: Conservative API usage (80 requests per 2 minutes) to respect Riot limits
- **Error Handling**: Automatic retry logic with exponential backoff

### Intelligent Fine Calculation
- **Automated Processing**: Fines calculated immediately when new matches are loaded
- **Multiple Account Detection**: Prevents double fines when users have multiple accounts in the same match
- **Game Mode Specific**: Different fine rules for ARAM, URF, Nexus Blitz, and normal games
- **Historical Exclusion**: No fines applied to matches before June 2024

### Admin Features
- **Real-time Monitoring**: Sync status dashboard with live updates
- **Manual Controls**: Trigger sync cycles and reset account status
- **Match Management**: View, filter, and manage matches with bulk operations
- **Fine Administration**: Calculate and review fines with detailed breakdowns

## 🏗️ Architecture Overview

### Background Sync Manager
```javascript
class MatchSyncManager {
    constructor() {
        this.isRunning = false;
        this.rateLimit = new RateLimit(80, 120000); // 80 req/2min
    }
    
    async startBackgroundSync() {
        // Runs every 30 minutes
        setInterval(() => this.runSyncCycle(), 30 * 60 * 1000);
        
        // Initial run after 10 seconds
        setTimeout(() => this.runSyncCycle(), 10000);
    }
    
    async runSyncCycle() {
        // 1. Historical backfill for incomplete accounts
        await this.runHistoricalBackfill();
        
        // 2. Recent match sync for completed accounts
        await this.runOngoingSync();
        
        // 3. Calculate fines for new matches
        await this.calculatePendingFines();
    }
}
```

### Database Schema Extensions

#### Match Sync Tracking
```sql
CREATE TABLE match_sync_status (
    account_id INTEGER PRIMARY KEY REFERENCES riot_accounts(id),
    last_sync_timestamp BIGINT NOT NULL,
    sync_status VARCHAR(20) DEFAULT 'pending',
    backfill_complete BOOLEAN DEFAULT FALSE,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Automatic sync status creation for new accounts
CREATE OR REPLACE FUNCTION create_match_sync_status()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO match_sync_status (account_id, last_sync_timestamp)
    VALUES (NEW.id, EXTRACT(EPOCH FROM TIMESTAMP '2024-06-01 00:00:00') * 1000);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_match_sync_status
    AFTER INSERT ON riot_accounts
    FOR EACH ROW
    EXECUTE FUNCTION create_match_sync_status();
```

#### Enhanced Match Data
```sql
-- Core match information
CREATE TABLE lol_matches (
    match_id VARCHAR(20) PRIMARY KEY,
    game_creation BIGINT,
    game_duration INTEGER,
    game_mode VARCHAR(20),
    queue_id INTEGER,
    fines_calculated BOOLEAN DEFAULT FALSE,
    loaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Detailed participant data
CREATE TABLE lol_participants (
    id SERIAL PRIMARY KEY,
    match_id VARCHAR(20) REFERENCES lol_matches(match_id),
    puuid VARCHAR(78),
    summoner_name VARCHAR(50),
    champion_name VARCHAR(30),
    kills INTEGER,
    deaths INTEGER,
    assists INTEGER,
    win BOOLEAN,
    lane VARCHAR(20),
    role VARCHAR(20),
    team_position VARCHAR(20)
);

-- Fine tracking
CREATE TABLE lol_fines (
    id SERIAL PRIMARY KEY,
    match_id VARCHAR(20) REFERENCES lol_matches(match_id),
    user_id INTEGER REFERENCES users(id),
    fine_type VARCHAR(20) NOT NULL,
    fine_size INTEGER NOT NULL,
    date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

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

**Last Updated**: August 4, 2025  
**Service Version**: v2.1 (Enhanced Match Management & Fine Status)

## 🆕 Recent Enhancements (v2.1)

### Enhanced Fine Status Display
- **Intelligent Fine Reasons**: Match details now show specific reasons why no fines were applied
- **Date-Based Logic**: Matches before June 2024 show "before fine system" messages
- **Team Analysis**: Displays when known users are on different teams
- **Participant Requirements**: Shows when insufficient known users participated
- **Database Connection Fix**: Resolved double client release issue in fine calculation

### Match Management Improvements
- **Expandable Match Details**: Click any match row to see detailed team compositions
- **Role-Based Display**: Ranked matches show proper lane assignments (Top, Jungle, Mid, Bot, Support)
- **Fine Status Integration**: Real-time loading of fine calculation reasons in match details
- **Enhanced Error Handling**: Better database connection management and error reporting

### Technical Fixes
- **PostgreSQL Connection Pooling**: Fixed client release lifecycle in `calculateFinesForMatch`
- **API Response Consistency**: Standardized response structure for fine calculation endpoints
- **Frontend-Backend Integration**: Improved fine status loading with proper response handling
- **URL Routing Consistency**: Fixed routing prefix issues across admin endpoints

### API Enhancements
- **POST /admin/matches/:matchId/calculate-fines**: Now returns detailed reasons for fine decisions
- **Enhanced Response Structure**: Includes `success`, `reason`, and `finesApplied` fields
- **Better Error Messages**: More descriptive error responses for debugging

## 🆕 Latest Major Update (v3.0): Background Sync System

### Automated Match Synchronization
- **Background Processing**: Comprehensive match sync system running every 30 minutes
- **Historical Backfill**: Automatically processes matches from June 2024 onwards
- **Gap Recovery**: Catches up on missed matches after server restarts without data loss
- **Rate Limiting**: Conservative API usage (80 requests per 2 minutes) respecting Riot limits

### Enhanced Database Schema
```sql
-- New sync tracking table
CREATE TABLE match_sync_status (
    account_id INTEGER PRIMARY KEY REFERENCES riot_accounts(id),
    last_sync_timestamp BIGINT NOT NULL,
    sync_status VARCHAR(20) DEFAULT 'pending',
    backfill_complete BOOLEAN DEFAULT FALSE,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Automatic trigger for new accounts
CREATE TRIGGER trigger_create_match_sync_status
    AFTER INSERT ON riot_accounts
    FOR EACH ROW
    EXECUTE FUNCTION create_match_sync_status();
```

### Admin Monitoring Dashboard
- **Real-time Status**: Live sync progress monitoring at `/lol/admin/sync-status-page`
- **Manual Controls**: Trigger sync cycles and reset account status
- **Error Tracking**: Comprehensive error reporting and resolution
- **Progress Visualization**: Summary cards and detailed account tables

### Background Sync Manager Architecture
```javascript
class MatchSyncManager {
    constructor() {
        this.isRunning = false;
        this.requestCount = 0;
        this.maxRequestsPerWindow = 80; // Conservative rate limit
        this.requestWindow = 120000; // 2 minutes
    }

    async runSyncCycle() {
        if (this.isRunning) return;
        
        try {
            this.isRunning = true;
            
            // 1. Historical backfill for accounts that need it
            await this.runHistoricalBackfill();
            
            // 2. Ongoing sync for completed accounts
            await this.runOngoingSync();
            
            // 3. Calculate fines for new matches
            await this.calculatePendingFines();
            
        } finally {
            this.isRunning = false;
        }
    }
}
```

### Smart Fine Calculation
- **Multiple Account Detection**: Prevents double fines when users have multiple accounts in same match
- **Historical Awareness**: Excludes matches before June 2024 from fine system
- **Immediate Processing**: Fines calculated automatically for newly loaded matches
- **Detailed Reporting**: Clear reasons provided for all fine decisions

### Performance Optimizations
- **Database Indexing**: Optimized queries for large match datasets
- **Connection Pooling**: Efficient database connection management
- **Error Isolation**: Individual account failures don't affect others
- **Memory Management**: Efficient processing of large match batches

### Migration and Deployment
- **Automatic Migration**: Database schema updates on container startup
- **Backward Compatibility**: Handles existing data gracefully
- **Zero Downtime**: Background sync starts automatically after brief delay
- **Docker Integration**: Seamless integration with existing compose setup
