# Training Peaks Service - Development Guide

## 🎯 Service Overview

**Purpose**: TrainingPeaks weekly training schedule scraping and calendar integration service  
**Port**: 3005  
**Role**: Automated training schedule extraction with multi-phase implementation  
**Dependencies**: auth-service, PostgreSQL database, Playwright for web scraping  
**Security**: User-level access (each user manages their own TrainingPeaks credentials)  
**Target Calendar**: Apple Calendar integration for Phase 2

## 📊 Current Implementation Status

**Phase 1**: ✅ **COMPLETE** - TrainingPeaks scraping and data storage  
**Phase 2**: ✅ **MOSTLY COMPLETE** - Calendar integration (manual ICS import)  
**Phase 3**: 🔄 **PLANNED** - Garmin Connect integration  

**Latest Update (Sept 4, 2025)**: Phase 2 calendar integration is functionally complete with ICS file generation, calendar settings, and proper event creation. The only missing component is automatic CalDAV sync - users currently need to download and manually import ICS files into their calendar applications.

## 🚀 Implementation Phases

### Phase 1: TrainingPeaks Scraping ✅ TARGET
- **Web Scraping**: Playwright-based scraping of weekly training schedules
- **Schedule Parsing**: Extract training descriptions from TrainingPeaks interface
- **Data Storage**: Store training sessions with descriptions in PostgreSQL
- **User-specific**: Each user maintains their own training data
- **Weekly Automation**: Automated Sunday schedule retrieval

**Example Training Description**:
```
4 km opvarmning
4x 100 meter flowløb
3x 1 km 4.05- 4.15
200 meter jog imellem
2x 2 km 4.05- 4.15
3 min pause imellem
4 km nedløb
```

### Phase 2: Apple Calendar Integration ✅ MOSTLY COMPLETE
- **ICS File Generation**: ✅ Complete - Generates single ICS file with all training sessions
- **Calendar Settings**: ✅ Complete - User preferences for time, location, timezone
- **Event Creation**: ✅ Complete - Training events with full descriptions and proper durations
- **Frontend Interface**: ✅ Complete - Calendar setup and download functionality
- **Database Integration**: ✅ Complete - Calendar sync tracking and user settings
- **Missing**: 🔄 Automatic CalDAV sync (currently requires manual ICS file import)

**Current Status**: Phase 2 is functionally complete for manual calendar integration. Users can:
- Configure calendar preferences (default time, location, timezone)
- Generate ICS files containing all weekly training sessions
- Import ICS files into Apple Calendar or other calendar applications
- Track calendar sync history and statistics

**Remaining Work**: Implement automatic CalDAV protocol integration to eliminate the need for manual file download and import.

### Phase 3: Garmin Integration 🔄 PLANNED
- **Garmin Connect**: API integration with Garmin Training platform
- **Workout Creation**: Automatic structured workout creation from training descriptions
- **Watch Sync**: Automatic upload to connected Garmin devices
- **Training Plans**: Long-term training plan management and synchronization

## 🏗️ Architecture Overview

### Service Components
```
training-peaks-service/
├── server.js                    # Main Express application
├── package.json                 # Dependencies and scripts
├── Dockerfile                   # Container configuration
├── DEVELOPMENT.md               # This file
├── middleware/
│   ├── auth.js                  # JWT authentication middleware (copied from platform)
│   └── playwright.js            # Browser automation middleware
├── services/
│   ├── scraper.js              # TrainingPeaks scraping logic
│   ├── parser.js               # Training description parsing
│   ├── scheduler.js            # Weekly automation scheduler
│   └── storage.js              # Database operations
├── db/
│   ├── database.js             # PostgreSQL connection and schema
│   └── migrations/             # Database migration scripts
├── routes/
│   ├── api.js                  # API endpoints for training data
│   ├── admin.js                # Admin panel for user management
│   └── scraping.js             # Scraping control endpoints
└── public/
    ├── index.html              # Main dashboard
    ├── setup.html              # TrainingPeaks credentials setup
    ├── training-schedule.html  # Weekly schedule view
    ├── training-peaks.css      # Service-specific styling
    └── training-peaks.js       # Frontend JavaScript logic
```

## 🔧 Technical Implementation

### 1. TrainingPeaks Scraping Engine
```javascript
// services/scraper.js
class TrainingPeaksScraper {
    constructor() {
        this.browser = null;
        this.page = null;
        this.isInitialized = false;
    }
    
    async initialize() {
        const { chromium } = require('playwright');
        this.browser = await chromium.launch({ 
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'] // Docker compatibility
        });
        this.page = await this.browser.newPage();
        this.isInitialized = true;
    }
    
    async loginToTrainingPeaks(username, password) {
        await this.page.goto('https://www.trainingpeaks.com/login');
        await this.page.fill('#username', username);
        await this.page.fill('#password', password);
        await this.page.click('button[type="submit"]');
        await this.page.waitForURL('**/home');
    }
    
    async scrapeWeeklySchedule(startDate) {
        // Navigate to weekly calendar view
        await this.page.goto(`https://www.trainingpeaks.com/calendar?week=${startDate}`);
        
        // Extract training sessions for the week
        const trainingSessions = await this.page.evaluate(() => {
            const sessions = [];
            const workoutElements = document.querySelectorAll('.workout-item, .training-session');
            
            workoutElements.forEach(element => {
                const date = element.getAttribute('data-date') || element.closest('[data-date]')?.getAttribute('data-date');
                const title = element.querySelector('.workout-title')?.textContent?.trim();
                const description = element.querySelector('.workout-description')?.textContent?.trim();
                const duration = element.querySelector('.workout-duration')?.textContent?.trim();
                
                if (date && (title || description)) {
                    sessions.push({
                        date: date,
                        title: title || 'Training Session',
                        description: description || '',
                        duration: duration || null,
                        scraped_at: new Date().toISOString()
                    });
                }
            });
            
            return sessions;
        });
        
        return trainingSessions;
    }
    
    async dispose() {
        if (this.browser) {
            await this.browser.close();
            this.isInitialized = false;
        }
    }
}
```

### 2. Database Schema
```sql
-- Database schema for training data (user-managed credentials)
CREATE TABLE IF NOT EXISTS training_peaks_credentials (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, -- Links to platform users
    email VARCHAR(255) NOT NULL, -- TrainingPeaks login email
    password_encrypted TEXT NOT NULL, -- Encrypted TrainingPeaks password
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id) -- One TrainingPeaks account per platform user
);

CREATE TABLE IF NOT EXISTS training_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, -- Links to platform users
    session_date DATE NOT NULL,
    title VARCHAR(500),
    description TEXT,
    duration VARCHAR(100),
    training_type VARCHAR(100), -- 'run', 'bike', 'swim', 'strength', etc.
    scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    calendar_synced BOOLEAN DEFAULT false,
    garmin_synced BOOLEAN DEFAULT false,
    UNIQUE(user_id, session_date, title) -- Allow multiple sessions per day with different titles
);

CREATE TABLE IF NOT EXISTS scraping_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, -- Links to platform users
    scrape_date DATE NOT NULL,
    sessions_found INTEGER DEFAULT 0,
    success BOOLEAN DEFAULT false,
    error_message TEXT,
    scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    triggered_by VARCHAR(50) DEFAULT 'scheduler', -- 'scheduler', 'manual', 'hourly_check'
    retry_count INTEGER DEFAULT 0 -- Track retry attempts (light retry policy)
);

CREATE TABLE IF NOT EXISTS email_notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL, -- 'scraping_failed', 'weekly_summary'
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    email_subject VARCHAR(255),
    email_body TEXT,
    success BOOLEAN DEFAULT false
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_training_sessions_user_date ON training_sessions(user_id, session_date);
CREATE INDEX IF NOT EXISTS idx_scraping_logs_user_date ON scraping_logs(user_id, scrape_date);
CREATE INDEX IF NOT EXISTS idx_training_peaks_credentials_active ON training_peaks_credentials(is_active);
CREATE INDEX IF NOT EXISTS idx_email_notifications_user_type ON email_notifications(user_id, notification_type);
```

### 3. Weekly Automation Scheduler
```javascript
// services/scheduler.js
class WeeklyScheduler {
    constructor(scraper, storage) {
        this.scraper = scraper;
        this.storage = storage;
        this.isRunning = false;
    }
    
    async startWeeklyScheduler() {
        // Start checking every Sunday at 12:00 PM
        const sundaySchedule = '0 12 * * 0'; // Cron format: Sunday 12:00 PM
        
        cron.schedule(sundaySchedule, async () => {
            console.log('🏃 Starting Sunday training schedule scraping...');
            await this.runWeeklyScrapingForAllUsers();
        });
        
        // If no new trainings found, check every hour until found
        const hourlySchedule = '0 * * * *'; // Every hour
        
        cron.schedule(hourlySchedule, async () => {
            await this.checkForMissingTrainings();
        });
        
        console.log('📅 Training scheduler started:');
        console.log('  - Sunday 12:00 PM: Weekly scraping');
        console.log('  - Every hour: Check for missing trainings');
    }
    
    async runWeeklyScrapingForAllUsers() {
        try {
            const activeUsers = await this.storage.getActiveTrainingPeaksUsers();
            
            for (const user of activeUsers) {
                try {
                    await this.scrapeUserWeeklyTraining(user);
                    console.log(`✅ Successfully scraped training for user ${user.id}`);
                } catch (error) {
                    console.error(`❌ Failed to scrape training for user ${user.id}:`, error);
                    await this.storage.logScrapingError(user.id, error.message);
                }
            }
        } catch (error) {
            console.error('❌ Weekly scraping failed:', error);
        }
    }
    
    async checkForMissingTrainings() {
        try {
            const usersWithMissingTrainings = await this.storage.getUsersWithMissingCurrentWeekTrainings();
            
            if (usersWithMissingTrainings.length === 0) {
                return; // No missing trainings, skip hourly check
            }
            
            console.log(`🔍 Checking for missing trainings for ${usersWithMissingTrainings.length} users...`);
            
            for (const user of usersWithMissingTrainings) {
                try {
                    await this.scrapeUserWeeklyTraining(user);
                    console.log(`✅ Found and scraped missing training for user ${user.id}`);
                } catch (error) {
                    console.error(`❌ Still no trainings found for user ${user.id}:`, error);
                    // Light retry logic - don't hammer the service
                    await this.storage.logScrapingError(user.id, error.message);
                    
                    // Send email notification if consecutive failures
                    await this.checkAndSendFailureNotification(user.id, error.message);
                }
            }
        } catch (error) {
            console.error('❌ Missing training check failed:', error);
        }
    }
    
    async checkAndSendFailureNotification(userId, errorMessage) {
        const consecutiveFailures = await this.storage.getConsecutiveFailureCount(userId);
        
        // Send email after 3 consecutive failures
        if (consecutiveFailures >= 3) {
            const user = await this.storage.getUserById(userId);
            await this.emailService.sendScrapingFailureAlert(user, consecutiveFailures, errorMessage);
        }
    }
    
    async scrapeUserWeeklyTraining(user) {
        const startOfWeek = this.getNextMonday(); // Changed to Monday start
        
        await this.scraper.initialize();
        await this.scraper.loginToTrainingPeaks(user.username, user.decrypted_password);
        
        const sessions = await this.scraper.scrapeWeeklySchedule(startOfWeek);
        await this.storage.saveTrainingSessions(user.id, sessions);
        
        await this.storage.logSuccessfulScraping(user.id, sessions.length);
        await this.scraper.dispose();
    }
    
    getNextMonday() {
        const today = new Date();
        const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
        const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek); // If Sunday, next day is Monday
        
        const nextMonday = new Date(today);
        nextMonday.setDate(today.getDate() + daysUntilMonday);
        return nextMonday.toISOString().split('T')[0];
    }
}
```

### 4. Email Notification Service
```javascript
// services/emailService.js
class EmailNotificationService {
    constructor() {
        this.nodemailer = require('nodemailer');
        this.transporter = this.createTransporter();
    }
    
    createTransporter() {
        // Configure email transporter (Gmail, SMTP, etc.)
        return this.nodemailer.createTransporter({
            service: 'gmail', // or your preferred email service
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_APP_PASSWORD // Use app-specific password
            }
        });
    }
    
    async sendScrapingFailureAlert(user, consecutiveFailures, errorMessage) {
        const subject = `🚨 TrainingPeaks Scraping Failed - ${consecutiveFailures} consecutive failures`;
        const body = `
            <h2>TrainingPeaks Scraping Alert</h2>
            <p>Hello ${user.name},</p>
            
            <p>Your TrainingPeaks training schedule scraping has failed ${consecutiveFailures} times in a row.</p>
            
            <h3>Error Details:</h3>
            <p><strong>Last Error:</strong> ${errorMessage}</p>
            <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
            
            <h3>What this might mean:</h3>
            <ul>
                <li>TrainingPeaks website structure has changed</li>
                <li>Your TrainingPeaks credentials need updating</li>
                <li>TrainingPeaks is temporarily unavailable</li>
            </ul>
            
            <h3>Next Steps:</h3>
            <ol>
                <li>Check your TrainingPeaks credentials in the service dashboard</li>
                <li>Try manually logging into TrainingPeaks to verify access</li>
                <li>Contact support if the issue persists</li>
            </ol>
            
            <p>You can manage your settings at: <a href="${process.env.FRONTEND_URL}/training/">Training Service Dashboard</a></p>
            
            <p>Best regards,<br>Training Schedule Service</p>
        `;
        
        try {
            await this.transporter.sendMail({
                from: process.env.EMAIL_FROM,
                to: user.email,
                subject: subject,
                html: body
            });
            
            await this.storage.logEmailNotification(user.id, 'scraping_failed', subject, body, true);
            console.log(`📧 Failure alert sent to ${user.email}`);
        } catch (error) {
            console.error('📧 Failed to send email notification:', error);
            await this.storage.logEmailNotification(user.id, 'scraping_failed', subject, body, false);
        }
    }
    
    async sendWeeklySummary(user, currentWeekSessions, nextWeekSessions) {
        const subject = `📅 Weekly Training Summary - ${new Date().toLocaleDateString()}`;
        const body = `
            <h2>Weekly Training Summary</h2>
            <p>Hello ${user.name},</p>
            
            <h3>This Week's Training (${currentWeekSessions.length} sessions):</h3>
            ${this.formatTrainingSessions(currentWeekSessions)}
            
            <h3>Next Week's Training (${nextWeekSessions.length} sessions):</h3>
            ${this.formatTrainingSessions(nextWeekSessions)}
            
            <p>View full details at: <a href="${process.env.FRONTEND_URL}/training/">Training Dashboard</a></p>
            
            <p>Train hard! 💪<br>Training Schedule Service</p>
        `;
        
        try {
            await this.transporter.sendMail({
                from: process.env.EMAIL_FROM,
                to: user.email,
                subject: subject,
                html: body
            });
            
            await this.storage.logEmailNotification(user.id, 'weekly_summary', subject, body, true);
        } catch (error) {
            console.error('📧 Failed to send weekly summary:', error);
        }
    }
    
    formatTrainingSessions(sessions) {
        if (sessions.length === 0) {
            return '<p><em>No training sessions scheduled</em></p>';
        }
        
        return '<ul>' + sessions.map(session => 
            `<li><strong>${session.session_date}</strong>: ${session.title}<br>
             <em>${session.description}</em></li>`
        ).join('') + '</ul>';
    }
}
```
```

### 4. API Endpoints Structure
```javascript
// routes/api.js - User endpoints
router.get('/status', jwtMiddleware.authenticate, jwtMiddleware.requireApproved, async (req, res) => {
    // Get user's training service status and last scraping info
});

router.get('/credentials', jwtMiddleware.authenticate, jwtMiddleware.requireApproved, async (req, res) => {
    // Check if user has TrainingPeaks credentials configured
});

router.post('/credentials', jwtMiddleware.authenticate, jwtMiddleware.requireApproved, async (req, res) => {
    // Save/update user's TrainingPeaks credentials (encrypted)
});

router.delete('/credentials', jwtMiddleware.authenticate, jwtMiddleware.requireApproved, async (req, res) => {
    // Delete user's TrainingPeaks credentials and training data
});

router.get('/training-schedule', jwtMiddleware.authenticate, jwtMiddleware.requireApproved, async (req, res) => {
    // Get user's training schedule (current week / next week)
    // Query params: ?week=current|next
});

router.post('/scrape-now', jwtMiddleware.authenticate, jwtMiddleware.requireApproved, async (req, res) => {
    // Manual trigger for scraping user's current week
});

router.get('/scraping-history', jwtMiddleware.authenticate, jwtMiddleware.requireApproved, async (req, res) => {
    // Get user's scraping history and logs
});

router.get('/statistics', jwtMiddleware.authenticate, jwtMiddleware.requireApproved, async (req, res) => {
    // Get user's training statistics (weekly volume, types, etc.)
});

// routes/admin.js - Admin-only endpoints for service management
router.get('/service-status', jwtMiddleware.authenticate, jwtMiddleware.requireAdmin, async (req, res) => {
    // Global service status, scheduler info, all users count
});

router.get('/all-users', jwtMiddleware.authenticate, jwtMiddleware.requireAdmin, async (req, res) => {
    // Get all users with TrainingPeaks credentials (admin view)
});

router.post('/reset-scheduler', jwtMiddleware.authenticate, jwtMiddleware.requireAdmin, async (req, res) => {
    // Reset/restart the background scheduler
});

router.get('/all-logs', jwtMiddleware.authenticate, jwtMiddleware.requireAdmin, async (req, res) => {
    // Get scraping logs for all users (admin debugging)
});
```

### 5. Frontend Dashboard - User Training Management
```html
<!-- public/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Training Schedule Manager</title>
    <link rel="stylesheet" href="/training/static/training-peaks.css">
</head>
<body>
    <div class="container">
        <header>
            <h1>🏃 Training Schedule Manager</h1>
            <p>TrainingPeaks Integration Service</p>
        </header>
        
        <main>
            <!-- User Setup Section -->
            <section id="setup-section" class="card">
                <h2>⚙️ TrainingPeaks Setup</h2>
                <div id="credentials-status">
                    <!-- Dynamically populated based on whether user has credentials -->
                </div>
                
                <!-- Credentials Form (shown if not configured or editing) -->
                <form id="credentials-form" style="display: none;">
                    <div class="form-group">
                        <label for="tp-email">TrainingPeaks Email:</label>
                        <input type="email" id="tp-email" placeholder="your@email.com" required>
                    </div>
                    <div class="form-group">
                        <label for="tp-password">TrainingPeaks Password:</label>
                        <input type="password" id="tp-password" placeholder="Password" required>
                    </div>
                    <div class="form-actions">
                        <button type="submit" id="save-credentials">Save Credentials</button>
                        <button type="button" id="cancel-credentials">Cancel</button>
                    </div>
                </form>
            </section>

            <!-- Service Status -->
            <section id="service-status" class="card">
                <h2>� Service Status</h2>
                <div class="status-grid">
                    <div class="status-item">
                        <span class="status-label">Last Scraping:</span>
                        <span id="last-scraping" class="status-value">-</span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">Next Check:</span>
                        <span id="next-check" class="status-value">-</span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">Status:</span>
                        <span id="scraping-status" class="status-value">-</span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">Training Week:</span>
                        <span class="status-value">Monday - Sunday</span>
                    </div>
                </div>
                <button id="scrape-now-btn" class="action-btn">Refresh from TrainingPeaks</button>
            </section>
            
            <!-- Current Week Training -->
            <section id="current-week" class="card">
                <h2>📅 This Week's Training</h2>
                <div class="week-header">
                    <span id="current-week-dates"></span>
                    <div class="week-stats">
                        <span id="current-week-sessions">0 sessions</span>
                    </div>
                </div>
                <div id="current-week-schedule" class="training-schedule">
                    <!-- Dynamically populated -->
                </div>
            </section>
            
            <!-- Next Week Training -->
            <section id="next-week" class="card">
                <h2>� Next Week's Training</h2>
                <div class="week-header">
                    <span id="next-week-dates"></span>
                    <div class="week-stats">
                        <span id="next-week-sessions">0 sessions</span>
                    </div>
                </div>
                <div id="next-week-schedule" class="training-schedule">
                    <!-- Dynamically populated -->
                </div>
            </section>

            <!-- Training Statistics -->
            <section id="training-stats" class="card">
                <h2>� Training Statistics</h2>
                <div class="stats-grid">
                    <div class="stat-item">
                        <span class="stat-label">This Week:</span>
                        <span id="current-week-total" class="stat-value">0 sessions</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Next Week:</span>
                        <span id="next-week-total" class="stat-value">0 sessions</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Training Types:</span>
                        <span id="training-types" class="stat-value">-</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Total Scraped:</span>
                        <span id="total-sessions" class="stat-value">0</span>
                    </div>
                </div>
            </section>
            
            <!-- Scraping History & Logs -->
            <section id="scraping-history" class="card">
                <h2>� Scraping History</h2>
                <div class="history-controls">
                    <select id="history-period">
                        <option value="7">Last 7 days</option>
                        <option value="30">Last 30 days</option>
                        <option value="90">Last 90 days</option>
                    </select>
                    <button id="refresh-history">Refresh</button>
                </div>
                <div id="history-table">
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Status</th>
                                <th>Sessions Found</th>
                                <th>Triggered By</th>
                                <th>Details</th>
                            </tr>
                        </thead>
                        <tbody id="history-tbody">
                            <!-- Dynamic content -->
                        </tbody>
                    </table>
                </div>
            </section>

            <!-- Future Features Preview -->
            <section id="future-features" class="card disabled">
                <h2>🔮 Coming Soon</h2>
                <div class="feature-grid">
                    <div class="feature-item">
                        <h3>📱 Apple Calendar Sync</h3>
                        <p>Automatic calendar event creation with training descriptions</p>
                        <span class="feature-status">Phase 2</span>
                    </div>
                    <div class="feature-item">
                        <h3>⌚ Garmin Integration</h3>
                        <p>Auto-upload structured workouts to Garmin watches</p>
                        <span class="feature-status">Phase 3</span>
                    </div>
                </div>
            </section>
        </main>
    </div>
    
    <script src="/training/static/training-peaks.js"></script>
</body>
</html>
```

## 🔐 Security Considerations

### 1. Credential Encryption
```javascript
// Encrypt TrainingPeaks passwords before storage
const crypto = require('crypto');

const encryptPassword = (password) => {
    const algorithm = 'aes-256-gcm';
    const secretKey = process.env.ENCRYPTION_SECRET; // 32-byte key
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipher(algorithm, secretKey);
    cipher.setAAD(Buffer.from('trainingpeaks', 'utf8'));
    
    let encrypted = cipher.update(password, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return {
        encrypted: encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex')
    };
};
```

### 2. Playwright Security
- Headless browser operation for security
- Temporary browser contexts that are disposed after use
- No persistent browser storage or cache
- Docker container isolation

## 📊 Database Integration

### Migration Strategy
```sql
-- database/migrations/001_create_training_peaks_tables.sql
-- Add the training-related tables to existing PostgreSQL database
-- Follows the same pattern as other services (LoL tracking, Hearts game)
```

## 🐳 Docker Configuration

### Dockerfile
```dockerfile
# training-peaks-service/Dockerfile
FROM node:18-alpine

# Install Playwright dependencies
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Tell Playwright to use installed Chromium
ENV PLAYWRIGHT_BROWSERS_PATH=/usr/bin/chromium-browser
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

EXPOSE 3005

CMD ["node", "server.js"]
```

### Docker Compose Integration
```yaml
# Add to main docker-compose.yml
training-peaks-service:
  build: ./training-peaks-service
  ports:
    - "3005:3005"
  environment:
    - NODE_ENV=production
    - PORT=3005
    - JWT_SECRET=${JWT_SECRET}
    - DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@database:5432/${POSTGRES_DB}
    - ENCRYPTION_SECRET=${ENCRYPTION_SECRET}
  networks:
    - app-network
  depends_on:
    - database
    - auth-service
```

### Caddy Configuration
```
# Add to Caddyfile
handle_path /training/* {
    reverse_proxy training-peaks-service:3005
}
```

## 🚀 Development Commands

### Service Management
```bash
# Build and start the service
docker compose up training-peaks-service --build -d

# View logs
docker compose logs -f training-peaks-service

# Rebuild with no cache
docker compose build training-peaks-service --no-cache

# Run database migrations
docker exec -it microservices-platform-training-peaks-service-1 npm run migrate
```

### Testing
```bash
# Test service health
curl http://localhost:3005/health

# Test via reverse proxy
curl https://kl-pi.tail9f5728.ts.net/training/

# Manual scraping test (requires authentication)
curl -X POST https://kl-pi.tail9f5728.ts.net/training/api/scrape-now \
  -H "Cookie: access_token=your_jwt_token"
```

## 📝 Development Milestones

### Phase 1 Implementation Checklist
- [ ] Basic Express.js service setup with JWT authentication
- [ ] PostgreSQL database schema creation and migrations
- [ ] Playwright browser automation setup
- [ ] TrainingPeaks login and navigation logic
- [ ] Training description extraction and parsing
- [ ] Weekly scheduling automation (Sunday scraping)
- [ ] Frontend dashboard for credential setup
- [ ] Training schedule viewing interface
- [ ] Manual scraping trigger functionality
- [ ] Error handling and logging system
- [ ] Docker containerization and deployment

### Future Phase Preparation
- [ ] Calendar API research and planning (Phase 2)
- [ ] Garmin Connect API integration planning (Phase 3)
- [ ] User feedback and UI improvement considerations

## ⚠️ Known Challenges & Solutions

### 1. TrainingPeaks Anti-Bot Protection
**Challenge**: TrainingPeaks may have anti-automation measures
**Solution**: 
- Use realistic browser headers and timing
- Implement random delays between actions
- Rotate user agents if necessary
- Respect robots.txt and rate limits

### 2. Credential Security
**Challenge**: Storing user passwords securely
**Solution**: 
- AES-256-GCM encryption for password storage
- Environment-based encryption keys
- Consider OAuth integration in future versions

### 3. Training Description Parsing
**Challenge**: Various training description formats
**Solution**: 
- Flexible parsing that handles multiple formats
- Preserve original text while extracting structured data
- User feedback mechanism for parsing improvements

## 🎯 Frontend Features & Ideas

Since most functionality runs as background jobs, the frontend focuses on **monitoring and management**:

### Core Features ✅
1. **Service Status Dashboard**: Real-time status of scheduler, last scraping times, next check
2. **User Management**: Add/edit/remove TrainingPeaks users with encrypted credential storage
3. **Training Schedule Viewer**: Current week and next week training display per user
4. **Manual Operations**: Trigger immediate scraping for testing or emergency updates
5. **Scraping History**: Complete audit trail of all scraping attempts with success/failure logs

### Additional Ideas 💡
6. **Training Statistics**: 
   - Weekly training volume (distance, time, sessions)
   - Training type breakdown (run, bike, swim, strength)
   - Consistency tracking (days with training vs. days without)

7. **Alert System**:
   - Email notifications when scraping fails for X consecutive attempts
   - Weekly summary emails with upcoming training schedule
   - Alerts when no training is found for a user (possible TrainingPeaks issue)

8. **Training Preview & Editing**:
   - Preview training descriptions before calendar sync
   - Manual editing/cleanup of training descriptions
   - Training categorization and tagging

9. **Calendar Sync Management** (Phase 2 prep):
   - Preview which trainings will be added to calendar
   - Sync status per training session
   - Calendar conflict detection

10. **Export/Import Features**:
    - Export training data to CSV/Excel for analysis
    - Import training data from other sources
    - Backup/restore user configurations

11. **Multi-week View**:
    - Monthly calendar view with training overview
    - Training plan progression tracking
    - Week-over-week comparison

12. **User Analytics Dashboard**:
    - Per-user training patterns and insights
    - Training compliance tracking
    - Performance trends over time

## 🎯 Implementation Questions & Clarifications

### Confirmed Requirements ✅
1. **Authentication**: User-level access (each user manages their own credentials) ✅
2. **Training Format**: Text-based training descriptions ✅  
3. **Scraping Schedule**: Sunday 12:00 PM, then hourly until found ✅
4. **Calendar Target**: Apple Calendar ✅
5. **User Management**: Each platform user manages their own TrainingPeaks account ✅
6. **Training Week**: Monday to Sunday (starts Monday) ✅
7. **Multiple Sessions**: Supported but rare - same day, different titles ✅
8. **Retry Policy**: Light retry - don't hammer on failures ✅
9. **Email Notifications**: Send alerts after 3 consecutive failures ✅

### Additional Questions for Fine-tuning 🤔

1. **TrainingPeaks Interface**: Are you using the web interface or mobile app primarily? This affects our scraping selectors.

2. **Training Week Definition**: Does your training week start on Sunday or Monday? Should we scrape "this week" or "next week" on Sunday?

3. **Multiple Training Sessions**: Can you have multiple training sessions per day? How should we handle these?

4. **Training Description Length**: What's a typical length for your training descriptions? This helps with database field sizing.

5. **Error Handling**: How should the system behave if TrainingPeaks is down or login fails? Continue trying or stop until manual intervention?

6. **Notification Preferences**: Would you want email alerts for scraping failures, or just dashboard notifications?

7. **Data Retention**: How long should we keep old training data and scraping logs? (e.g., 1 year, forever, configurable?)

8. **Training Categories**: Do you want automatic categorization of training types (run/bike/swim) based on description keywords?
