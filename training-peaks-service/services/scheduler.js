const cron = require('node-cron');
const axios = require('axios');

class PipelineScheduler {
    constructor() {
        this.jobs = [];
        this.isRunning = false;
        
        // Get schedule from environment or use defaults
        // Format: cron expression (see https://www.npmjs.com/package/node-cron)
        // Examples:
        // '0 20 * * 0' = Every Sunday at 20:00 (8 PM)
        // '0 6 * * 1' = Every Monday at 06:00 (6 AM)
        // '0 6 * * *' = Every day at 06:00 (6 AM)
        // '0 6,18 * * *' = Every day at 06:00 and 18:00
        this.schedules = (process.env.PIPELINE_SCHEDULE || '0 6 * * *').split(';').filter(s => s.trim());
        
        console.log(`📅 Pipeline scheduler configured with ${this.schedules.length} schedule(s):`);
        this.schedules.forEach((schedule, index) => {
            console.log(`   ${index + 1}. ${schedule}`);
        });
    }

    /**
     * Start all scheduled jobs
     */
    start() {
        if (this.isRunning) {
            console.log('⚠️ Scheduler already running');
            return;
        }

        console.log('🚀 Starting pipeline scheduler...');
        
        this.schedules.forEach((schedule, index) => {
            try {
                const job = cron.schedule(schedule.trim(), async () => {
                    console.log(`\n⏰ [SCHEDULER] Triggered by schedule #${index + 1}: ${schedule}`);
                    await this.runPipelineForAllUsers();
                }, {
                    scheduled: true,
                    timezone: process.env.TZ || 'Europe/Copenhagen'
                });
                
                this.jobs.push(job);
                console.log(`✅ Scheduled job #${index + 1}: ${schedule} (${process.env.TZ || 'Europe/Copenhagen'})`);
            } catch (error) {
                console.error(`❌ Failed to schedule job #${index + 1}: ${schedule}`, error.message);
            }
        });

        this.isRunning = true;
        console.log(`✅ Pipeline scheduler started with ${this.jobs.length} active job(s)`);
    }

    /**
     * Stop all scheduled jobs
     */
    stop() {
        console.log('🛑 Stopping pipeline scheduler...');
        this.jobs.forEach(job => job.stop());
        this.jobs = [];
        this.isRunning = false;
        console.log('✅ Pipeline scheduler stopped');
    }

    /**
     * Run pipeline for all users who have both TrainingPeaks and Garmin credentials
     */
    async runPipelineForAllUsers() {
        console.log('🔍 [SCHEDULER] Finding users with credentials...');
        
        try {
            // Determine which week to scrape based on day of week
            const today = new Date();
            const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
            const weekToScrape = dayOfWeek === 0 ? 'next' : 'current'; // Sunday = next week, otherwise current
            
            console.log(`📅 [SCHEDULER] Today is ${this.getDayName(dayOfWeek)}`);
            console.log(`📅 [SCHEDULER] Will scrape ${weekToScrape.toUpperCase()} week`);
            
            // Get all users who have both TP and Garmin credentials
            const users = await this.getUsersWithCredentials();
            
            if (users.length === 0) {
                console.log('ℹ️ [SCHEDULER] No users with complete credentials found');
                return;
            }

            console.log(`👥 [SCHEDULER] Found ${users.length} user(s) with credentials`);

            // Run pipeline for each user
            for (const user of users) {
                try {
                    console.log(`\n🚀 [SCHEDULER] Running pipeline for user ${user.id} (${user.email})...`);
                    await this.runPipelineForUser(user.id, weekToScrape);
                    console.log(`✅ [SCHEDULER] Pipeline completed for user ${user.id}`);
                } catch (error) {
                    console.error(`❌ [SCHEDULER] Pipeline failed for user ${user.id}:`, error.message);
                    // Continue with next user even if one fails
                }
            }

            console.log(`\n✅ [SCHEDULER] Completed pipeline run for ${users.length} user(s)`);
        } catch (error) {
            console.error('❌ [SCHEDULER] Error running scheduled pipeline:', error);
        }
    }

    /**
     * Get all users who have both TrainingPeaks and Garmin credentials
     */
    async getUsersWithCredentials() {
        const db = require('../db/database');
        const pool = db.getPool();

        try {
            // Query users who have both credential types
            const query = `
                SELECT DISTINCT u.id, u.email
                FROM users u
                WHERE EXISTS (
                    SELECT 1 FROM training_peaks_credentials tpc 
                    WHERE tpc.user_id = u.id AND tpc.encrypted_username IS NOT NULL
                )
                AND EXISTS (
                    SELECT 1 FROM garmin_credentials gc 
                    WHERE gc.user_id = u.id AND gc.encrypted_email IS NOT NULL
                )
                ORDER BY u.id;
            `;

            const result = await pool.query(query);
            return result.rows;
        } catch (error) {
            console.error('❌ Error fetching users with credentials:', error);
            return [];
        }
    }

    /**
     * Run the full pipeline for a specific user
     * This mimics what the API endpoint does
     */
    async runPipelineForUser(userId, weekToScrape = 'current') {
        const TrainingPeaksScraper = require('./scraper-with-session');
        const StorageService = require('./storage');
        const storageService = new StorageService();

        // Step 1: Get user's credentials
        const tpCredentials = await storageService.getUserCredentials(userId);
        if (!tpCredentials) {
            throw new Error(`No TrainingPeaks credentials found for user ${userId}`);
        }

        const garminCredentials = await storageService.getGarminCredentials(userId);
        if (!garminCredentials) {
            throw new Error(`No Garmin credentials found for user ${userId}`);
        }

        // Step 2: Get Monday of the week we want to scrape
        const mondayDate = this.getWeekMonday(weekToScrape);
        console.log(`📅 [SCHEDULER] Target week: ${weekToScrape.toUpperCase()} (starting ${mondayDate})`);

        // Step 3: Check if this week already has workouts in database
        const existingWorkouts = await this.checkWeekHasWorkouts(userId, mondayDate);
        if (existingWorkouts > 0) {
            console.log(`✅ [SCHEDULER] Week ${mondayDate} already has ${existingWorkouts} workout(s) in database - SKIPPING SCRAPE`);
            
            // Still check for any unsynced sessions for this week
            const unsyncedSessions = await storageService.getUnsyncedTrainingSessions(userId);
            const unsyncedForWeek = unsyncedSessions.filter(s => {
                const sessionDate = new Date(s.date);
                const weekStart = new Date(mondayDate);
                const weekEnd = new Date(mondayDate);
                weekEnd.setDate(weekEnd.getDate() + 6);
                return sessionDate >= weekStart && sessionDate <= weekEnd;
            });
            
            if (unsyncedForWeek.length > 0) {
                console.log(`🔍 [SCHEDULER] Found ${unsyncedForWeek.length} unsynced session(s) for this week - syncing to Garmin`);
                const syncedCount = await this.syncWorkoutsToGarmin(userId, unsyncedForWeek, garminCredentials, storageService);
                return { scraped: 0, synced: syncedCount, skipped: true };
            } else {
                console.log(`✅ [SCHEDULER] All workouts for week ${mondayDate} already synced - nothing to do`);
                return { scraped: 0, synced: 0, skipped: true };
            }
        }

        console.log(`🔍 [SCHEDULER] No workouts found for week ${mondayDate} - proceeding with scrape`);

        // Step 4: Scrape TrainingPeaks
        const scraper = new TrainingPeaksScraper(userId);
        const scrapedSessions = await scraper.scrapeWithCredentialsAndDate(
            tpCredentials.username,
            tpCredentials.password,
            mondayDate
        );

        if (!scrapedSessions || scrapedSessions.length === 0) {
            console.log(`ℹ️ [SCHEDULER] No training sessions found for user ${userId} for week ${mondayDate}`);
            return { scraped: 0, synced: 0, skipped: false };
        }

        console.log(`📊 [SCHEDULER] Found ${scrapedSessions.length} training session(s) for week ${mondayDate}`);

        // Step 5: Store sessions in database
        await storageService.storeTrainingSessions(userId, scrapedSessions, mondayDate);

        // Step 6: Find unsynced sessions
        const unsyncedSessions = await storageService.getUnsyncedTrainingSessions(userId);
        console.log(`🔍 [SCHEDULER] Found ${unsyncedSessions.length} unsynced session(s) across all weeks`);

        if (unsyncedSessions.length === 0) {
            console.log(`✅ [SCHEDULER] All sessions already synced`);
            return { scraped: scrapedSessions.length, synced: 0, skipped: false };
        }

        // Step 7: Sync to Garmin
        const syncedCount = await this.syncWorkoutsToGarmin(userId, unsyncedSessions, garminCredentials, storageService);

        console.log(`✅ [SCHEDULER] Synced ${syncedCount}/${unsyncedSessions.length} session(s)`);
        return { scraped: scrapedSessions.length, synced: syncedCount, skipped: false };
    }

    /**
     * Check if a specific week already has workouts in the database
     */
    async checkWeekHasWorkouts(userId, mondayDate) {
        const db = require('../db/database');
        const pool = db.getPool();

        try {
            // Calculate week end date (Sunday)
            const weekEnd = new Date(mondayDate);
            weekEnd.setDate(weekEnd.getDate() + 6);
            const weekEndStr = weekEnd.toISOString().split('T')[0];

            const query = `
                SELECT COUNT(*) as count
                FROM training_sessions
                WHERE user_id = $1
                AND date >= $2
                AND date <= $3
            `;

            const result = await pool.query(query, [userId, mondayDate, weekEndStr]);
            return parseInt(result.rows[0].count, 10);
        } catch (error) {
            console.error('❌ Error checking for existing workouts:', error);
            return 0; // On error, assume no workouts (will proceed with scrape)
        }
    }

    /**
     * Sync workouts to Garmin Connect
     */
    async syncWorkoutsToGarmin(userId, unsyncedSessions, garminCredentials, storageService) {
        const GarminConnectService = require('./garminService');
        const garminService = new GarminConnectService(userId);

        await garminService.authenticateWithStoredTokens(
            garminCredentials.email,
            garminCredentials.password
        );

        let syncedCount = 0;
        for (const session of unsyncedSessions) {
            try {
                console.log(`📅 [SCHEDULER] Scheduling workout: ${session.workout_name} for ${session.date}`);
                
                // Create workout in Garmin
                const workoutData = this.parseWorkoutFromSession(session);
                const client = garminService.getClient();
                const createdWorkout = await client.addWorkout(workoutData);
                
                if (!createdWorkout || !createdWorkout.workoutId) {
                    throw new Error('Failed to create workout in Garmin');
                }

                const actualWorkoutId = createdWorkout.workoutId;
                console.log(`✅ [SCHEDULER] Workout created with ID: ${actualWorkoutId}`);

                // Schedule to calendar
                const scheduleResult = await client.scheduleWorkout(
                    { workoutId: actualWorkoutId.toString() },
                    session.date
                );

                console.log(`✅ [SCHEDULER] Workout scheduled to calendar for ${session.date}`);

                // Mark as synced
                await storageService.markSessionAsSynced(session.id, actualWorkoutId);
                syncedCount++;

            } catch (error) {
                console.error(`❌ [SCHEDULER] Failed to sync session ${session.id}:`, error.message);
            }
        }

        return syncedCount;
    }

    /**
     * Get day name from day number
     */
    getDayName(dayOfWeek) {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return days[dayOfWeek];
    }

    /**
     * Get Monday of current or next week (ISO format YYYY-MM-DD)
     */
    getWeekMonday(week = 'current') {
        const now = new Date();
        const dayOfWeek = now.getDay();
        const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        
        const monday = new Date(now);
        monday.setDate(now.getDate() + diff);
        
        if (week === 'next') {
            monday.setDate(monday.getDate() + 7);
        }
        
        return monday.toISOString().split('T')[0];
    }

    /**
     * Parse session data into Garmin workout format
     */
    parseWorkoutFromSession(session) {
        const workoutName = session.workout_name || 'Running Workout';
        const description = session.description || '';
        
        return {
            workoutName: workoutName,
            description: description,
            sport: { sportTypeId: 1, sportTypeKey: 'running' },
            workoutProvider: null,
            workoutSourceId: null,
            updatedDate: new Date().toISOString(),
            createdDate: new Date().toISOString(),
            workoutSegments: [
                {
                    segmentOrder: 1,
                    sportType: { sportTypeId: 1, sportTypeKey: 'running' },
                    workoutSteps: [
                        {
                            type: 'ExecutableStepDTO',
                            stepId: null,
                            stepOrder: 1,
                            stepType: {
                                stepTypeId: 1,
                                stepTypeKey: 'warmup'
                            },
                            endCondition: {
                                conditionTypeKey: 'time',
                                conditionTypeId: 2
                            },
                            endConditionValue: session.duration || 3600,
                            targetType: {
                                workoutTargetTypeId: 1,
                                workoutTargetTypeKey: 'no.target'
                            }
                        }
                    ]
                }
            ]
        };
    }

    /**
     * Manually trigger pipeline for all users (for testing)
     */
    async triggerNow() {
        console.log('🔧 [SCHEDULER] Manual trigger requested');
        await this.runPipelineForAllUsers();
    }
}

// Export singleton instance
module.exports = new PipelineScheduler();
