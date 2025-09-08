const express = require('express');
const router = express.Router();
const deviceSyncService = require('../services/deviceSyncService');
const { requireAuth } = require('../middleware/auth');

/**
 * GET /api/devices
 * Get user's devices from database
 */
router.get('/', requireAuth, async (req, res) => {
    try {
        const devices = await deviceSyncService.getUserDevices(req.user.id);
        res.json({
            success: true,
            devices
        });
    } catch (error) {
        console.error('Error getting user devices:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/devices/sync
 * Sync devices from Garmin Connect
 */
router.post('/sync', requireAuth, async (req, res) => {
    try {
        const devices = await deviceSyncService.syncUserDevices(req.user.id);
        res.json({
            success: true,
            message: `Synced ${devices.length} devices`,
            devices
        });
    } catch (error) {
        console.error('Error syncing devices:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * PUT /api/devices/:deviceId/push-setting
 * Update device workout push setting
 */
router.put('/:deviceId/push-setting', requireAuth, async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { enabled } = req.body;

        if (typeof enabled !== 'boolean') {
            return res.status(400).json({
                success: false,
                error: 'enabled must be a boolean value'
            });
        }

        const updatedDevice = await deviceSyncService.updateDevicePushSetting(
            req.user.id,
            deviceId,
            enabled
        );

        if (!updatedDevice) {
            return res.status(404).json({
                success: false,
                error: 'Device not found'
            });
        }

        res.json({
            success: true,
            message: `Workout push ${enabled ? 'enabled' : 'disabled'} for device`,
            device: updatedDevice
        });
    } catch (error) {
        console.error('Error updating device push setting:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/devices/:deviceId/push-workout
 * Push a specific workout to a device
 */
router.post('/:deviceId/push-workout', requireAuth, async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { workoutId } = req.body;

        if (!workoutId) {
            return res.status(400).json({
                success: false,
                error: 'workoutId is required'
            });
        }

        const result = await deviceSyncService.pushWorkoutToDevice(
            req.user.id,
            workoutId,
            deviceId
        );

        res.json({
            success: true,
            message: 'Workout pushed to device successfully',
            result
        });
    } catch (error) {
        console.error('Error pushing workout to device:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/devices/push-workout-all
 * Push a workout to all enabled devices
 */
router.post('/push-workout-all', requireAuth, async (req, res) => {
    try {
        const { workoutId } = req.body;

        if (!workoutId) {
            return res.status(400).json({
                success: false,
                error: 'workoutId is required'
            });
        }

        const results = await deviceSyncService.pushWorkoutToEnabledDevices(
            req.user.id,
            workoutId
        );

        const successCount = results.filter(r => r.success).length;
        const totalCount = results.length;

        res.json({
            success: true,
            message: `Workout pushed to ${successCount}/${totalCount} devices`,
            results
        });
    } catch (error) {
        console.error('Error pushing workout to devices:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
