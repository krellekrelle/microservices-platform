// Garmin Connect API Integration Service using garmin-connect library
// This service handles authentication and workout creation/sync with Garmin Connect

// const { GarminConnect } = require('garmin-connect');
const { GarminConnect } = require('../lib/garmin-connect/dist');
const StorageService = require('./storage');
const IntelligentWorkoutParser = require('./intelligentWorkoutParser');

class GarminConnectService {
    constructor() {
        this.client = null;
        this.isAuthenticated = false;
        this.storage = new StorageService();
        this.workoutParser = new IntelligentWorkoutParser();
        this.incrementer = 1; // Static integer incrementer for unique naming temp
    }

    /**
     * Authenticate with Garmin Connect using username/password with session reuse
     * @param {string} username - Garmin Connect username
     * @param {string} password - Garmin Connect password
     * @param {number} userId - User ID for token storage
     * @returns {Promise<boolean>} - Authentication success
     */
    async authenticate(username, password, userId = null) {
        try {
            // Create new client instance
            this.client = new GarminConnect({
                username: username,
                password: password
            });

            // Try to reuse existing tokens first if userId provided
            if (userId) {
                console.log('� Attempting to reuse stored OAuth tokens...');
                const storedTokens = await this.storage.getGarminTokens(userId);
                
                if (storedTokens && storedTokens.oauth1 && storedTokens.oauth2) {
                    try {
                        // Load the stored tokens
                        this.client.loadToken(storedTokens.oauth1, storedTokens.oauth2);
                        
                        // Test if the tokens are still valid by making a simple API call
                        const userProfile = await this.client.getUserProfile();
                        
                        if (userProfile && userProfile.profileId) {
                            console.log('✅ Successfully reused stored OAuth tokens');
                            console.log(`👤 Authenticated as: ${userProfile.userName || userProfile.displayName}`);
                            // this.client.getDevices(); // Pre-fetch devices to ensure session is active
                            this.isAuthenticated = true;
                            return true;
                        }
                    } catch (tokenError) {
                        console.log('⚠️ Stored tokens invalid, falling back to fresh login');
                        console.log('Token error:', tokenError.message);
                        // Clear invalid tokens
                        await this.storage.clearGarminTokens(userId);
                    }
                }
            }

            // If no stored tokens or they're invalid, perform fresh login
            console.log('🔐 Performing fresh authentication with Garmin Connect...');
            await this.client.login();
            this.isAuthenticated = true;
            
            console.log('✅ Successfully authenticated with Garmin Connect');

            // Store the new tokens for future reuse if userId provided
            if (userId && this.client.client && this.client.client.oauth1Token && this.client.client.oauth2Token) {
                try {
                    await this.storage.storeGarminTokens(
                        userId, 
                        this.client.client.oauth1Token, 
                        this.client.client.oauth2Token
                    );
                    console.log('💾 Stored OAuth tokens for future reuse');
                } catch (storageError) {
                    console.log('⚠️ Failed to store tokens, but authentication succeeded:', storageError.message);
                }
            }
            
            return true;

        } catch (error) {
            console.error('❌ Garmin Connect authentication failed:', error.message);
            this.isAuthenticated = false;
            
            // Clear any invalid stored tokens
            if (userId) {
                try {
                    await this.storage.clearGarminTokens(userId);
                } catch (clearError) {
                    console.log('Warning: Could not clear tokens:', clearError.message);
                }
            }
            
            return false;
        }
    }

    /**
     * Get the Garmin Connect client instance
     * @returns {GarminConnect|null} - The authenticated client or null
     */
    getClient() {
        if (!this.isAuthenticated || !this.client) {
            throw new Error('Not authenticated with Garmin Connect. Call authenticate() first.');
        }
        return this.client;
    }

    /**
     * Create a running workout using the library's built-in method
     * @param {Object} workoutData - Workout configuration
     * @returns {Promise<Object>} - Created workout data
     */
    async createRunningWorkout(workoutData) {
        if (!this.isAuthenticated || !this.client) {
            throw new Error('Not authenticated with Garmin Connect');
        }

        try {
            console.log('🏃 Creating running workout using library...');

            const {
                name = 'Training Workout',
                description = 'Generated by Training Peaks Service',
                distance = 5000, // meters
                paceMinSlow = '5:00', // min:sec per km
                paceMaxFast = '5:10' // min:sec per km
            } = workoutData;

            console.log(`📝 Creating workout: ${name}`);
            console.log(`📏 Distance: ${distance}m`);
            console.log(`⏱️ Target pace: ${paceMaxFast}-${paceMinSlow} per km`);
            console.log(`📄 Description: ${description}`);

            // Get workout count before creation
            const workoutsBefore = await this.getWorkoutCount();
            console.log(`📋 Workouts before creation: ${workoutsBefore}`);

            // Use the library's addRunningWorkout method
            const result = await this.client.addRunningWorkout(name, distance, description);

            console.log('✅ Workout created successfully with library!');
            console.log('📤 Workout result:', JSON.stringify(result, null, 2));

            // Get workout count after creation to verify
            const workoutsAfter = await this.getWorkoutCount();
            console.log(`📋 Workouts after creation: ${workoutsAfter}`);

            return {
                success: true,
                workoutId: result.workoutId,
                data: result,
                workoutCountBefore: workoutsBefore,
                workoutCountAfter: workoutsAfter
            };

        } catch (error) {
            console.error('❌ Error creating workout with library:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get workout count using the library
     * @returns {Promise<number>} - Number of workouts
     */
    async getWorkoutCount() {
        if (!this.isAuthenticated || !this.client) {
            throw new Error('Not authenticated with Garmin Connect');
        }

        try {
            console.log('📋 Fetching workout count using library...');
            
            // Use the library's getWorkouts method
            const workouts = await this.client.getWorkouts(0, 100); // Get first 100 workouts
            console.log(`📋 Found ${workouts.length} workouts`);
            
            // Log details of recent workouts for debugging
            if (workouts.length > 0) {
                console.log('📋 Recent workouts:');
                workouts.slice(0, 3).forEach((workout, index) => {
                    console.log(`  ${index + 1}. ${workout.workoutName || 'Unnamed'} (ID: ${workout.workoutId})`);
                });
            }
            
            return workouts.length;
        } catch (error) {
            console.error('Error getting workout count with library:', error.message);
            return 0;
        }
    }

    /**
     * Test the authentication and basic API access using the library
     * @param {string} username - Garmin Connect username
     * @param {string} password - Garmin Connect password
     * @param {number} userId - User ID for token storage
     * @returns {Promise<Object>} - Test results
     */
    async testConnection(username, password, userId = null) {
        const result = {
            authentication: false,
            apiAccess: false,
            userInfo: null,
            tokenReused: false,
            error: null
        };

        try {
            // Check if we have stored tokens
            if (userId) {
                const storedTokens = await this.storage.getGarminTokens(userId);
                result.tokenReused = !!(storedTokens && storedTokens.oauth1 && storedTokens.oauth2);
            }

            // Test authentication
            result.authentication = await this.authenticate(username, password, userId);
            
            if (result.authentication) {
                // Test API access by getting user profile and workout count
                const userProfile = await this.client.getUserProfile();
                const workoutCount = await this.getWorkoutCount();
                
                result.apiAccess = true;
                result.userInfo = {
                    username: userProfile.userName || userProfile.displayName,
                    profileId: userProfile.profileId,
                    workoutCount: workoutCount
                };
                
                console.log('👤 User profile:', userProfile.userName || userProfile.displayName);
                console.log('📊 Workout count:', workoutCount);
            }

        } catch (error) {
            result.error = error.message;
            console.error('❌ Test connection failed:', error.message);
        }

        return result;
    }

    /**
     * Create a workout from provided JSON data
     * @param {Object} workoutJson - Workout JSON data
     * @returns {Promise<Object>} - Workout creation result with ID
     */
    async createWorkoutFromJson(workoutJson) {
        if (!this.isAuthenticated) {
            throw new Error('Must be authenticated with Garmin Connect first');
        }

        try {
            console.log('📋 Creating workout from provided JSON...');
            console.log(`🏃 Workout: ${workoutJson.workoutName}`);

            // Use the JSON directly since LLM now generates correct creation format
            console.log('✅ Using LLM-generated creation format directly');

            // Create the workout on Garmin Connect using the correct method
            const workoutId = await this.client.addWorkout(workoutJson);

            const result = {
                success: true,
                workoutId: workoutId,
                workoutName: workoutJson.workoutName,
                originalJson: workoutJson,
                estimatedDistance: Math.round((workoutJson.estimatedDistanceInMeters || 0)/1000),
                estimatedDuration: Math.round((workoutJson.estimatedDurationInSecs || 0)/60),
                stepsCount: workoutJson.workoutSegments?.[0]?.workoutSteps?.length || 0
            };

            console.log(`🎉 Successfully created Garmin workout from JSON. ID: ${workoutId}`);
            return result;

        } catch (error) {
            console.error('❌ Failed to create workout from JSON:', error);
            throw new Error(`Workout creation from JSON failed: ${error.message}`);
        }
    }


    /**
     * Create a structured workout from Danish training description using AI parsing
     * @param {string} trainingDescription - Danish training description text
     * @param {string} workoutDate - Date for the workout (YYYY-MM-DD)
     * @param {string} workoutName - Optional workout name
     * @returns {Promise<Object>} - Workout creation result with ID
     */
    async createWorkoutFromDescription(trainingDescription, workoutDate = null, workoutName = null, skipGarmin = false, reasoningEffort = "high") {
        if (!this.isAuthenticated && !skipGarmin) {
            throw new Error('Must be authenticated with Garmin Connect first');
        }

        try {
            console.log('🤖 Parsing training description with AI...');
            console.log(`📝 Description: "${trainingDescription}"`);
            console.log(`📅 Date: "${workoutDate || 'Current date'}"`);

            // Use AI to convert Danish description to Garmin workout JSON
            const parsedResponse = await this.workoutParser.parseTrainingDescription(
                trainingDescription, 
                workoutDate,
                workoutName,
                reasoningEffort
            );
            const workoutJson = parsedResponse.garminWorkout;
            const promptMessages = parsedResponse.promptMessages;
            const rawResponse = parsedResponse.rawResponse;

            // const workoutJson = {
            //     "workoutName": `[${this.incrementer++}] jog tirsdag 09/09`,
            //     "description": "50 min jog. Gælder om at komme så nemt igennem som muligt",
            //     "updateDate": "2025-09-08T12:06:14.587Z",
            //     "createdDate": "2025-09-08T12:06:14.587Z",
            //     "sportType": {
            //         "sportTypeId": 1,
            //         "sportTypeKey": "running"
            //     },
            //     "estimatedDurationInSecs": 3000,
            //     "estimatedDistanceInMeters": null,
            //     "workoutSegments": [
            //         {
            //             "segmentOrder": 1,
            //             "sportType": {
            //                 "sportTypeId": 1,
            //                 "sportTypeKey": "running"
            //             },
            //             "workoutSteps": [
            //                 {
            //                     "type": "ExecutableStepDTO",
            //                     "stepOrder": 1,
            //                     "stepType": {
            //                         "stepTypeId": 3,
            //                         "stepTypeKey": "interval"
            //                     },
            //                     "endCondition": {
            //                         "conditionTypeId": 2,
            //                         "conditionTypeKey": "time"
            //                     },
            //                     "endConditionValue": 3000,
            //                     "targetType": {
            //                         "workoutTargetTypeId": 1,
            //                         "workoutTargetTypeKey": "no.target"
            //                     },
            //                     "targetValueOne": 0,
            //                     "targetValueTwo": 0,
            //                     "strokeType": {
            //                         "strokeTypeId": 0
            //                     },
            //                     "equipmentType": {
            //                         "equipmentTypeId": 0
            //                     }
            //                 }
            //             ]
            //         }
            //     ]
            // };

            console.log('✅ AI parsing complete, creating workout on Garmin Connect...');
            console.log(`🏃 Workout: ${workoutJson.workoutName}`);
            console.log(`📏 Estimated: ${Math.round(workoutJson.estimatedDistanceInMeters/1000)}km, ${Math.round(workoutJson.estimatedDurationInSecs/60)}min`);

            if (skipGarmin) {
                console.log('⏭️ Skipping Garmin creation because skipGarmin flag is set (Dry run mode)');
                return {
                    success: true,
                    workoutId: 'dry-run-skipped',
                    workoutName: workoutJson.workoutName,
                    originalDescription: trainingDescription,
                    parsedWorkout: workoutJson,
                    promptMessages,
                    rawResponse,
                    estimatedDistance: Math.round(workoutJson.estimatedDistanceInMeters/1000),
                    estimatedDuration: Math.round(workoutJson.estimatedDurationInSecs/60),
                    stepsCount: workoutJson.workoutSegments[0]?.workoutSteps?.length || 0
                };
            }

            // Create the workout on Garmin Connect using the correct method
            const workoutDetailObj = await this.client.addWorkout(workoutJson);
            const workoutIdVal = workoutDetailObj.workoutId || workoutDetailObj;

            const result = {
                success: true,
                workoutId: workoutIdVal,
                workoutName: workoutJson.workoutName,
                originalDescription: trainingDescription,
                parsedWorkout: workoutJson,
                promptMessages,
                rawResponse,
                estimatedDistance: Math.round(workoutJson.estimatedDistanceInMeters/1000),
                estimatedDuration: Math.round(workoutJson.estimatedDurationInSecs/60),
                stepsCount: workoutJson.workoutSegments[0]?.workoutSteps?.length || 0
            };

            console.log(`🎉 Successfully created Garmin workout ID: ${workoutIdVal}`);
            return result;

        } catch (error) {
            console.error('❌ Failed to create workout from description:', error);
            
            // Return structured failure result instead of throwing
            // This allows the sync process to mark as failed and continue
            return {
                success: false,
                error: error.message,
                workoutName: workoutName || 'Failed Workout',
                originalDescription: trainingDescription,
                failurePoint: 'workout_creation',
                details: {
                    errorType: error.constructor.name,
                    timestamp: new Date().toISOString()
                }
            };
        }
    }

    /**
     * Get Enabled devices for user
     */
    async getEnabledDevicesForUser(userId) {
        return await this.storage.getEnabledDevicesForUser(userId);
    }

    /**
     * Cleanup session
     */
    disconnect() {
        this.client = null;
        this.isAuthenticated = false;
        console.log('📴 Disconnected from Garmin Connect');
    }
}

module.exports = GarminConnectService;
