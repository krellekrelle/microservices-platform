const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const cron = require('node-cron');
require('dotenv').config();

const app = express();

// Import middleware and services
const JWTMiddleware = require('./jwt-middleware');
const jwtMiddleware = new JWTMiddleware();
const db = require('./db/database');
const TrainingPeaksScraper = require('./services/scraper');
const StorageService = require('./services/storage');
const EmailNotificationService = require('./services/email');

// Initialize services
const scraper = new TrainingPeaksScraper();
const storageService = new StorageService();
const emailService = new EmailNotificationService();

// Initialize the app
async function initializeApp() {
    try {
        // Initialize JWT middleware
        await jwtMiddleware.initialize();
        console.log('✅ JWT middleware initialized');

        // Setup routes and middleware after initialization
        setupApp();
        // startCronJobs(); // Disabled for now - no automatic scraping
        startServer();
    } catch (error) {
        console.error('❌ Failed to initialize app:', error);
        process.exit(1);
    }
}

function setupApp() {
    // Middleware
    app.use(cors({
        origin: process.env.FRONTEND_URL || "https://kl-pi.tail9f5728.ts.net",
        credentials: true
    }));
    app.use(express.json());
    app.use(cookieParser());

    // Public assets (before auth)
    app.use('/favicon.svg', express.static(path.join(__dirname, 'public/favicon.svg')));

    // Public health check endpoint
    app.get('/health', (req, res) => {
        res.json({ 
            status: 'healthy', 
            service: 'training-peaks-service'
        });
    });

    // Protected routes
    app.use(jwtMiddleware.authenticate, jwtMiddleware.requireApproved);
    app.use(express.static(path.join(__dirname, 'public')));

    // Routes
    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    // API Routes
    app.use('/api', require('./routes/api'));
    app.use('/api/calendar', require('./routes/calendar'));
    app.use('/api/garmin', require('./routes/garmin'));
    app.use('/api/devices', require('./routes/devices'));

    // Error handling middleware
    app.use((err, req, res, next) => {
        console.error('Training service error:', err);
        res.status(500).json({ error: 'Internal server error' });
    });

    // 404 handler
    app.use('*', (req, res) => {
        res.redirect(process.env.FRONTEND_URL || 'https://kl-pi.tail9f5728.ts.net');
    });
}

function startCronJobs() {
    // Cron job for weekly scraping (Sunday at 12:00 PM)
    cron.schedule('0 12 * * 0', async () => {
        console.log('🔄 Starting weekly scraping job...');
        await performWeeklyScraping();
    }, {
        timezone: "Europe/Copenhagen"
    });

    // Cron job for hourly missing training checks
    cron.schedule('0 * * * *', async () => {
        console.log('🔍 Checking for missing training schedules...');
        await checkMissingTraining();
    }, {
        timezone: "Europe/Copenhagen"
    });
}

async function performWeeklyScraping() {
    try {
        const users = await storageService.getUsersWithCredentials();
        
        for (const user of users) {
            try {
                console.log(`📅 Scraping weekly schedule for user ${user.id}`);
                const schedule = await scraper.scrapeWeeklySchedule(user.username, user.password);
                
                if (schedule.length > 0) {
                    await storageService.storeTrainingSessions(user.id, schedule);
                    await storageService.logScrapingAttempt(user.id, true, 'Weekly scraping successful');
                    console.log(`✅ Successfully scraped ${schedule.length} sessions for user ${user.id}`);
                } else {
                    console.log(`⚠️ No training sessions found for user ${user.id}`);
                    await storageService.logScrapingAttempt(user.id, true, 'No training sessions found');
                }
            } catch (error) {
                console.error(`❌ Error scraping for user ${user.id}:`, error.message);
                await storageService.logScrapingAttempt(user.id, false, error.message);
            }
        }
    } catch (error) {
        console.error('❌ Error in weekly scraping job:', error);
    }
}

async function checkMissingTraining() {
    try {
        const usersWithoutTraining = await storageService.getUsersWithoutRecentTraining();
        
        for (const user of usersWithoutTraining) {
            const failedAttempts = await storageService.getFailedAttempts(user.id);
            
            if (failedAttempts < 3) {
                console.log(`🔄 Retrying scraping for user ${user.id} (attempt ${failedAttempts + 1})`);
                
                try {
                    const schedule = await scraper.scrapeWeeklySchedule(user.username, user.password);
                    
                    if (schedule.length > 0) {
                        await storageService.storeTrainingSessions(user.id, schedule);
                        await storageService.logScrapingAttempt(user.id, true, 'Retry scraping successful');
                        console.log(`✅ Successfully scraped ${schedule.length} sessions for user ${user.id} on retry`);
                    } else {
                        await storageService.logScrapingAttempt(user.id, false, 'No training sessions found on retry');
                    }
                } catch (error) {
                    console.error(`❌ Retry failed for user ${user.id}:`, error.message);
                    await storageService.logScrapingAttempt(user.id, false, error.message);
                    
                    // Check if this was the 3rd failure
                    const newFailedAttempts = await storageService.getFailedAttempts(user.id);
                    if (newFailedAttempts >= 3) {
                        console.log(`📧 Sending failure notification for user ${user.id}`);
                        await emailService.sendFailureNotification(user.email, user.username);
                    }
                }
            }
        }
    } catch (error) {
        console.error('❌ Error checking for missing training:', error);
    }
}

function startServer() {
    const PORT = process.env.PORT || 3005;

    app.listen(PORT, () => {
        console.log(`🚀 Training Peaks Service running on port ${PORT}`);
        console.log(`Frontend URL: ${process.env.FRONTEND_URL}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
        console.log('Received SIGTERM, shutting down gracefully');
        process.exit(0);
    });
}

// Start the application
initializeApp();
