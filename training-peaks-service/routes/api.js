const express = require('express');
const router = express.Router();
const StorageService = require('../services/storage');
const TrainingPeaksScraper = require('../services/scraper-with-session');
const EmailNotificationService = require('../services/email');

const storageService = new StorageService();
const scraper = new TrainingPeaksScraper();
const emailService = new EmailNotificationService();

// Get user status and configuration
router.get('/status', async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Check if user has stored credentials
        const credentials = await storageService.getUserCredentials(userId);
        
        // Get current week's training data
        const weekStart = storageService.getCurrentWeekStart();
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        
        const sessions = await storageService.getUserTrainingSessions(
            userId, 
            weekStart, 
            weekEnd.toISOString().split('T')[0]
        );
        
        res.json({
            hasCredentials: !!credentials,
            username: credentials?.username || null,
            sessionsThisWeek: sessions.length,
            lastUpdate: sessions.length > 0 ? sessions[0].created_at : null
        });
    } catch (error) {
        console.error('Error getting user status:', error);
        res.status(500).json({ error: 'Failed to get status' });
    }
});

// Store/update user credentials
router.post('/credentials', async (req, res) => {
    try {
        const userId = req.user.id;
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }
        
        // Test credentials by attempting to login
        try {
            await scraper.testCredentials(username, password);
        } catch (error) {
            return res.status(400).json({ 
                error: 'Invalid credentials or TrainingPeaks login failed',
                details: error.message 
            });
        }
        
        // Store credentials if test successful
        await storageService.storeUserCredentials(userId, username, password);
        
        res.json({ 
            success: true, 
            message: 'Credentials stored successfully' 
        });
    } catch (error) {
        console.error('Error storing credentials:', error);
        res.status(500).json({ error: 'Failed to store credentials' });
    }
});

// Get training schedule (all trainings or current week based on query parameter)
router.get('/schedule', async (req, res) => {
    try {
        const userId = req.user.id;
        const { all } = req.query; // Add query parameter to get all trainings
        
        let sessions;
        let weekStart, weekEnd;
        
        if (all === 'true') {
            // Get all training sessions from database
            sessions = await storageService.getAllUserTrainingSessions(userId);
            weekStart = null;
            weekEnd = null;
        } else {
            // Get date range (Monday to Sunday of current week)
            weekStart = storageService.getCurrentWeekStart();
            weekEnd = new Date(weekStart);
            weekEnd.setDate(weekEnd.getDate() + 6);
            
            sessions = await storageService.getUserTrainingSessions(
                userId,
                weekStart,
                weekEnd.toISOString().split('T')[0]
            );
        }
        
        // Group by day (for current week) or by date (for all trainings)
        let schedule;
        
        if (all === 'true') {
            // Group all trainings by date
            schedule = {};
            sessions.forEach(session => {
                const sessionDate = session.date;
                if (!schedule[sessionDate]) {
                    schedule[sessionDate] = [];
                }
                
                schedule[sessionDate].push({
                    type: session.type,
                    description: session.description,
                    duration: session.duration,
                    distance: session.distance,
                    workout_id: session.workout_id,
                    date: session.date
                });
            });
        } else {
            // Group by day for current week
            schedule = {};
            const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
            
            days.forEach(day => {
                schedule[day] = [];
            });
            
            sessions.forEach(session => {
                const sessionDate = new Date(session.date);
                const dayIndex = (sessionDate.getDay() + 6) % 7; // Convert to Monday = 0
                const dayName = days[dayIndex];
                
                schedule[dayName].push({
                    type: session.type,
                    description: session.description,
                    duration: session.duration,
                    distance: session.distance,
                    workout_id: session.workout_id
                });
            });
        }
        
        res.json({
            weekStart,
            weekEnd: weekEnd ? weekEnd.toISOString().split('T')[0] : null,
            schedule,
            totalSessions: sessions.length,
            showingAll: all === 'true'
        });
    } catch (error) {
        console.error('Error getting schedule:', error);
        res.status(500).json({ error: 'Failed to get schedule' });
    }
});

// Manually trigger scraping for current user
router.post('/scrape', async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Get user credentials
        const credentials = await storageService.getUserCredentials(userId);
        if (!credentials) {
            return res.status(400).json({ 
                error: 'No TrainingPeaks credentials found. Please add your credentials first.' 
            });
        }
        
        // Perform scraping
        const schedule = await scraper.scrapeWithCredentials(credentials.username, credentials.password);
        
        if (schedule.length > 0) {
            await storageService.storeTrainingSessions(userId, schedule);
            await storageService.logScrapingAttempt(userId, 'manual', 'success', 'Manual scraping successful', schedule.length);
            
            res.json({
                success: true,
                message: `Successfully scraped ${schedule.length} training sessions`,
                sessions: schedule.length
            });
        } else {
            await storageService.logScrapingAttempt(userId, 'manual', 'warning', 'No training sessions found', 0);
            res.json({
                success: true,
                message: 'No training sessions found for the current week',
                sessions: 0
            });
        }
    } catch (error) {
        console.error('Error in manual scraping:', error);
        await storageService.logScrapingAttempt(req.user.id, 'manual', 'error', error.message, 0);
        res.status(500).json({ 
            error: 'Scraping failed',
            details: error.message 
        });
    }
});

// Delete user credentials
router.delete('/credentials', async (req, res) => {
    try {
        const userId = req.user.id;
        
        await storageService.deleteUserCredentials(userId);
        
        res.json({ 
            success: true, 
            message: 'Credentials deleted successfully' 
        });
    } catch (error) {
        console.error('Error deleting credentials:', error);
        res.status(500).json({ error: 'Failed to delete credentials' });
    }
});

// Test email notification
router.post('/test-email', async (req, res) => {
    try {
        const userEmail = req.user.email;
        
        await emailService.sendTestEmail(userEmail);
        
        res.json({ 
            success: true, 
            message: 'Test email sent successfully' 
        });
    } catch (error) {
        console.error('Error sending test email:', error);
        res.status(500).json({ 
            error: 'Failed to send test email',
            details: error.message 
        });
    }
});

// Test scraping endpoint with direct credentials (for testing only)
router.post('/test-scraping', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required for testing' });
        }
        
        console.log('🧪 Starting test scraping with provided credentials...');
        
        // Perform scraping with test credentials
        const schedule = await scraper.scrapeWithCredentials(username, password);
        
        // Don't store data for test endpoint, just return it
        res.json({
            success: true,
            message: `Test scraping completed - found ${schedule.length} training sessions`,
            sessions: schedule.length,
            data: schedule
        });
        
    } catch (error) {
        console.error('Error in test scraping:', error);
        res.status(500).json({ 
            error: 'Test scraping failed',
            details: error.message 
        });
    }
});

module.exports = router;
