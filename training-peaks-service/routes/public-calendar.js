const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const CalendarIntegrationService = require('../services/calendar-integration');
const database = require('../db/database');

const calendarService = new CalendarIntegrationService();

/**
 * GET /api/public/calendar/subscribe
 * Public endpoint for calendar clients (like Apple Calendar) to fetch the ICS feed
 * Secured via JWT token in query string
 */
router.get('/subscribe', async (req, res) => {
    try {
        const { token } = req.query;
        if (!token) {
            return res.status(401).send('Missing subscription token');
        }
        
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-jwt-secret-here');
        } catch (err) {
            return res.status(401).send('Invalid or expired subscription token');
        }
        
        const userId = decoded.id;
        if (!userId || decoded.purpose !== 'calendar_subscription') {
             return res.status(401).send('Invalid token payload');
        }
        
        // Get training sessions for the next 28 days and last 7 days
        const query = `
            SELECT * FROM training_sessions 
            WHERE user_id = $1 
            AND date >= CURRENT_DATE - INTERVAL '7 days' 
            AND date <= CURRENT_DATE + INTERVAL '28 days'
            ORDER BY date
        `;
        
        const result = await database.query(query, [userId]);
        const trainingSessions = result.rows;
        
        // Get user settings
        const settingsQuery = `SELECT * FROM calendar_user_settings WHERE user_id = $1`;
        const settingsResult = await database.query(settingsQuery, [userId]);
        const userSettings = settingsResult.rows[0] || {};
        
        // Generate ICS content
        const icsContent = await calendarService.generateICSFile(trainingSessions, {
            userId: userId,
            defaultTrainingTime: userSettings.default_training_time || '07:00:00',
            defaultLocation: userSettings.default_location || '',
            timezone: userSettings.timezone || 'Europe/Copenhagen',
            reminders: typeof userSettings.reminder_settings === 'string' ? JSON.parse(userSettings.reminder_settings) : (userSettings.reminder_settings || [
                { minutes: 60, description: '1 hour before training' }
            ])
        });
        
        // Set proper headers for calendar subscription
        res.set({
            'Content-Type': 'text/calendar; charset=utf-8',
            'Content-Disposition': 'attachment; filename="training-plan.ics"',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        
        res.send(icsContent);
        
    } catch (error) {
        console.error('Error generating calendar subscription feed:', error);
        res.status(500).send('Internal Server Error generating feed');
    }
});

module.exports = router;
