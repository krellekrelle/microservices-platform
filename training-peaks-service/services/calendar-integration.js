const { ICalCalendar } = require('ical-generator');
const { v4: uuidv4 } = require('uuid');
const database = require('../db/database');

/**
 * Apple Calendar Integration Service
 * Phase 2: CalDAV protocol integration for automatic training event creation
 */
class CalendarIntegrationService {
    constructor() {
        this.calendarName = 'TrainingPeaks Schedule';
        this.eventPrefix = 'TP_';
    }

    /**
     * Create calendar events from training sessions
     * @param {Array} trainingSessions - Array of training sessions from database
     * @param {Object} userSettings - User calendar settings
     * @returns {Object} Calendar creation result
     */
    async createTrainingEvents(trainingSessions, userSettings = {}) {
        try {
            console.log(`Creating calendar events for ${trainingSessions.length} training sessions`);
            
            const calendar = new ICalCalendar({
                name: this.calendarName,
                timezone: userSettings.timezone || 'Europe/Copenhagen',
                description: 'Automated training schedule from TrainingPeaks'
            });

            const createdEvents = [];

            for (const session of trainingSessions) {
                const event = await this.createSingleEvent(calendar, session, userSettings);
                if (event) {
                    createdEvents.push(event);
                }
            }

            // Generate ICS file content
            const icsContent = calendar.toString();
            
            // Store calendar sync record
            await this.storeSyncRecord(trainingSessions, createdEvents.length, userSettings);

            return {
                success: true,
                eventsCreated: createdEvents.length,
                totalSessions: trainingSessions.length,
                icsContent: icsContent,
                calendar: calendar,
                events: createdEvents
            };

        } catch (error) {
            console.error('Error creating training events:', error);
            throw error;
        }
    }

    /**
     * Create a single calendar event from training session
     * @param {Object} calendar - ICS calendar instance
     * @param {Object} session - Training session data
     * @param {Object} userSettings - User preferences
     * @returns {Object} Created event details
     */
    async createSingleEvent(calendar, session, userSettings) {
        try {
            // Parse training session data
            const eventDate = new Date(session.date);
            const duration = this.parseTrainingDuration(session.description, session.duration);
            
            // Default training time from user settings or 07:00
            const defaultTime = userSettings.defaultTrainingTime || '07:00';
            const [hours, minutes] = defaultTime.split(':').map(Number);
            
            eventDate.setHours(hours, minutes, 0, 0);
            
            // Calculate end time
            const endDate = new Date(eventDate);
            endDate.setMinutes(endDate.getMinutes() + duration);

            // Create event
            const eventId = `${this.eventPrefix}${uuidv4()}`;
            const event = calendar.createEvent({
                id: eventId,
                start: eventDate,
                end: endDate,
                summary: this.createEventTitle(session),
                description: this.formatEventDescription(session),
                location: userSettings.defaultLocation || ''
                // Removed categories and alarms as they might be causing issues
            });

            console.log(`Created event: ${event.summary()} on ${eventDate.toISOString()}`);

            return {
                id: eventId,
                title: event.summary(),
                start: eventDate,
                end: endDate,
                sessionId: session.id,
                type: session.type
            };

        } catch (error) {
            console.error(`Error creating event for session ${session.id}:`, error);
            return null;
        }
    }

    /**
     * Create event title from training session
     * @param {Object} session - Training session data
     * @returns {string} Event title
     */
    createEventTitle(session) {
        const typeEmoji = {
            'Running': '🏃‍♂️',
            'Cycling': '🚴‍♂️',
            'Swimming': '🏊‍♂️',
            'Strength': '💪',
            'Recovery': '🧘‍♂️',
            'Other': '🏋️‍♂️'
        };

        const emoji = typeEmoji[session.type] || typeEmoji.Other;
        const baseTitle = session.title || `${session.type} Training`;
        
        return `${emoji} ${baseTitle}`;
    }

    /**
     * Format event description with training details
     * @param {Object} session - Training session data
     * @returns {string} Formatted description
     */
    formatEventDescription(session) {
        let description = `🎯 Training Details:\n\n`;
        
        if (session.description && session.description.trim()) {
            description += `📋 Workout Description:\n${session.description}\n\n`;
        }
        
        if (session.duration) {
            description += `⏱️ Duration: ${session.duration}\n`;
        }
        
        if (session.type) {
            description += `🏃 Type: ${session.type}\n`;
        }
        
        description += `\n📱 Synced from TrainingPeaks\n`;
        description += `🕐 Created: ${new Date().toLocaleString()}`;
        
        return description;
    }

    /**
     * Get training category for calendar organization
     * @param {string} type - Training type
     * @returns {string} Calendar category
     */
    getTrainingCategory(type) {
        const categories = {
            'Running': 'Running',
            'Cycling': 'Cycling', 
            'Swimming': 'Swimming',
            'Strength': 'Fitness',
            'Recovery': 'Health',
            'Other': 'Sports'
        };
        
        return categories[type] || 'Sports';
    }

    /**
     * Parse training duration from description or duration field
     * @param {string} description - Training description
     * @param {string} duration - Duration field
     * @returns {number} Duration in minutes
     */
    parseTrainingDuration(description, duration) {
        // Try duration field first
        if (duration) {
            const durationMatch = duration.match(/(\d+)\s*(min|hour|hr)/i);
            if (durationMatch) {
                const value = parseInt(durationMatch[1]);
                const unit = durationMatch[2].toLowerCase();
                return unit.startsWith('hour') || unit === 'hr' ? value * 60 : value;
            }
        }

        // Parse from description
        if (description) {
            // Look for time patterns like "4 km" -> estimate 20-25 min
            const kmMatch = description.match(/(\d+(?:\.\d+)?)\s*km/i);
            if (kmMatch) {
                const km = parseFloat(kmMatch[1]);
                return Math.round(km * 6); // ~6 min per km estimate
            }

            // Look for minute patterns
            const minMatch = description.match(/(\d+)\s*min/i);
            if (minMatch) {
                return parseInt(minMatch[1]);
            }

            // Look for rep patterns - estimate based on sets
            const repsMatch = description.match(/(\d+)x\s*\d+/g);
            if (repsMatch) {
                return Math.max(45, repsMatch.length * 15); // 15 min per set group
            }
        }

        // Default duration by type
        return 60; // 1 hour default
    }

    /**
     * Create event reminders based on user settings
     * @param {Object} userSettings - User reminder preferences
     * @returns {Array} Array of alarm objects
     */
    createEventReminders(userSettings) {
        const reminders = [];
        
        // Default reminders if not specified
        const defaultReminders = userSettings.reminders || [
            { minutes: 60, description: '1 hour before training' },
            { minutes: 15, description: '15 minutes before training' }
        ];

        for (const reminder of defaultReminders) {
            reminders.push({
                type: 'display',
                trigger: reminder.minutes * 60, // Convert to seconds
                description: reminder.description
            });
        }

        return reminders;
    }

    /**
     * Store calendar sync record in database
     * @param {Array} sessions - Training sessions
     * @param {number} eventsCreated - Number of events created
     * @param {Object} userSettings - User settings
     */
    async storeSyncRecord(sessions, eventsCreated, userSettings) {
        try {
            const query = `
                INSERT INTO calendar_sync_logs (
                    user_id, sync_date, sessions_processed, events_created, 
                    sync_type, settings, status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            `;
            
            await database.query(query, [
                userSettings.userId || 1,
                new Date(),
                sessions.length,
                eventsCreated,
                'apple_calendar',
                JSON.stringify(userSettings),
                'completed'
            ]);

            console.log(`Stored sync record: ${eventsCreated}/${sessions.length} events created`);
        } catch (error) {
            console.error('Error storing sync record:', error);
            // Don't throw - this is logging only
        }
    }

    /**
     * Generate ICS file for direct calendar import
     * @param {Array} trainingSessions - Training sessions
     * @param {Object} userSettings - User settings
     * @returns {string} ICS file content
     */
    async generateICSFile(trainingSessions, userSettings = {}) {
        const result = await this.createTrainingEvents(trainingSessions, userSettings);
        return result.icsContent;
    }

    /**
     * Get calendar sync statistics
     * @param {number} userId - User ID
     * @returns {Object} Sync statistics
     */
    async getSyncStatistics(userId) {
        try {
            const query = `
                SELECT 
                    COUNT(*) as total_syncs,
                    SUM(events_created) as total_events,
                    MAX(sync_date) as last_sync,
                    AVG(events_created::float / sessions_processed) as avg_success_rate
                FROM calendar_sync_logs 
                WHERE user_id = $1 AND status = 'completed'
            `;
            
            const result = await database.query(query, [userId]);
            return result.rows[0] || {
                total_syncs: 0,
                total_events: 0,
                last_sync: null,
                avg_success_rate: 0
            };
        } catch (error) {
            console.error('Error getting sync statistics:', error);
            return { error: error.message };
        }
    }
}

module.exports = CalendarIntegrationService;
