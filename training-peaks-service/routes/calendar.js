
const express = require('express');
const router = express.Router();
const CalendarIntegrationService = require('../services/calendar-integration');
const storage = require('../services/storage');
const database = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const calendarService = new CalendarIntegrationService();

/**
 * Phase 2: Apple Calendar Integration Routes
 * Handles calendar sync, settings, and event creation
 */

/**
 * GET /api/calendar/settings
 * Get user calendar settings
 */
router.get('/settings', requireAuth, async (req, res) => {
    try {
        const userId = req.user?.id || 1; // Fallback for testing
        console.log('🔍 DEBUG: Getting calendar settings for user:', userId);
        
        const query = `
            SELECT * FROM calendar_user_settings 
            WHERE user_id = $1
        `;
        
        const result = await database.query(query, [userId]);
        console.log('🔍 DEBUG: Calendar settings query result:', result.rows.length, 'rows');
        
        if (result.rows.length === 0) {
            console.log('🔍 DEBUG: No settings found, creating default settings');
            // Create default settings
            const defaultSettings = {
                user_id: userId,
                calendar_provider: 'apple_calendar',
                default_training_time: '07:00:00',
                default_location: '',
                timezone: 'Europe/Copenhagen',
                reminder_settings: [
                    { minutes: 60, description: '1 hour before training' },
                    { minutes: 15, description: '15 minutes before training' }
                ],
                auto_sync_enabled: true
            };
            
            const insertQuery = `
                INSERT INTO calendar_user_settings (
                    user_id, calendar_provider, default_training_time, 
                    default_location, timezone, reminder_settings, auto_sync_enabled
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *
            `;
            
            const insertResult = await database.query(insertQuery, [
                defaultSettings.user_id,
                defaultSettings.calendar_provider,
                defaultSettings.default_training_time,
                defaultSettings.default_location,
                defaultSettings.timezone,
                JSON.stringify(defaultSettings.reminder_settings),
                defaultSettings.auto_sync_enabled
            ]);
            
            res.json({
                success: true,
                settings: insertResult.rows[0]
            });
        } else {
            res.json({
                success: true,
                settings: result.rows[0]
            });
        }
    } catch (error) {
        console.error('Error getting calendar settings:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * PUT /api/calendar/settings
 * Update user calendar settings
 */
router.put('/settings', requireAuth, async (req, res) => {
    try {
        const userId = req.user?.id || 1;
        console.log('🔍 DEBUG: Saving calendar settings for user:', userId);
        console.log('🔍 DEBUG: Request body:', req.body);
        
        const {
            calendar_provider,
            default_training_time,
            default_location,
            timezone,
            reminder_settings,
            auto_sync_enabled,
            calendar_url
        } = req.body;
        
        const query = `
            UPDATE calendar_user_settings SET
                calendar_provider = COALESCE($2, calendar_provider),
                default_training_time = COALESCE($3, default_training_time),
                default_location = COALESCE($4, default_location),
                timezone = COALESCE($5, timezone),
                reminder_settings = COALESCE($6, reminder_settings),
                auto_sync_enabled = COALESCE($7, auto_sync_enabled),
                calendar_url = COALESCE($8, calendar_url),
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $1
            RETURNING *
        `;
        
        const result = await database.query(query, [
            userId,
            calendar_provider,
            default_training_time,
            default_location,
            timezone,
            reminder_settings ? JSON.stringify(reminder_settings) : null,
            auto_sync_enabled,
            calendar_url
        ]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'User settings not found'
            });
        }
        
        res.json({
            success: true,
            settings: result.rows[0],
            message: 'Settings updated successfully'
        });
    } catch (error) {
        console.error('Error updating calendar settings:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/calendar/sync
 * Sync training sessions to calendar
 */
router.post('/sync', requireAuth, async (req, res) => {
    try {
        const userId = req.user?.id || 1;
        const { dateRange, forceResync } = req.body;
        
        // Get user settings
        const settingsQuery = `SELECT * FROM calendar_user_settings WHERE user_id = $1`;
        const settingsResult = await database.query(settingsQuery, [userId]);
        
        if (settingsResult.rows.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Calendar settings not configured. Please set up your calendar preferences first.'
            });
        }
        
        const userSettings = settingsResult.rows[0];
        
        // Get training sessions to sync
        let sessionsQuery = `
            SELECT * FROM training_sessions 
            WHERE user_id = $1
        `;
        let queryParams = [userId];
        
        if (dateRange) {
            sessionsQuery += ` AND date BETWEEN $2 AND $3`;
            queryParams.push(dateRange.start, dateRange.end);
        } else {
            // Default to current week
            sessionsQuery += ` AND date >= CURRENT_DATE AND date <= CURRENT_DATE + INTERVAL '7 days'`;
        }
        
        if (!forceResync) {
            // Only sync sessions that haven't been synced yet
            sessionsQuery += ` AND id NOT IN (
                SELECT session_id FROM calendar_events 
                WHERE user_id = $${queryParams.length + 1} AND sync_status = 'created'
            )`;
            queryParams.push(userId);
        }
        
        sessionsQuery += ` ORDER BY date`;
        
        const sessionsResult = await database.query(sessionsQuery, queryParams);
        const trainingSessions = sessionsResult.rows;
        
        if (trainingSessions.length === 0) {
            return res.json({
                success: true,
                message: 'No new training sessions to sync',
                eventsCreated: 0,
                totalSessions: 0
            });
        }
        
        // Create calendar events
        const calendarResult = await calendarService.createTrainingEvents(
            trainingSessions,
            {
                userId: userId,
                defaultTrainingTime: userSettings.default_training_time,
                defaultLocation: userSettings.default_location,
                timezone: userSettings.timezone,
                reminders: userSettings.reminder_settings
            }
        );
        
        // Store event tracking records
        for (const event of calendarResult.events) {
            await database.query(`
                INSERT INTO calendar_events (
                    user_id, session_id, event_id, calendar_provider,
                    event_title, event_start, event_end, sync_status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (user_id, session_id) DO UPDATE SET
                    event_id = EXCLUDED.event_id,
                    event_title = EXCLUDED.event_title,
                    event_start = EXCLUDED.event_start,
                    event_end = EXCLUDED.event_end,
                    sync_status = EXCLUDED.sync_status,
                    last_synced = CURRENT_TIMESTAMP
            `, [
                userId,
                event.sessionId,
                event.id,
                userSettings.calendar_provider,
                event.title,
                event.start,
                event.end,
                'created'
            ]);
        }
        
        res.json({
            success: true,
            message: `Successfully synced ${calendarResult.eventsCreated} training events`,
            eventsCreated: calendarResult.eventsCreated,
            totalSessions: calendarResult.totalSessions,
            icsContent: calendarResult.icsContent
        });
        
    } catch (error) {
        console.error('Error syncing calendar:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/calendar/download-ics
 * Download ICS file for manual import
 */
router.get('/download-ics', requireAuth, async (req, res) => {
    try {
        const userId = req.user?.id || 1;
        const { startDate, endDate } = req.query;
        
        // Get training sessions
        let query = `SELECT * FROM training_sessions WHERE user_id = $1`;
        let params = [userId];
        
        if (startDate && endDate) {
            query += ` AND date BETWEEN $2 AND $3`;
            params.push(startDate, endDate);
        } else {
            // Default to current week
            query += ` AND date >= CURRENT_DATE AND date <= CURRENT_DATE + INTERVAL '7 days'`;
        }
        
        query += ` ORDER BY date`;
        
        const result = await database.query(query, params);
        const trainingSessions = result.rows;
        
        if (trainingSessions.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'No training sessions found for the specified date range'
            });
        }
        
        // Get user settings
        const settingsQuery = `SELECT * FROM calendar_user_settings WHERE user_id = $1`;
        const settingsResult = await database.query(settingsQuery, [userId]);
        const userSettings = settingsResult.rows[0] || {};
        
        // Generate ICS content
        const icsContent = await calendarService.generateICSFile(trainingSessions, {
            userId: userId,
            defaultTrainingTime: userSettings.default_training_time || '07:00',
            defaultLocation: userSettings.default_location || '',
            timezone: userSettings.timezone || 'Europe/Copenhagen',
            reminders: userSettings.reminder_settings || [
                { minutes: 60, description: '1 hour before training' }
            ]
        });
        
        // Set response headers for file download
        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="training-schedule.ics"');
        res.send(icsContent);
        
    } catch (error) {
        console.error('Error generating ICS file:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/calendar/events
 * Get calendar sync status and events
 */
router.get('/events', requireAuth, async (req, res) => {
    try {
        const userId = req.user?.id || 1;
        const { startDate, endDate } = req.query;
        
        let query = `
            SELECT 
                ce.*,
                ts.date,
                ts.type,
                ts.type as session_title,
                ts.description as session_description
            FROM calendar_events ce
            JOIN training_sessions ts ON ce.session_id = ts.id
            WHERE ce.user_id = $1
        `;
        let params = [userId];
        
        if (startDate && endDate) {
            query += ` AND ts.date BETWEEN $2 AND $3`;
            params.push(startDate, endDate);
        }
        
        query += ` ORDER BY ts.date, ce.event_start`;
        
        const result = await database.query(query, params);
        
        res.json({
            success: true,
            events: result.rows,
            total: result.rows.length
        });
        
    } catch (error) {
        console.error('Error getting calendar events:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/calendar/stats
 * Get calendar sync statistics
 */
router.get('/stats', requireAuth, async (req, res) => {
    try {
        const userId = req.user?.id || 1;
        const stats = await calendarService.getSyncStatistics(userId);
        
        res.json({
            success: true,
            stats: stats
        });
        
    } catch (error) {
        console.error('Error getting calendar stats:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * DELETE /api/calendar/events/:sessionId
 * Remove calendar event for specific training session
 */
router.delete('/events/:sessionId', requireAuth, async (req, res) => {
    try {
        const userId = req.user?.id || 1;
        const sessionId = req.params.sessionId;
        
        const query = `
            UPDATE calendar_events 
            SET sync_status = 'deleted', last_synced = CURRENT_TIMESTAMP
            WHERE user_id = $1 AND session_id = $2
            RETURNING *
        `;
        
        const result = await database.query(query, [userId, sessionId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Calendar event not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Calendar event marked as deleted',
            event: result.rows[0]
        });
        
    } catch (error) {
        console.error('Error deleting calendar event:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
