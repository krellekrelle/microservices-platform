// Garmin Connect API routes
// Handles Garmin authentication, workout creation, and sync management

const express = require('express');
const router = express.Router();
const GarminConnectService = require('../services/garminService');
const StorageService = require('../services/storage');
const metricsService = require('../services/metrics');
const crypto = require('crypto');

// Initialize services
const garminService = new GarminConnectService();
const storageService = new StorageService();

/**
 * Test Garmin Connect credentials and API access
 * POST /training/api/garmin/test-credentials
 */
router.post('/test-credentials', async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Get saved Garmin credentials
        const credentials = await storageService.getGarminCredentials(userId);
        
        if (!credentials || !credentials.username || !credentials.decrypted_password) {
            return res.status(400).json({ 
                error: 'No Garmin credentials found. Please save your credentials first.' 
            });
        }

        console.log(`🔐 Testing saved Garmin credentials for user ${userId}`);
        
        // Test connection to Garmin Connect with session reuse
        const testResult = await garminService.testConnection(
            credentials.username, 
            credentials.decrypted_password, 
            userId
        );
        
        // Log the test attempt
        await storageService.logGarminSync(
            userId, 
            'test', 
            'auth', 
            testResult.authentication,
            testResult.error || null,
            { username: credentials.username },
            testResult
        );

        if (testResult.authentication) {
            res.json({
                success: true,
                message: 'Garmin Connect credentials are valid',
                details: {
                    apiAccess: testResult.apiAccess,
                    userInfo: testResult.userInfo,
                    tokenReused: testResult.tokenReused
                }
            });
        } else {
            res.status(400).json({
                success: false,
                error: 'Invalid Garmin Connect credentials or login failed',
                details: testResult.error
            });
        }

        // Cleanup connection
        garminService.disconnect();

    } catch (error) {
        console.error('Error testing Garmin credentials:', error);
        res.status(500).json({ 
            error: 'Failed to test Garmin credentials',
            details: error.message 
        });
    }
});

/**
 * Save Garmin Connect credentials
 * POST /training/api/garmin/credentials
 */
router.post('/credentials', async (req, res) => {
    try {
        const userId = req.user.id;
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ 
                error: 'Username and password are required' 
            });
        }

        // Test credentials before saving
        console.log(`🔐 Testing Garmin credentials before saving for user ${userId}`);
        const testResult = await garminService.testConnection(username, password);
        
        if (!testResult.authentication) {
            return res.status(400).json({
                error: 'Invalid Garmin Connect credentials. Please check your username and password.',
                details: testResult.error
            });
        }

        // Save credentials if test successful
        await storageService.storeGarminCredentials(userId, username, password);
        
        console.log(`✅ Garmin credentials saved for user ${userId}`);
        
        // Automatically sync devices after credentials are saved
        try {
            console.log(`🔄 Auto-syncing devices for user ${userId}`);
            const deviceSyncService = require('../services/deviceSyncService');
            const devices = await deviceSyncService.syncUserDevices(userId);
            console.log(`✅ Auto-synced ${devices.length} devices for user ${userId}`);
        } catch (deviceError) {
            console.error(`⚠️ Device sync failed for user ${userId}:`, deviceError);
            // Don't fail the credential save if device sync fails
        }
        
        res.json({
            success: true,
            message: 'Garmin Connect credentials saved successfully',
            details: {
                apiAccess: testResult.apiAccess,
                userInfo: testResult.userInfo
            }
        });

        // Cleanup connection
        garminService.disconnect();

    } catch (error) {
        console.error('Error saving Garmin credentials:', error);
        res.status(500).json({ 
            error: 'Failed to save Garmin credentials',
            details: error.message 
        });
    }
});

/**
 * Get Garmin credentials status
 * GET /training/api/garmin/credentials
 */
router.get('/credentials', async (req, res) => {
    try {
        const userId = req.user.id;
        const credentials = await storageService.getGarminCredentials(userId);
        
        res.json({
            hasCredentials: !!credentials,
            username: credentials ? credentials.username : null,
            lastAuth: credentials ? credentials.last_successful_auth : null,
            authFailures: credentials ? credentials.auth_failures : 0,
            isActive: credentials ? credentials.is_active : false
        });

    } catch (error) {
        console.error('Error getting Garmin credentials:', error);
        res.status(500).json({ error: 'Failed to get credentials status' });
    }
});

/**
 * Delete Garmin credentials
 * DELETE /training/api/garmin/credentials
 */
router.delete('/credentials', async (req, res) => {
    try {
        const userId = req.user.id;
        await storageService.deleteGarminCredentials(userId);
        
        res.json({ 
            success: true, 
            message: 'Garmin credentials deleted successfully' 
        });

    } catch (error) {
        console.error('Error deleting Garmin credentials:', error);
        res.status(500).json({ error: 'Failed to delete credentials' });
    }
});

/**
 * Sync specific training session to Garmin
 * POST /training/api/garmin/sync-session/:sessionId
 */
router.post('/sync-session/:sessionId', async (req, res) => {
    try {
        const userId = req.user.id;
        const sessionId = parseInt(req.params.sessionId);

        // Get training session
        const session = await storageService.getTrainingSession(userId, sessionId);
        if (!session) {
            return res.status(404).json({
                error: 'Training session not found'
            });
        }

        // Get Garmin credentials
        const credentials = await storageService.getGarminCredentials(userId);
        if (!credentials) {
            return res.status(400).json({
                error: 'No Garmin credentials found. Please add your credentials first.'
            });
        }

        console.log(`🔄 Syncing training session ${sessionId} to Garmin for user ${userId}`);

        // Authenticate with Garmin
        const authSuccess = await garminService.authenticate(
            credentials.username,
            credentials.decrypted_password
        );

        if (!authSuccess) {
            return res.status(400).json({
                error: 'Failed to authenticate with Garmin Connect'
            });
        }

        // Parse training description and create workout
        const workoutData = await parseTrainingToWorkout(session);
        const result = await garminService.createRunningWorkout(workoutData);

        // Record sync attempt
        await storageService.recordGarminWorkoutSync(
            userId,
            sessionId,
            result.workoutId,
            workoutData.name,
            result.success ? 'success' : 'failed',
            result.error,
            workoutData,
            result.data
        );

        if (result.success) {
            // Update training session sync status
            await storageService.markTrainingSessionGarminSynced(sessionId);
            
            res.json({
                success: true,
                message: 'Training session synced to Garmin successfully',
                workoutId: result.workoutId
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Failed to sync training session',
                details: result.error
            });
        }

        // Cleanup connection
        garminService.disconnect();

    } catch (error) {
        console.error('Error syncing training session:', error);
        res.status(500).json({
            error: 'Failed to sync training session',
            details: error.message
        });
    }
});

/**
 * Get Garmin sync status and history
 * GET /training/api/garmin/sync-status
 */
router.get('/sync-status', async (req, res) => {
    try {
        const userId = req.user.id;
        
        const syncHistory = await storageService.getGarminSyncHistory(userId);
        const workoutSyncs = await storageService.getGarminWorkoutSyncs(userId);
        
        res.json({
            syncHistory,
            workoutSyncs,
            summary: {
                totalSyncs: workoutSyncs.length,
                successfulSyncs: workoutSyncs.filter(sync => sync.sync_status === 'success').length,
                failedSyncs: workoutSyncs.filter(sync => sync.sync_status === 'failed').length,
                pendingSyncs: workoutSyncs.filter(sync => sync.sync_status === 'pending').length
            }
        });

    } catch (error) {
        console.error('Error getting sync status:', error);
        res.status(500).json({ error: 'Failed to get sync status' });
    }
});

/**
 * Create workout from training description using AI parsing
 * POST /training/api/garmin/create-workout
 */
router.post('/create-workout', async (req, res) => {
    try {
        const userId = req.user.id;
        const { description, workoutName, workoutDate } = req.body;
        
        console.log(`🤖 [DEBUG] AI Workout Creation - User: ${userId}`);
        console.log(`🤖 [DEBUG] AI Workout Creation - Description: "${description}"`);
        console.log(`🤖 [DEBUG] AI Workout Creation - Workout Name: "${workoutName || 'Auto-generated'}"`);
        console.log(`🤖 [DEBUG] AI Workout Creation - Date: "${workoutDate || 'Current date'}"`);
        
        if (!description) {
            console.log('❌ [DEBUG] AI Workout Creation - Missing description');
            return res.status(400).json({
                error: 'Training description is required'
            });
        }

        // Get user's Garmin credentials
        console.log(`🔍 [DEBUG] AI Workout Creation - Getting Garmin credentials for user ${userId}`);
        const credentials = await storageService.getGarminCredentials(userId);
        if (!credentials) {
            console.log(`❌ [DEBUG] AI Workout Creation - No credentials found for user ${userId}`);
            return res.status(400).json({
                error: 'No Garmin credentials found. Please add your credentials first.'
            });
        }

        console.log(`✅ [DEBUG] AI Workout Creation - Found credentials for user: ${credentials.username}`);

        // Authenticate with Garmin (with session reuse)
        console.log(`� [DEBUG] AI Workout Creation - Authenticating with Garmin Connect`);
        const authSuccess = await garminService.authenticate(
            credentials.username, 
            credentials.decrypted_password,
            userId
        );

        if (!authSuccess) {
            console.log(`❌ [DEBUG] AI Workout Creation - Authentication failed`);
            return res.status(400).json({
                error: 'Failed to authenticate with Garmin Connect. Please check your credentials.'
            });
        }

        console.log(`✅ [DEBUG] AI Workout Creation - Authentication successful`);

        // Create workout using AI parsing
        console.log(`🤖 [DEBUG] AI Workout Creation - Starting AI parsing and workout creation`);
        const result = await garminService.createWorkoutFromDescription(
            description,
            workoutDate,
            workoutName
        );

        console.log(`🎉 [DEBUG] AI Workout Creation - Received result:`, result.success ? 'SUCCESS' : 'FAILED');
        console.log(`📊 [DEBUG] AI Workout Creation - Result:`, JSON.stringify(result, null, 2));

        // Log the sync attempt (both success and failure)
        await storageService.logGarminSync(
            userId,
            'manual',
            'create_intelligent_workout',
            result.success,
            result.error || null,
            { description, workoutName, workoutDate },
            result
        );

        console.log(`✅ [DEBUG] AI Workout Creation - Sync logged successfully`);
        
        if (result.success) {
            // Auto-push workout to enabled devices
            try {
                console.log(`� DEBUG: Auto-push workoutId type:`, typeof result.workoutId);
                console.log(`🔍 DEBUG: Auto-push workoutId value:`, result.workoutId);
                
                // Extract the actual ID if workoutId is an object
                let actualWorkoutId = result.workoutId;
                if (typeof result.workoutId === 'object' && result.workoutId !== null) {
                    // If it's an object, try to find the ID property
                    actualWorkoutId = result.workoutId.id || result.workoutId.workoutId || result.workoutId.workoutKey || String(result.workoutId);
                    console.log(`🔍 DEBUG: Extracted workoutId:`, actualWorkoutId);
                }
                
                console.log(`🔄 Auto-pushing workout ${actualWorkoutId} to enabled devices for user ${userId}`);
                
                // get devices
                const enabledDevices = await garminService.getEnabledDevicesForUser(userId);

                console.log('enabledDevices:', enabledDevices);

                const client = garminService.client;

                for (const device of enabledDevices) {
                    console.log(`🔄 Auto-pushing workout ${actualWorkoutId} to device ${device.device_name}`);
                    const syncResult = await client.pushWorkoutToDevice(
                        { workoutId: actualWorkoutId.toString() },
                        device.device_id,
                    );
                    console.log('syncResult:', syncResult);
                    console.log(`✅ Auto-pushed workout ${actualWorkoutId} to device ${device.device_name}`);

                }
            } catch (deviceError) {
                console.error(`⚠️ Device auto-push failed:`, deviceError);
                // Don't fail the workout creation if device push fails
            }
            
            res.json({
                success: true,
                message: 'Workout created successfully using AI parsing!',
                workoutId: result.workoutId,
                workoutName: result.workoutName,
                originalDescription: result.originalDescription,
                estimatedDistance: result.estimatedDistance,
                estimatedDuration: result.estimatedDuration,
                stepsCount: result.stepsCount,
                generatedJson: result.parsedWorkout, // Include the LLM-generated JSON
                details: result.parsedWorkout
            });
        } else {
            // Return failure without throwing error - allows frontend to handle gracefully
            res.status(400).json({
                success: false,
                error: 'AI workout creation failed',
                message: `Failed to create workout: ${result.error}`,
                originalDescription: result.originalDescription,
                failurePoint: result.failurePoint,
                details: result.details
            });
        }

        // Cleanup connection
        garminService.disconnect();

    } catch (error) {
        console.error('❌ [DEBUG] AI Workout Creation - Error:', error);
        console.error('❌ [DEBUG] AI Workout Creation - Stack:', error.stack);
        
        // Check if this is a parsing error with detailed information
        if (error.details && error.details.failurePoint) {
            res.status(400).json({
                error: 'AI Parsing Failed',
                message: error.message,
                failurePoint: error.details.failurePoint,
                detailedError: error.details.detailedError,
                originalError: error.details.originalError,
                description: error.details.description,
                workoutName: error.details.workoutName,
                timestamp: error.details.timestamp
            });
        } else {
            // Generic error
            res.status(500).json({
                error: 'Failed to create workout from description',
                details: error.message
            });
        }
    }
});

/**
 * Create workout from provided JSON data
 * POST /training/api/garmin/create-from-json
 */
router.post('/create-from-json', async (req, res) => {
    try {
        const userId = req.user.id;
        const { workoutJson } = req.body;
        
        console.log(`📋 [DEBUG] JSON Workout Creation - User: ${userId}`);
        console.log(`📋 [DEBUG] JSON Workout Creation - JSON provided:`, !!workoutJson);
        
        if (!workoutJson) {
            console.log('❌ [DEBUG] JSON Workout Creation - Missing workout JSON');
            return res.status(400).json({
                error: 'Workout JSON is required'
            });
        }

        // Validate JSON structure
        if (!workoutJson.workoutName || !workoutJson.workoutSegments) {
            console.log('❌ [DEBUG] JSON Workout Creation - Invalid JSON structure');
            return res.status(400).json({
                error: 'Invalid workout JSON structure. Must include workoutName and workoutSegments.'
            });
        }

        // Get user's Garmin credentials
        console.log(`🔍 [DEBUG] JSON Workout Creation - Getting Garmin credentials for user ${userId}`);
        const credentials = await storageService.getGarminCredentials(userId);
        if (!credentials) {
            console.log(`❌ [DEBUG] JSON Workout Creation - No credentials found for user ${userId}`);
            return res.status(400).json({
                error: 'No Garmin credentials found. Please add your credentials first.'
            });
        }

        console.log(`✅ [DEBUG] JSON Workout Creation - Found credentials for user: ${credentials.username}`);

        // Authenticate with Garmin (with session reuse)
        console.log(`🔑 [DEBUG] JSON Workout Creation - Authenticating with Garmin Connect`);
        const authSuccess = await garminService.authenticate(
            credentials.username, 
            credentials.decrypted_password,
            userId
        );

        if (!authSuccess) {
            console.log(`❌ [DEBUG] JSON Workout Creation - Authentication failed`);
            return res.status(400).json({
                error: 'Failed to authenticate with Garmin Connect. Please check your credentials.'
            });
        }

        console.log(`✅ [DEBUG] JSON Workout Creation - Authentication successful`);

        // Create workout from JSON using the service method
        console.log(`🚀 [DEBUG] JSON Workout Creation - Creating workout on Garmin Connect`);
        console.log(`🏃 [DEBUG] JSON Workout Creation - Workout Name: "${workoutJson.workoutName}"`);
        
        const result = await garminService.createWorkoutFromJson(workoutJson);

        console.log(`🎉 [DEBUG] JSON Workout Creation - Success! Workout ID: ${result.workoutId}`);

        // Log the sync attempt
        await storageService.logGarminSync(
            userId,
            'manual',
            'create_from_json',
            result.success,
            null,
            { workoutJson: workoutJson.workoutName },
            result
        );

        console.log(`✅ [DEBUG] JSON Workout Creation - Sync logged successfully`);
        
        res.json({
            success: true,
            message: 'Workout created successfully from JSON!',
            workoutId: result.workoutId,
            workoutName: result.workoutName,
            estimatedDistance: result.estimatedDistance,
            estimatedDuration: result.estimatedDuration,
            stepsCount: result.stepsCount,
            cleanedJson: result.cleanedJson
        });

        // Cleanup connection
        garminService.disconnect();

    } catch (error) {
        console.error('❌ [DEBUG] JSON Workout Creation - Error:', error);
        console.error('❌ [DEBUG] JSON Workout Creation - Stack:', error.stack);
        
        res.status(500).json({
            error: 'Failed to create workout from JSON',
            details: error.message
        });
    }
});

/**
 * Get pipeline status with statistics
 * GET /training/api/garmin/pipeline-status
 */

/**
 * Parse training session description into Garmin workout format
 * This is a simple parser for running workouts - can be expanded later
 */
async function parseTrainingToWorkout(session) {
    const workoutData = {
        name: session.title || `Training - ${session.session_date}`,
        description: session.description || 'Training session from TrainingPeaks',
        distance: 5000, // Default 5K - TODO: parse from description
        paceMinSlow: '5:00', // Default pace - TODO: parse from description
        paceMaxFast: '5:10'
    };

    // Simple parsing logic - look for distance and pace indicators
    const description = session.description || '';
    
    // Look for distance (e.g., "5 km", "10k", "8000m")
    const distanceMatch = description.match(/(\d+)\s?(km|k|meter|m)/i);
    if (distanceMatch) {
        const value = parseInt(distanceMatch[1]);
        if (distanceMatch[2].toLowerCase().includes('k')) {
            workoutData.distance = value * 1000; // Convert km to meters
        } else {
            workoutData.distance = value; // Already in meters
        }
    }

    // Look for pace (e.g., "4.05", "4:05", "5.15-5.30")
    const paceMatch = description.match(/(\d+)[\.:](\d+)[\s-]*(\d+)[\.:](\d+)/);
    if (paceMatch) {
        workoutData.paceMinSlow = `${paceMatch[1]}:${paceMatch[2].padStart(2, '0')}`;
        workoutData.paceMaxFast = `${paceMatch[3]}:${paceMatch[4].padStart(2, '0')}`;
    }

    console.log('📝 Parsed workout data:', workoutData);
    return workoutData;
}

/**
 * Full pipeline: Scrape current/next week → Create workouts → Push to devices
 * POST /training/api/garmin/full-pipeline
 * Body: { week: 'current' | 'next' } (optional, defaults to 'current')
 */
router.post('/full-pipeline', async (req, res) => {
    try {
        const userId = req.user.id;
        const week = req.body.week || 'current'; // Default to current week
        console.log(`🚀 [PIPELINE] Starting full pipeline for user ${userId} - ${week} week`);

        // Track that a scrape was initiated (manual trigger)
        await metricsService.recordScrape(false); // false = not skipped

        // Step 1: Get Monday of specified week (current or next)
        const mondayDate = getWeekMonday(week);
        console.log(`📅 [PIPELINE] ${week === 'next' ? 'Next' : 'Current'} week Monday: ${mondayDate}`);

        // Step 2: Get user's TrainingPeaks credentials
        const tpCredentials = await storageService.getUserCredentials(userId);
        if (!tpCredentials) {
            return res.status(400).json({
                error: 'No TrainingPeaks credentials found. Please add your credentials first.'
            });
        }

        // Step 3: Get user's Garmin credentials
        const garminCredentials = await storageService.getGarminCredentials(userId);
        if (!garminCredentials) {
            return res.status(400).json({
                error: 'No Garmin credentials found. Please add your Garmin credentials first.'
            });
        }

        console.log(`✅ [PIPELINE] Found both TrainingPeaks and Garmin credentials`);

        // Step 4: Initialize scraper and scrape specified week
        const TrainingPeaksScraper = require('../services/scraper-with-session');
        const scraper = new TrainingPeaksScraper(userId);
        
        console.log(`🔍 [PIPELINE] Starting TrainingPeaks scraping for week ${mondayDate}`);
        const scrapedSessions = await scraper.scrapeWithCredentialsAndDate(
            tpCredentials.username, 
            tpCredentials.password,
            mondayDate
        );

        // Step 5: Flatten scraped data and filter out empty sessions
        const allWorkouts = [];
        scrapedSessions.forEach(day => {
            day.workouts.forEach(workout => {
                // Only include workouts that have actual training data
                if (workout.title || workout.description) {
                    allWorkouts.push({
                        title: workout.title,
                        description: workout.description,
                        session_date: day.date,
                        type: workout.type,
                        duration: workout.duration,
                        distance: workout.distance
                    });
                }
            });
        });

        console.log(`📊 [PIPELINE] Found ${allWorkouts.length} actual training sessions (filtered from ${scrapedSessions.length} days)`);

        // Step 6: Store scraped sessions in database
        if (scrapedSessions.length > 0) {
            await storageService.storeTrainingSessions(userId, scrapedSessions);
            await storageService.logScrapingAttempt(userId, 'pipeline', 'success', 'Pipeline scraping successful', allWorkouts.length);
        }

        // Step 7: Get only unsynced sessions from the database to avoid duplicates
        // Calculate the date range for the week
        const weekStart = new Date(mondayDate);
        const weekEnd = new Date(mondayDate);
        weekEnd.setDate(weekEnd.getDate() + 6); // Sunday
        
        const unsyncedSessions = await storageService.getUnsyncedTrainingSessions(
            userId,
            mondayDate,
            weekEnd.toISOString().split('T')[0]
        );

        console.log(`🔍 [PIPELINE] Found ${unsyncedSessions.length} unsynced sessions out of ${allWorkouts.length} total sessions`);
        
        if (unsyncedSessions.length === 0) {
            console.log(`✅ [PIPELINE] All training sessions already synced to Garmin. No duplicates created.`);
            await scraper.cleanup();
            return res.json({
                success: true,
                message: 'All training sessions already synced to Garmin',
                scraped: allWorkouts.length,
                newWorkouts: 0,
                alreadySynced: allWorkouts.length,
                workoutResults: []
            });
        }

        // Step 8: Authenticate with Garmin once for all operations
        console.log(`🔐 [PIPELINE] Authenticating with Garmin Connect`);
        const authSuccess = await garminService.authenticate(
            garminCredentials.username, 
            garminCredentials.decrypted_password,
            userId
        );

        if (!authSuccess) {
            return res.status(400).json({
                error: 'Failed to authenticate with Garmin Connect. Please check your credentials.'
            });
        }

        // Step 9: Process only unsynced training sessions - create workout and push to devices
        const workoutResults = [];
        
        for (let i = 0; i < unsyncedSessions.length; i++) {
            const session = unsyncedSessions[i];
            console.log(`🏃 [PIPELINE] Processing unsynced session ${i + 1}/${unsyncedSessions.length}: "${session.workout_name || 'Untitled'}"`);
            
            // Map database session fields to match the old structure
            const sessionData = {
                title: session.workout_name,
                description: session.description,
                session_date: session.session_date,
                type: session.type,
                duration: session.duration,
                distance: session.distance
            };

            try {
                // Create workout using AI parsing
                const workoutResult = await garminService.createWorkoutFromDescription(
                    sessionData.description,
                    sessionData.session_date,
                    sessionData.title
                );

                if (workoutResult.success) {
                    // Track workout creation
                    await metricsService.recordWorkoutCreated();
                    
                    // Schedule workout to Garmin calendar for the session date
                    try {
                        console.log(`📅 [PIPELINE] Scheduling workout ${workoutResult.workoutId} to calendar for ${sessionData.session_date}`);
                        
                        // Extract the actual ID if workoutId is an object
                        let actualWorkoutId = workoutResult.workoutId;
                        if (typeof workoutResult.workoutId === 'object' && workoutResult.workoutId !== null) {
                            actualWorkoutId = workoutResult.workoutId.id || workoutResult.workoutId.workoutId || workoutResult.workoutId.workoutKey || String(workoutResult.workoutId);
                        }
                        
                        // Schedule the workout to the calendar
                        const client = garminService.client;
                        const scheduleResult = await client.scheduleWorkout(
                            { workoutId: actualWorkoutId.toString() },
                            sessionData.session_date
                        );
                        
                        // Track workout scheduling
                        await metricsService.recordWorkoutScheduled();
                        
                        console.log(`✅ [PIPELINE] Successfully scheduled to calendar with schedule ID: ${scheduleResult.workoutScheduleId}`);
                        
                        // Mark the session as synced in the database
                        await storageService.markTrainingSessionGarminSynced(session.id, actualWorkoutId.toString());
                        
                        workoutResults.push({
                            session: sessionData.title,
                            date: sessionData.session_date,
                            workoutId: actualWorkoutId,
                            scheduleId: scheduleResult.workoutScheduleId,
                            status: 'success',
                            method: 'scheduled_to_calendar'
                        });
                        
                        console.log(`✅ [PIPELINE] Successfully processed session: ${sessionData.title}`);
                    } catch (scheduleError) {
                        console.log(`⚠️ [PIPELINE] Workout created but calendar scheduling failed: ${scheduleError.message}`);
                        workoutResults.push({
                            session: sessionData.title,
                            date: sessionData.session_date,
                            workoutId: workoutResult.workoutId,
                            status: 'workout_created_schedule_failed',
                            error: scheduleError.message
                        });
                    }
                } else {
                    console.log(`❌ [PIPELINE] Failed to create workout for session: ${sessionData.title}`);
                    workoutResults.push({
                        session: sessionData.title,
                        date: sessionData.session_date,
                        status: 'workout_creation_failed',
                        error: workoutResult.error
                    });
                }

                // Log the workout creation attempt
                await storageService.logGarminSync(
                    userId,
                    'pipeline',
                    'create_workout',
                    workoutResult.success,
                    workoutResult.error || null,
                    { description: sessionData.description, title: sessionData.title, date: sessionData.session_date },
                    workoutResult
                );

            } catch (sessionError) {
                console.error(`❌ [PIPELINE] Error processing session ${sessionData.title}:`, sessionError);
                workoutResults.push({
                    session: sessionData.title,
                    date: sessionData.session_date,
                    status: 'processing_error',
                    error: sessionError.message
                });
            }
        }

        // Step 10: Close scraper
        await scraper.cleanup();

        // Step 11: Return comprehensive results
        const successfulWorkouts = workoutResults.filter(r => r.status === 'success').length;
        const totalScraped = allWorkouts.length;
        const alreadySynced = totalScraped - unsyncedSessions.length;

        console.log(`🎉 [PIPELINE] Pipeline completed: ${successfulWorkouts}/${unsyncedSessions.length} new sessions synced (${alreadySynced} already synced)`);

        res.json({
            success: true,
            message: `Pipeline completed: ${successfulWorkouts}/${unsyncedSessions.length} new sessions processed, ${alreadySynced} already synced`,
            weekStartDate: mondayDate,
            scrapedDays: scrapedSessions.length,
            actualTrainingSessions: totalScraped,
            newWorkouts: unsyncedSessions.length,
            alreadySynced: alreadySynced,
            workoutResults: workoutResults,
            summary: {
                totalScraped: totalScraped,
                newSessions: unsyncedSessions.length,
                alreadySynced: alreadySynced,
                successfulWorkouts,
                failedWorkouts: unsyncedSessions.length - successfulWorkouts,
                completionRate: unsyncedSessions.length > 0 ? Math.round((successfulWorkouts / unsyncedSessions.length) * 100) : 0
            }
        });

    } catch (error) {
        console.error('❌ [PIPELINE] Full pipeline failed:', error);
        
        // Log the pipeline failure
        await storageService.logScrapingAttempt(
            req.user.id, 
            'pipeline', 
            'error', 
            `Pipeline failed: ${error.message}`, 
            0
        );

        res.status(500).json({
            error: 'Full pipeline failed',
            details: error.message
        });
    }
});

/**
 * Helper function to get Monday of current or next week
 * @param {string} week - 'current' or 'next'
 */
function getWeekMonday(week = 'current') {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
    
    // Calculate days to subtract to get to Monday
    const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // If Sunday, go back 6 days
    
    const monday = new Date(today);
    monday.setDate(today.getDate() - daysToSubtract);
    
    // If next week is requested, add 7 days
    if (week === 'next') {
        monday.setDate(monday.getDate() + 7);
    }
    
    // Format as YYYY-MM-DD
    const year = monday.getFullYear();
    const month = String(monday.getMonth() + 1).padStart(2, '0');
    const day = String(monday.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
}

/**
 * Helper function to get Monday of current week (for backward compatibility)
 */
function getCurrentWeekMonday() {
    return getWeekMonday('current');
}

module.exports = router;
