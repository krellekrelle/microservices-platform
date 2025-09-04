// Garmin Connect API Integration Service
// This service handles authentication and workout creation/sync with Garmin Connect

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

class GarminConnectService {
    constructor() {
        this.baseUrl = 'https://connect.garmin.com';
        this.session = null;
        this.cookies = null;
        this.isAuthenticated = false;
        this.userId = null;
        this.bearerToken = null; // Add JWT bearer token support
    }

    /**
     * Authenticate with Garmin Connect using username/password
     * @param {string} username - Garmin Connect username
     * @param {string} password - Garmin Connect password
     * @returns {Promise<boolean>} - Authentication success
     */
    async authenticate(username, password) {
        try {
            console.log('🔐 Authenticating with Garmin Connect...');
            
            // Create axios instance with cookie jar
            this.session = axios.create({
                withCredentials: true,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });

            // Step 1: Get the login page to extract CSRF tokens
            console.log('📄 Getting login page...');
            const loginPageResponse = await this.session.get(`${this.baseUrl}/signin/`);
            
            // Extract cookies from response
            const setCookieHeader = loginPageResponse.headers['set-cookie'];
            if (setCookieHeader) {
                this.cookies = setCookieHeader.map(cookie => cookie.split(';')[0]).join('; ');
            }

            // Step 2: Perform login
            console.log('🚪 Attempting login...');
            const loginData = {
                username: username,
                password: password,
                embed: 'false'
            };

            const loginResponse = await this.session.post(
                `${this.baseUrl}/signin/`, 
                new URLSearchParams(loginData),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Cookie': this.cookies
                    },
                    maxRedirects: 0,
                    validateStatus: (status) => status < 400
                }
            );

            // Check if login was successful
            if (loginResponse.status === 302 || loginResponse.status === 200) {
                // Update cookies after login
                const newCookies = loginResponse.headers['set-cookie'];
                if (newCookies) {
                    this.cookies = newCookies.map(cookie => cookie.split(';')[0]).join('; ');
                }

                // Step 3: Get user profile to confirm authentication
                console.log('👤 Fetching user profile...');
                const profileResponse = await this.session.get(`${this.baseUrl}/modern/`, {
                    headers: { 'Cookie': this.cookies }
                });

                if (profileResponse.status === 200) {
                    this.isAuthenticated = true;
                    console.log('✅ Successfully authenticated with Garmin Connect');
                    
                    // Try to extract user ID and bearer token from the response
                    await this.extractUserId();
                    await this.extractBearerToken();
                    
                    return true;
                }
            }

            console.error('❌ Login failed - invalid credentials or login process changed');
            return false;

        } catch (error) {
            console.error('❌ Garmin Connect authentication failed:', error.message);
            return false;
        }
    }

    /**
     * Extract user ID from authenticated session
     */
    async extractUserId() {
        try {
            // Try to get user info from profile endpoint
            const response = await this.session.get(`${this.baseUrl}/modern/proxy/userprofile-service/userprofile`, {
                headers: { 'Cookie': this.cookies }
            });

            if (response.status === 200 && response.data) {
                this.userId = response.data.id || response.data.userId;
                console.log(`👤 User ID extracted: ${this.userId}`);
            }
        } catch (error) {
            console.log('⚠️ Could not extract user ID, will try alternative methods');
        }
    }

    /**
     * Extract Bearer token from cookies or session
     */
    async extractBearerToken() {
        try {
            // Debug: Log all cookies we have
            console.log('🍪 Current cookies:', this.cookies);
            
            // Try to find JWT token in cookies
            if (this.cookies) {
                // Look for JWT_WEB cookie (this is what Garmin uses for bearer tokens)
                const jwtMatch = this.cookies.match(/JWT_WEB=([^;]+)/);
                if (jwtMatch) {
                    this.bearerToken = jwtMatch[1];
                    console.log('🔑 Bearer token extracted from JWT_WEB cookie');
                    console.log('🔑 Token preview:', this.bearerToken.substring(0, 50) + '...');
                    return;
                }
                
                // Alternative: Look for other JWT-related cookies
                const altMatches = this.cookies.match(/(JWT_[A-Z_]+)=([^;]+)/g);
                if (altMatches) {
                    console.log('🔍 Found JWT-related cookies:', altMatches);
                }
            }

            // Try to get token by accessing the modern interface which might set it
            console.log('🔍 Trying to get token from modern interface...');
            const modernResponse = await this.session.get(`${this.baseUrl}/modern/`, {
                headers: { 'Cookie': this.cookies }
            });

            // Check if new cookies were set
            const newSetCookies = modernResponse.headers['set-cookie'];
            if (newSetCookies) {
                console.log('🍪 New cookies from modern interface:', newSetCookies);
                
                // Update our cookies
                const newCookieString = newSetCookies.map(cookie => cookie.split(';')[0]).join('; ');
                this.cookies = this.cookies + '; ' + newCookieString;
                
                // Try extracting token again
                const jwtMatch = this.cookies.match(/JWT_WEB=([^;]+)/);
                if (jwtMatch) {
                    this.bearerToken = jwtMatch[1];
                    console.log('🔑 Bearer token extracted from updated cookies');
                    return;
                }
            }

            console.log('⚠️ Could not extract bearer token from cookies, workout creation might fail');
        } catch (error) {
            console.log('⚠️ Could not extract bearer token:', error.message);
        }
    }

    /**
     * Create a simple structured workout for running with verification
     * @param {Object} workoutData - Workout configuration
     * @returns {Promise<Object>} - Created workout data
     */
    async createRunningWorkout(workoutData) {
        if (!this.isAuthenticated) {
            throw new Error('Not authenticated with Garmin Connect');
        }

        try {
            console.log('🏃 Creating running workout...');

            // First, get current workout count for comparison
            const workoutsBefore = await this.listWorkouts();
            console.log(`📋 Workouts before creation: ${workoutsBefore.length}`);

            const {
                name = 'Training Workout',
                description = 'Generated by Training Peaks Service',
                distance = 5000, // meters
                paceMinSlow = '5:00', // min:sec per km
                paceMaxFast = '5:10' // min:sec per km
            } = workoutData;

            // Convert pace to speed (m/s) - Garmin uses this format
            const paceMinSeconds = this.paceToSeconds(paceMinSlow);
            const paceMaxSeconds = this.paceToSeconds(paceMaxFast);
            const speedMin = 1000 / paceMaxSeconds; // m/s (slower pace = lower speed)
            const speedMax = 1000 / paceMinSeconds; // m/s (faster pace = higher speed)

            // Create workout structure matching real Garmin Connect format
            const workout = {
                "sportType": {
                    "sportTypeId": 1,
                    "sportTypeKey": "running",
                    "displayOrder": 1
                },
                "subSportType": null,
                "workoutName": name,
                "estimatedDistanceUnit": {
                    "unitKey": "meter"
                },
                "workoutSegments": [
                    {
                        "segmentOrder": 1,
                        "sportType": {
                            "sportTypeId": 1,
                            "sportTypeKey": "running",
                            "displayOrder": 1
                        },
                        "workoutSteps": [
                            {
                                "stepId": 2,
                                "stepOrder": 1,
                                "stepType": {
                                    "stepTypeId": 3,
                                    "stepTypeKey": "interval",
                                    "displayOrder": 3
                                },
                                "type": "ExecutableStepDTO",
                                "endCondition": {
                                    "conditionTypeId": 3,
                                    "conditionTypeKey": "distance",
                                    "displayOrder": 3,
                                    "displayable": true
                                },
                                "endConditionValue": distance,
                                "targetType": {
                                    "workoutTargetTypeId": 6,
                                    "workoutTargetTypeKey": "pace.zone",
                                    "displayOrder": 6
                                },
                                "targetValueOne": speedMax, // Faster pace (higher speed)
                                "targetValueTwo": speedMin, // Slower pace (lower speed)
                                "targetValueUnit": null,
                                "stepAudioNote": null
                            }
                        ]
                    }
                ],
                "avgTrainingSpeed": (speedMin + speedMax) / 2,
                "estimatedDurationInSecs": Math.round(distance * (paceMinSeconds + paceMaxSeconds) / 2000),
                "estimatedDistanceInMeters": distance,
                "estimateType": "TIME_ESTIMATED",
                "isWheelchair": false
            };

            console.log('📝 Workout structure created (Garmin format):', JSON.stringify(workout, null, 2));

            // Prepare headers matching real Garmin Connect request
            const headers = {
                'Cookie': this.cookies,
                'Content-Type': 'application/json;charset=UTF-8',
                'Accept': 'application/json, text/plain, */*',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
                'di-backend': 'connectapi.garmin.com',
                'x-app-ver': '5.16.1.0',
                'x-lang': 'en-US',
                'cache-control': 'no-cache',
                'pragma': 'no-cache',
                'origin': 'https://connect.garmin.com',
                'referer': 'https://connect.garmin.com/modern/workout/create/running'
            };

            // Add bearer token if we have it
            if (this.bearerToken) {
                headers['authorization'] = `Bearer ${this.bearerToken}`;
                console.log('🔑 Using bearer token for authentication');
            } else {
                console.log('⚠️ No bearer token available - using cookies only');
            }

            // Submit workout to Garmin Connect using the correct endpoint
            const response = await this.session.post(
                `${this.baseUrl}/workout-service/workout`, // Correct endpoint without /modern/proxy
                workout,
                { headers }
            );

            console.log('📤 Workout submission response:', response.status, JSON.stringify(response.data, null, 2));
            console.log('📤 Response headers:', JSON.stringify(response.headers, null, 2));

            if (response.status === 200 || response.status === 201) {
                // Check if we actually got workout data back
                if (response.data && Object.keys(response.data).length > 0) {
                    console.log('✅ Workout created successfully!');
                    return {
                        success: true,
                        workoutId: response.data.workoutId || response.data.id,
                        data: response.data
                    };
                } else {
                    console.log('⚠️ Got 200 response but empty data - workout may not have been created');
                    // Try to list workouts to verify
                    const workoutsAfter = await this.listWorkouts();
                    console.log(`📋 Workouts after creation attempt: ${workoutsAfter.length}`);
                    
                    const workoutCreated = workoutsAfter.length > workoutsBefore.length;
                    console.log(`📊 Workout count increased: ${workoutCreated}`);
                    
                    return {
                        success: workoutCreated,
                        error: workoutCreated ? null : 'Got 200 response but no workout data returned',
                        data: response.data,
                        workoutCountBefore: workoutsBefore.length,
                        workoutCountAfter: workoutsAfter.length
                    };
                }
            } else {
                console.error('❌ Failed to create workout:', response.status, response.data);
                return {
                    success: false,
                    error: `HTTP ${response.status}: ${response.statusText}`
                };
            }

        } catch (error) {
            console.error('❌ Error creating workout:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Convert pace string (MM:SS) to total seconds
     * @param {string} pace - Pace in format "M:SS" or "MM:SS"
     * @returns {number} - Pace in seconds
     */
    paceToSeconds(pace) {
        const parts = pace.split(':');
        const minutes = parseInt(parts[0]);
        const seconds = parseInt(parts[1]);
        return minutes * 60 + seconds;
    }

    /**
     * Get workout count to verify creation (using real Garmin API)
     * @returns {Promise<number>} - Number of workouts
     */
    async listWorkouts() {
        if (!this.isAuthenticated) {
            throw new Error('Not authenticated with Garmin Connect');
        }

        try {
            console.log('📋 Fetching workout count...');
            
            const headers = {
                'Cookie': this.cookies,
                'Accept': 'application/json, text/plain, */*',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
                'di-backend': 'connectapi.garmin.com'
            };

            // Add bearer token if available
            if (this.bearerToken) {
                headers['authorization'] = `Bearer ${this.bearerToken}`;
                console.log('🔑 Using bearer token for workout count');
            } else {
                console.log('⚠️ No bearer token for workout count - may fail');
            }

            // Use the real Garmin Connect workout count endpoint
            const timestamp = Date.now();
            const response = await this.session.get(
                `${this.baseUrl}/workout-service/workouts/count?includeAtp=false&_=${timestamp}`, 
                { headers }
            );

            console.log(`📋 Workout count response: ${response.status}`);
            if (response.status === 200) {
                const count = response.data?.totalWorkoutCount || response.data || 0;
                console.log(`📋 Total workout count: ${count}`);
                
                // Return array-like structure for compatibility with existing code
                // We simulate an array with the right length for before/after comparison
                return new Array(count).fill({ workoutId: 'unknown', workoutName: 'Workout' });
            } else {
                console.error('Failed to get workout count:', response.status, response.data);
                return [];
            }
        } catch (error) {
            console.error('Error getting workout count:', error.message);
            
            // If the count endpoint fails, try a basic workouts endpoint
            if (error.response && error.response.status === 404) {
                console.log('📋 Count endpoint failed, trying basic workouts endpoint...');
                try {
                    const headers = {
                        'Cookie': this.cookies,
                        'Accept': 'application/json, text/plain, */*',
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'
                    };

                    if (this.bearerToken) {
                        headers['authorization'] = `Bearer ${this.bearerToken}`;
                    }

                    const altResponse = await this.session.get(
                        `${this.baseUrl}/workout-service/workouts?start=0&limit=1`, 
                        { headers }
                    );
                    
                    if (altResponse.status === 200) {
                        console.log('📋 Basic workouts endpoint worked!');
                        // This would give us actual workout data, but for count we just need length
                        const workouts = altResponse.data || [];
                        return workouts;
                    }
                } catch (altError) {
                    console.error('Alternative endpoint also failed:', altError.message);
                }
            }
            
            return [];
        }
    }

    /**
     * Test the authentication and basic API access
     * @param {string} username - Garmin Connect username
     * @param {string} password - Garmin Connect password
     * @returns {Promise<Object>} - Test results
     */
    async testConnection(username, password) {
        const result = {
            authentication: false,
            apiAccess: false,
            userInfo: null,
            error: null
        };

        try {
            // Test authentication
            result.authentication = await this.authenticate(username, password);
            
            if (result.authentication) {
                // Test API access by listing workouts
                const workouts = await this.listWorkouts();
                result.apiAccess = Array.isArray(workouts);
                result.userInfo = {
                    userId: this.userId,
                    workoutCount: workouts.length
                };
            }

        } catch (error) {
            result.error = error.message;
        }

        return result;
    }

    /**
     * Cleanup session
     */
    disconnect() {
        this.session = null;
        this.cookies = null;
        this.isAuthenticated = false;
        this.userId = null;
        this.bearerToken = null;
        console.log('📴 Disconnected from Garmin Connect');
    }
}

module.exports = GarminConnectService;
