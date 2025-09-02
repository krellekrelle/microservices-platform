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

// Get current week's training schedule
router.get('/schedule', async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Get date range (Monday to Sunday of current week)
        const weekStart = storageService.getCurrentWeekStart();
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        
        const sessions = await storageService.getUserTrainingSessions(
            userId,
            weekStart,
            weekEnd.toISOString().split('T')[0]
        );
        
        // Group by day
        const schedule = {};
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        
        days.forEach(day => {
            schedule[day] = [];
        });
        
        sessions.forEach(session => {
            const sessionDate = new Date(session.date);
            const dayIndex = (sessionDate.getDay() + 6) % 7; // Convert to Monday = 0
            const dayName = days[dayIndex];
            
            schedule[dayName].push({
                time: session.time,
                title: session.title,
                description: session.description,
                type: session.training_type,
                duration: session.duration_minutes
            });
        });
        
        res.json({
            weekStart,
            weekEnd: weekEnd.toISOString().split('T')[0],
            schedule
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
        const schedule = await scraper.scrapeWeeklySchedule(credentials.username, credentials.password);
        
        if (schedule.length > 0) {
            await storageService.storeTrainingSessions(userId, schedule);
            await storageService.logScrapingAttempt(userId, true, 'Manual scraping successful');
            
            res.json({
                success: true,
                message: `Successfully scraped ${schedule.length} training sessions`,
                sessions: schedule.length
            });
        } else {
            await storageService.logScrapingAttempt(userId, true, 'No training sessions found');
            res.json({
                success: true,
                message: 'No training sessions found for the current week',
                sessions: 0
            });
        }
    } catch (error) {
        console.error('Error in manual scraping:', error);
        await storageService.logScrapingAttempt(req.user.id, false, error.message);
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

module.exports = router;
