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
        
        // Test connection to Garmin Connect with session reuse
        const testResult = await garminService.testConnection(username, password, req.user.id);
        
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

        // Authenticate with Garmin (with session reuse)
        const authSuccess = await garminService.authenticate(
            credentials.username, 
            credentials.decrypted_password,
            userId
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

                const client = garminService.client;


                const syncResult = await client.pushWorkoutToDevice(
                    { workoutId: actualWorkoutId.toString() },
                    device.device_id,
                );
                // const deviceSyncService = require('../services/deviceSyncService');
                // const pushResults = await deviceSyncService.pushWorkoutToEnabledDevices(userId, actualWorkoutId);
                
                // const successCount = pushResults.filter(r => r.success).length;
                // const totalCount = pushResults.length;
                
                // if (totalCount > 0) {
                //     console.log(`✅ Auto-pushed workout to ${successCount}/${totalCount} enabled devices`);
                // } else {
                //     console.log(`ℹ️ No enabled devices found for auto-push`);
                // }
            } catch (deviceError) {
                console.error(`⚠️ Device auto-push failed for workout ${result.workoutId}:`, deviceError);
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
 * Test the AI workout parser with examples
 * GET /training/api/garmin/test-parser
 */
router.get('/test-parser', async (req, res) => {
    try {
        console.log('🧪 AI Parser Test Started - Endpoint Hit');
        console.log('⏰ Timestamp:', new Date().toISOString());
        console.log('👤 User ID:', req.user?.id || 'Unknown');
        
        const garminService = new GarminConnectService();
        
        console.log('🤖 Initializing AI workout parser test...');
        const testResults = await garminService.testWorkoutParser();
        
        console.log('✅ AI Parser Test Completed Successfully');
        console.log(`📊 Results: ${testResults.filter(r => r.success).length}/${testResults.length} examples parsed successfully`);
        
        // Save the JSON results to files for manual inspection
        const fs = require('fs').promises;
        const path = require('path');
        const outputDir = path.join(__dirname, '../data/ai-test-results');
        
        try {
            // Create output directory if it doesn't exist
            await fs.mkdir(outputDir, { recursive: true });
            
            // Save each successful result to a separate file
            let savedCount = 0;
            for (let i = 0; i < testResults.length; i++) {
                const result = testResults[i];
                if (result.success && result.parsedWorkout) {
                    const filename = `test-example-${i + 1}-${Date.now()}.json`;
                    const filepath = path.join(outputDir, filename);
                    
                    await fs.writeFile(filepath, JSON.stringify(result.parsedWorkout, null, 2), 'utf8');
                    console.log(`💾 Saved AI result ${i + 1} to: ${filename}`);
                    savedCount++;
                }
            }
            
            console.log(`📁 ${savedCount} AI test results saved to: ${outputDir}`);
        } catch (saveError) {
            console.error('❌ Failed to save AI test results to files:', saveError);
        }
        
        res.json({
            success: true,
            message: 'AI workout parser test completed successfully',
            timestamp: new Date().toISOString(),
            results: testResults,
            summary: {
                totalTests: testResults.length,
                successful: testResults.filter(r => r.success).length,
                failed: testResults.filter(r => !r.success).length
            },
            savedToFiles: `Results saved to data/ai-test-results/ directory`
        });

    } catch (error) {
        console.error('❌ AI Parser Test Failed:', error);
        console.error('📍 Error Stack:', error.stack);
        res.status(500).json({
            error: 'Failed to test AI workout parser',
            details: error.message,
            timestamp: new Date().toISOString()
        });
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
