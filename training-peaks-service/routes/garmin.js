// Garmin Connect API routes
// Handles Garmin authentication, workout creation, and sync management

const express = require('express');
const router = express.Router();
const GarminConnectService = require('../services/garminService');
const StorageService = require('../services/storage');
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
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ 
                error: 'Username and password are required' 
            });
        }

        console.log(`🔐 Testing Garmin credentials for user ${req.user.id}`);
        
        // Test connection to Garmin Connect
        const testResult = await garminService.testConnection(username, password);
        
        // Log the test attempt
        await storageService.logGarminSync(
            req.user.id, 
            'test', 
            'auth', 
            testResult.authentication,
            testResult.error || null,
            { username: username },
            testResult
        );

        if (testResult.authentication) {
            res.json({
                success: true,
                message: 'Garmin Connect credentials are valid',
                details: {
                    apiAccess: testResult.apiAccess,
                    userInfo: testResult.userInfo
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
 * Create and sync a test workout (5K run at 5:00-5:10 pace)
 * POST /training/api/garmin/test-workout
 */
router.post('/test-workout', async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Get user's Garmin credentials
        const credentials = await storageService.getGarminCredentials(userId);
        if (!credentials) {
            return res.status(400).json({
                error: 'No Garmin credentials found. Please add your credentials first.'
            });
        }

        console.log(`🏃 Creating test workout for user ${userId}`);

        // Authenticate with Garmin
        const authSuccess = await garminService.authenticate(
            credentials.username, 
            credentials.decrypted_password
        );

        if (!authSuccess) {
            return res.status(400).json({
                error: 'Failed to authenticate with Garmin Connect. Please check your credentials.'
            });
        }

        // Create test workout (5K run at 5:00-5:10 pace)
        const workoutData = {
            name: 'Test 5K Run',
            description: 'Test workout created by Training Peaks Service',
            distance: 5000, // 5K in meters
            paceMinSlow: '5:00', // 5:00 per km
            paceMaxFast: '5:10'  // 5:10 per km
        };

        const result = await garminService.createRunningWorkout(workoutData);

        // Log the sync attempt
        await storageService.logGarminSync(
            userId,
            'manual',
            'create_workout',
            result.success,
            result.error || null,
            workoutData,
            result.data
        );

        if (result.success) {
            console.log(`✅ Test workout created successfully for user ${userId}`);
            res.json({
                success: true,
                message: 'Test workout created successfully!',
                workoutId: result.workoutId,
                details: result.data
            });
        } else {
            console.error(`❌ Failed to create test workout for user ${userId}:`, result.error);
            res.status(500).json({
                success: false,
                error: 'Failed to create test workout',
                details: result.error
            });
        }

        // Cleanup connection
        garminService.disconnect();

    } catch (error) {
        console.error('Error creating test workout:', error);
        res.status(500).json({
            error: 'Failed to create test workout',
            details: error.message
        });
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

module.exports = router;
