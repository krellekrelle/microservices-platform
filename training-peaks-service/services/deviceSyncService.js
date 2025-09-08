/**
 * Device Sync Service for Garmin watches
 * 
 * Enhanced implementation using local garmin-connect library with device sync functionality
 * - Device discovery: GET /device-service/deviceregistration/devices
 * - Workout push: POST /device-service/devicemessage/messages
 */

const db = require('../db/database');
const StorageService = require('./storage');
const GarminConnectService = require('./garminService');

class DeviceSyncService {
    constructor() {
        this.garminServices = new Map(); // Store GarminConnectService instances per user
        this.storage = new StorageService(); // Initialize storage service
    }

    /**
     * Get or create GarminConnectService for user (reuse existing working service)
     */
    async getGarminService(userId) {
        if (this.garminServices.has(userId)) {
            const service = this.garminServices.get(userId);
            if (service.isAuthenticated) {
                return service;
            }
        }

        // Get user's Garmin credentials from database using storage service
        const credentials = await this.storage.getGarminCredentials(userId);
        
        if (!credentials) {
            throw new Error('User has no Garmin credentials stored');
        }

        try {
            // Create new GarminConnectService instance (reuse the working service)
            const garminService = new GarminConnectService();
            
            // Authenticate using the proven pattern
            const authenticated = await garminService.authenticate(
                credentials.username, 
                credentials.password, 
                userId
            );

            if (!authenticated) {
                throw new Error('Failed to authenticate with Garmin Connect for device sync');
            }
            
            console.log('✅ Device sync authenticated successfully using GarminConnectService');
            this.garminServices.set(userId, garminService);
            return garminService;

        } catch (error) {
            console.error('❌ Device sync authentication failed:', error.message);
            throw error;
        }
    }

    /**
     * Fetch devices from Garmin and sync to database
     */
    async syncUserDevices(userId) {
        try {
            const garminService = await this.getGarminService(userId);
            
            // Use the authenticated client from the working GarminService
            const client = garminService.client;
            
            // Use the existing getWorkoutDevices() method from garmin-connect
            const devices = await client.getWorkoutDevices();

            console.log(`Found ${devices.length} devices for user ${userId}`);

            for (const device of devices) {
                await this.upsertDevice(userId, device);
            }

            return devices;
        } catch (error) {
            console.error(`Error syncing devices for user ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Insert or update device in database
     */
    async upsertDevice(userId, device) {
        const query = `
            INSERT INTO user_devices (
                user_id, device_id, device_name, device_type, device_type_display_name,
                battery_level, battery_status, last_sync_time, firmware_version,
                software_version, connection_type, primary_device, sync_capable
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            ON CONFLICT (user_id, device_id) 
            DO UPDATE SET
                device_name = EXCLUDED.device_name,
                device_type = EXCLUDED.device_type,
                device_type_display_name = EXCLUDED.device_type_display_name,
                battery_level = EXCLUDED.battery_level,
                battery_status = EXCLUDED.battery_status,
                last_sync_time = EXCLUDED.last_sync_time,
                firmware_version = EXCLUDED.firmware_version,
                software_version = EXCLUDED.software_version,
                connection_type = EXCLUDED.connection_type,
                primary_device = EXCLUDED.primary_device,
                sync_capable = EXCLUDED.sync_capable,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *
        `;

        const values = [
            userId,
            device.deviceId,
            device.displayName,
            device.deviceTypePk?.toString(),
            device.deviceTypeDisplayName,
            device.batteryLevel,
            device.batteryStatus,
            device.lastSyncTime ? new Date(device.lastSyncTime) : null,
            device.firmwareVersion,
            device.softwareVersion,
            device.connectionType,
            device.primaryDevice || false,
            device.syncCapable !== false // Default to true unless explicitly false
        ];

        const result = await db.query(query, values);
        return result.rows[0];
    }

    /**
     * Get user's devices from database
     */
    async getUserDevices(userId) {
        const query = `
            SELECT * FROM user_devices 
            WHERE user_id = $1 
            ORDER BY primary_device DESC, device_name ASC
        `;
        const result = await db.query(query, [userId]);
        return result.rows;
    }

    /**
     * Update device workout push setting
     */
    async updateDevicePushSetting(userId, deviceId, enabled) {
        const query = `
            UPDATE user_devices 
            SET workout_push_enabled = $3, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $1 AND device_id = $2
            RETURNING *
        `;
        const result = await db.query(query, [userId, deviceId, enabled]);
        return result.rows[0];
    }

    /**
     * Get Enabled devices for user
     */
    async getEnabledDevicesForUser(userId) {
        const query = `
            SELECT device_id, device_name FROM user_devices 
            WHERE user_id = $1 AND workout_push_enabled = true AND sync_capable = true
        `;
        const result = await db.query(query, [userId]);
        return result.rows;
    }

    /**
     * Create a test workout and push to enabled devices
     */
    async createAndPushTestWorkout(userId, workoutData) {
        try {
            console.log(`🧪 Creating and pushing test workout for user ${userId}`);
            
            // Get authenticated Garmin service
            const garminService = await this.getGarminService(userId);
            
            // Use the authenticated client from the working GarminService
            const client = garminService.client;

            // Create the running workout
            const workoutResult = await garminService.createRunningWorkout(workoutData);
            
            if (!workoutResult.success) {
                throw new Error(`Failed to create test workout: ${workoutResult.error}`);
            }
            
            console.log(`✅ Test workout created with ID: ${workoutResult.workoutId}`);

            // Extract the actual workout ID (handle object case)
            let actualWorkoutId = workoutResult.workoutId;
            if (typeof workoutResult.workoutId === 'object' && workoutResult.workoutId !== null) {
                actualWorkoutId = workoutResult.workoutId.id || workoutResult.workoutId.workoutId || workoutResult.workoutId.workoutKey || String(workoutResult.workoutId);
            }
            
            console.log(`📤 Pushing test workout ${actualWorkoutId} to enabled devices...`);
            
            // get enabled devices
            const enabledDevices = await this.getEnabledDevicesForUser(userId);
            console.log(`📡 Found ${enabledDevices.length} enabled devices for user ${userId}`);

            // push to enabled devices
            for (const device of enabledDevices) {
                try {
                    // console.log(device)
                    // console.log(actualWorkoutId.toString());
                    // console.log(typeof(device.device_id));
                    // console.log(device.device_id);
                    const syncResult = await client.pushWorkoutToDevice(
                        { workoutId: actualWorkoutId.toString() },
                        device.device_id,
                    );
                    console.log(`✅ Test workout ${actualWorkoutId} pushed to device ${device.device_name}`);
                }
                catch (error) {
                    console.error(`❌ Failed to push test workout to device ${device.device_name}:`, error);
                }
            }

            return {
                success: true,
                workoutId: actualWorkoutId,
                workoutName: workoutResult.data?.workoutName || workoutData.name,
                successfulPushes: enabledDevices.length,
                totalDevices: enabledDevices.length
            };
            
        } catch (error) {
            console.error('Error creating and pushing test workout:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Cleanup method to disconnect all Garmin services
     */
    async cleanup() {
        for (const [userId, garminService] of this.garminServices) {
            garminService.disconnect();
        }
        this.garminServices.clear();
    }
}

module.exports = new DeviceSyncService();
