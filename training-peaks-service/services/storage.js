const db = require('../db/database');
const encryptionUtil = require('../utils/encryption');

class StorageService {
    // Store user TrainingPeaks credentials
    async storeUserCredentials(userId, username, password) {
        try {
            const encryptedUsername = encryptionUtil.encrypt(username);
            const encryptedPassword = encryptionUtil.encrypt(password);
            
            const query = `
                INSERT INTO training_peaks_credentials (
                    user_id, username_encrypted, password_encrypted, 
                    iv_username, iv_password, created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
                ON CONFLICT (user_id) 
                DO UPDATE SET 
                    username_encrypted = $2,
                    password_encrypted = $3,
                    iv_username = $4,
                    iv_password = $5,
                    updated_at = NOW()
            `;
            
            await db.query(query, [
                userId, 
                encryptedUsername.encryptedData, 
                encryptedPassword.encryptedData,
                encryptedUsername.iv,
                encryptedPassword.iv
            ]);
            console.log(`✅ Stored credentials for user ${userId}`);
        } catch (error) {
            console.error('❌ Error storing user credentials:', error);
            throw error;
        }
    }

    // Get user credentials with decryption
    async getUserCredentials(userId) {
        try {
            const query = `
                SELECT username_encrypted, password_encrypted, iv_username, iv_password
                FROM training_peaks_credentials 
                WHERE user_id = $1
            `;
            
            const result = await db.query(query, [userId]);
            
            if (result.rows.length === 0) {
                return null;
            }
            
            const { username_encrypted, password_encrypted, iv_username, iv_password } = result.rows[0];
            const username = encryptionUtil.decrypt({ encryptedData: username_encrypted, iv: iv_username });
            const password = encryptionUtil.decrypt({ encryptedData: password_encrypted, iv: iv_password });
            
            return { username, password };
        } catch (error) {
            console.error('❌ Error getting user credentials:', error);
            throw error;
        }
    }

    // Get all users with credentials
    async getUsersWithCredentials() {
        try {
            const query = `
                SELECT 
                    u.id,
                    u.email,
                    tpc.username_encrypted,
                    tpc.password_encrypted,
                    tpc.iv_username,
                    tpc.iv_password
                FROM users u
                JOIN training_peaks_credentials tpc ON u.id = tpc.user_id
                WHERE u.status = 'approved'
            `;
            
            const result = await db.query(query);
            
            return result.rows.map(row => ({
                id: row.id,
                email: row.email,
                username: encryptionUtil.decrypt({ encryptedData: row.username_encrypted, iv: row.iv_username }),
                password: encryptionUtil.decrypt({ encryptedData: row.password_encrypted, iv: row.iv_password })
            }));
        } catch (error) {
            console.error('❌ Error getting users with credentials:', error);
            throw error;
        }
    }

    // Store training sessions
    async storeTrainingSessions(userId, weekData) {
        try {
            console.log('🔍 DEBUG: Received weekData for storage:', JSON.stringify(weekData, null, 2));
            
            const client = await db.pool.connect();
            
            try {
                await client.query('BEGIN');
                
    // Flatten the weekData into individual sessions for database storage
    const sessions = [];
    weekData.forEach(day => {
        console.log(`🔍 DEBUG: Processing day ${day.date} with ${day.workouts.length} workouts`);
        day.workouts.forEach(workout => {
            console.log('🔍 DEBUG: Processing workout:', {
                title: workout.title,
                description: workout.description ? workout.description.substring(0, 100) + '...' : 'No description',
                type: workout.type,
                duration: workout.duration
            });
            
            const session = {
                userId: userId,
                date: day.date,
                type: this.detectTrainingTypeFromData(workout),
                description: workout.description || workout.title || '',
                duration: this.convertDurationToSeconds(workout.duration),
                distance: workout.distance || null,
                workoutId: workout.workoutId || null,
                weekStart: this.getCurrentWeekStart(day.date)
            };
            sessions.push(session);
        });
    });                console.log(`🔍 DEBUG: Flattened ${sessions.length} sessions for database insertion`);
                
                for (const session of sessions) {
                    const query = `
                        INSERT INTO training_sessions (
                            user_id, date, type, description, 
                            duration, distance, workout_id, week_start_date, scraped_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
                        ON CONFLICT (user_id, date, type, description) 
                        DO UPDATE SET 
                            duration = $5,
                            distance = $6,
                            workout_id = $7,
                            scraped_at = NOW()
                    `;
                    
                    console.log('🔍 DEBUG: Inserting session:', {
                        userId,
                        date: session.date,
                        type: session.type,
                        description: session.description,
                        duration: session.duration,
                        distance: session.distance,
                        workoutId: session.workoutId,
                        weekStart: session.weekStart
                    });
                    
                    await client.query(query, [
                        userId,
                        session.date,
                        session.type,
                        session.description,
                        session.duration,
                        session.distance,
                        session.workoutId,
                        session.weekStart
                    ]);
                }
                
                await client.query('COMMIT');
                console.log(`✅ Stored ${sessions.length} training sessions for user ${userId}`);
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }
        } catch (error) {
            console.error('❌ Error storing training sessions:', error);
            throw error;
        }
    }

    // Detect training type from title/description
    convertDurationToSeconds(durationStr) {
    if (!durationStr) return null;
    
    // Handle format like "1:00:15" (hours:minutes:seconds)
    const parts = durationStr.split(':');
    if (parts.length === 3) {
      const hours = parseInt(parts[0]) || 0;
      const minutes = parseInt(parts[1]) || 0;
      const seconds = parseInt(parts[2]) || 0;
      return (hours * 3600) + (minutes * 60) + seconds;
    }
    
    // Handle format like "45:30" (minutes:seconds)
    if (parts.length === 2) {
      const minutes = parseInt(parts[0]) || 0;
      const seconds = parseInt(parts[1]) || 0;
      return (minutes * 60) + seconds;
    }
    
    // Handle format like "45" (just minutes)
    if (parts.length === 1) {
      const minutes = parseInt(parts[0]) || 0;
      return minutes * 60;
    }
    
    return null;
  }

  detectTrainingTypeFromData(workout) {
    // First check if we have explicit sportType or type from TrainingPeaks
    if (workout.sportType) {
      const sportType = workout.sportType.toLowerCase();
      if (sportType === 'run' || sportType === 'running') return 'running';
      if (sportType === 'bike' || sportType === 'cycling') return 'cycling';
      if (sportType === 'swim' || sportType === 'swimming') return 'swimming';
      if (sportType === 'strength') return 'strength';
    }
    
    if (workout.type) {
      const type = workout.type.toLowerCase();
      if (type === 'running') return 'running';
      if (type === 'cycling') return 'cycling';
      if (type === 'swimming') return 'swimming';
      if (type === 'strength') return 'strength';
    }
    
    // Fallback to text-based detection
    return this.detectTrainingType(workout.title || '', workout.description || '');
  }

  detectTrainingType(title, description) {
    const text = `${title} ${description}`.toLowerCase();
    
    // Danish terms for different training types
    if (text.includes('løb') || text.includes('running') || text.includes('jog')) {
      return 'running';
    }
    if (text.includes('cykel') || text.includes('cycling') || text.includes('bike')) {
      return 'cycling';
    }
    if (text.includes('svømning') || text.includes('swimming') || text.includes('swim')) {
      return 'swimming';
    }
    if (text.includes('styrke') || text.includes('strength') || text.includes('weights')) {
      return 'strength';
    }
    if (text.includes('intervaller') || text.includes('interval')) {
      return 'intervals';
    }
    if (text.includes('tempo')) {
      return 'tempo';
    }
    if (text.includes('tur') || text.includes('tour')) {
      return 'running';
    }
    if (text.includes('stræk') || text.includes('stretch')) {
      return 'flexibility';
    }
    
    return 'other';
  }

    // Get current Monday-based week start
    getCurrentWeekStart(dateStr = null) {
        const date = dateStr ? new Date(dateStr) : new Date();
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday start
        const monday = new Date(date.setDate(diff));
        monday.setHours(0, 0, 0, 0);
        return monday.toISOString().split('T')[0];
    }

    // Get user's training sessions for a date range
    async getUserTrainingSessions(userId, startDate, endDate) {
        try {
            const query = `
                SELECT date, type, description, duration
                FROM training_sessions 
                WHERE user_id = $1 AND date >= $2 AND date <= $3
                ORDER BY date
            `;
            
            const result = await db.query(query, [userId, startDate, endDate]);
            return result.rows;
        } catch (error) {
            console.error('❌ Error getting user training sessions:', error);
            throw error;
        }
    }

    // Get all user's training sessions (no date filtering)
    async getAllUserTrainingSessions(userId) {
        try {
            const query = `
                SELECT date, type, description, duration, distance, workout_id
                FROM training_sessions 
                WHERE user_id = $1
                ORDER BY date DESC
            `;
            
            const result = await db.query(query, [userId]);
            return result.rows;
        } catch (error) {
            console.error('❌ Error getting all user training sessions:', error);
            throw error;
        }
    }

    // Log scraping attempts
    async logScrapingAttempt(userId, scrapeType, status, message, sessionsFound = 0, weekStartDate = null) {
        try {
            const weekStart = weekStartDate || this.getCurrentWeekStart();
            const query = `
                INSERT INTO training_scraping_logs (user_id, scrape_type, status, message, sessions_found, week_start_date, scraped_at)
                VALUES ($1, $2, $3, $4, $5, $6, NOW())
            `;
            
            await db.query(query, [userId, scrapeType, status, message, sessionsFound, weekStart]);
        } catch (error) {
            console.error('❌ Error logging scraping attempt:', error);
            throw error;
        }
    }

    // Get users without recent training data
    async getUsersWithoutRecentTraining() {
        try {
            const weekStart = this.getCurrentWeekStart();
            
            const query = `
                SELECT 
                    u.id,
                    u.email,
                    tpc.username,
                    tpc.encrypted_password
                FROM users u
                JOIN training_peaks_credentials tpc ON u.id = tpc.user_id
                WHERE u.status = 'approved'
                AND NOT EXISTS (
                    SELECT 1 FROM training_sessions ts 
                    WHERE ts.user_id = u.id 
                    AND ts.week_start_date = $1
                )
            `;
            
            const result = await db.query(query, [weekStart]);
            
            return result.rows.map(row => ({
                id: row.id,
                email: row.email,
                username: row.username,
                password: encryptionUtil.decrypt(row.encrypted_password)
            }));
        } catch (error) {
            console.error('❌ Error getting users without recent training:', error);
            throw error;
        }
    }

    // Get failed attempts count for user
    async getFailedAttempts(userId) {
        try {
            const weekStart = this.getCurrentWeekStart();
            
            const query = `
                SELECT COUNT(*) as count
                FROM training_scraping_logs
                WHERE user_id = $1 
                AND status = 'error' 
                AND scraped_at >= $2::date
            `;
            
            const result = await db.query(query, [userId, weekStart]);
            return parseInt(result.rows[0].count);
        } catch (error) {
            console.error('❌ Error getting failed attempts:', error);
            throw error;
        }
    }

    // Delete user credentials
    async deleteUserCredentials(userId) {
        try {
            const query = `DELETE FROM training_peaks_credentials WHERE user_id = $1`;
            await db.query(query, [userId]);
            console.log(`✅ Deleted credentials for user ${userId}`);
        } catch (error) {
            console.error('❌ Error deleting user credentials:', error);
            throw error;
        }
    }

    // ===== GARMIN CONNECT METHODS =====

    // Store Garmin Connect credentials
    async storeGarminCredentials(userId, username, password) {
        try {
            const encryptedPassword = encryptionUtil.encrypt(password);
            
            const query = `
                INSERT INTO garmin_credentials (
                    user_id, username, password_encrypted, iv_password, created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, NOW(), NOW())
                ON CONFLICT (user_id) 
                DO UPDATE SET 
                    username = $2,
                    password_encrypted = $3,
                    iv_password = $4,
                    updated_at = NOW(),
                    auth_failures = 0,
                    last_successful_auth = NOW()
            `;
            
            await db.query(query, [userId, username, encryptedPassword.encryptedData, encryptedPassword.iv]);
            console.log(`✅ Stored Garmin credentials for user ${userId}`);
        } catch (error) {
            console.error('❌ Error storing Garmin credentials:', error);
            throw error;
        }
    }

    // Get Garmin credentials with decryption
    async getGarminCredentials(userId) {
        try {
            const query = `
                SELECT username, password_encrypted, iv_password, is_active, last_successful_auth, auth_failures
                FROM garmin_credentials 
                WHERE user_id = $1 AND is_active = true
            `;
            
            const result = await db.query(query, [userId]);
            
            if (result.rows.length === 0) {
                return null;
            }
            
            const { username, password_encrypted, iv_password, is_active, last_successful_auth, auth_failures } = result.rows[0];
            
            // Decrypt password using the stored IV
            const decrypted_password = encryptionUtil.decrypt({ 
                encryptedData: password_encrypted, 
                iv: iv_password 
            });
            
            return { 
                username, 
                decrypted_password, 
                is_active, 
                last_successful_auth, 
                auth_failures 
            };
        } catch (error) {
            console.error('❌ Error getting Garmin credentials:', error);
            throw error;
        }
    }

    // Delete Garmin credentials
    async deleteGarminCredentials(userId) {
        try {
            const query = `DELETE FROM garmin_credentials WHERE user_id = $1`;
            await db.query(query, [userId]);
            console.log(`✅ Deleted Garmin credentials for user ${userId}`);
        } catch (error) {
            console.error('❌ Error deleting Garmin credentials:', error);
            throw error;
        }
    }

    // Log Garmin sync attempts for debugging
    async logGarminSync(userId, syncType, action, success, errorMessage = null, requestData = null, responseData = null) {
        try {
            const query = `
                INSERT INTO garmin_sync_logs (
                    user_id, sync_type, action, success, error_message, 
                    request_data, response_data, created_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            `;
            
            await db.query(query, [
                userId, 
                syncType, 
                action, 
                success, 
                errorMessage,
                requestData ? JSON.stringify(requestData) : null,
                responseData ? JSON.stringify(responseData) : null
            ]);
        } catch (error) {
            console.error('❌ Error logging Garmin sync:', error);
            throw error;
        }
    }

    // Record workout sync to Garmin
    async recordGarminWorkoutSync(userId, trainingSessionId, garminWorkoutId, workoutName, syncStatus, errorMessage = null, workoutData = null, garminResponse = null) {
        try {
            const query = `
                INSERT INTO garmin_workout_sync (
                    user_id, training_session_id, garmin_workout_id, workout_name,
                    sync_status, sync_attempted_at, sync_completed_at, error_message,
                    workout_data, garmin_response
                )
                VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9)
                ON CONFLICT (training_session_id)
                DO UPDATE SET
                    garmin_workout_id = $3,
                    workout_name = $4,
                    sync_status = $5,
                    sync_completed_at = $6,
                    error_message = $7,
                    retry_count = garmin_workout_sync.retry_count + 1,
                    workout_data = $8,
                    garmin_response = $9
            `;
            
            const syncCompletedAt = syncStatus === 'success' ? 'NOW()' : null;
            
            await db.query(query, [
                userId,
                trainingSessionId,
                garminWorkoutId,
                workoutName,
                syncStatus,
                syncCompletedAt,
                errorMessage,
                workoutData ? JSON.stringify(workoutData) : null,
                garminResponse ? JSON.stringify(garminResponse) : null
            ]);
            
            console.log(`📝 Recorded Garmin workout sync for session ${trainingSessionId}: ${syncStatus}`);
        } catch (error) {
            console.error('❌ Error recording Garmin workout sync:', error);
            throw error;
        }
    }

    // Get training session for Garmin sync
    async getTrainingSession(userId, sessionId) {
        try {
            const query = `
                SELECT * FROM training_sessions 
                WHERE id = $1 AND user_id = $2
            `;
            
            const result = await db.query(query, [sessionId, userId]);
            return result.rows.length > 0 ? result.rows[0] : null;
        } catch (error) {
            console.error('❌ Error getting training session:', error);
            throw error;
        }
    }

    // Mark training session as Garmin synced
    async markTrainingSessionGarminSynced(sessionId) {
        try {
            const query = `
                UPDATE training_sessions 
                SET garmin_synced = true, garmin_sync_attempted = NOW()
                WHERE id = $1
            `;
            
            await db.query(query, [sessionId]);
            console.log(`✅ Marked session ${sessionId} as Garmin synced`);
        } catch (error) {
            console.error('❌ Error marking session as Garmin synced:', error);
            throw error;
        }
    }

    // Get Garmin sync history for user
    async getGarminSyncHistory(userId, limit = 50) {
        try {
            const query = `
                SELECT * FROM garmin_sync_logs 
                WHERE user_id = $1 
                ORDER BY created_at DESC 
                LIMIT $2
            `;
            
            const result = await db.query(query, [userId, limit]);
            return result.rows;
        } catch (error) {
            console.error('❌ Error getting Garmin sync history:', error);
            throw error;
        }
    }

    // Get Garmin workout syncs for user
    async getGarminWorkoutSyncs(userId, limit = 50) {
        try {
            const query = `
                SELECT 
                    gws.*,
                    ts.title as training_title,
                    ts.session_date,
                    ts.description as training_description
                FROM garmin_workout_sync gws
                JOIN training_sessions ts ON gws.training_session_id = ts.id
                WHERE gws.user_id = $1 
                ORDER BY gws.sync_attempted_at DESC 
                LIMIT $2
            `;
            
            const result = await db.query(query, [userId, limit]);
            return result.rows;
        } catch (error) {
            console.error('❌ Error getting Garmin workout syncs:', error);
            throw error;
        }
    }

    // ===== GARMIN OAUTH TOKEN METHODS =====

    // Store OAuth tokens for session reuse
    async storeGarminTokens(userId, oauth1Token, oauth2Token) {
        try {
            const oauth1Encrypted = encryptionUtil.encrypt(JSON.stringify(oauth1Token));
            const oauth2Encrypted = encryptionUtil.encrypt(JSON.stringify(oauth2Token));
            
            // Calculate token expiry based on OAuth2 token info
            const expiresAt = new Date(Date.now() + (oauth2Token.expires_in * 1000));
            
            const query = `
                UPDATE garmin_credentials 
                SET 
                    oauth1_token = $2,
                    oauth1_iv = $3,
                    oauth2_token = $4,
                    oauth2_iv = $5,
                    token_expires_at = $6,
                    last_login_at = NOW(),
                    updated_at = NOW()
                WHERE user_id = $1
            `;
            
            await db.query(query, [
                userId, 
                oauth1Encrypted.encryptedData,
                oauth1Encrypted.iv,
                oauth2Encrypted.encryptedData,
                oauth2Encrypted.iv,
                expiresAt
            ]);
            
            console.log(`✅ Stored OAuth tokens for user ${userId}, expires at ${expiresAt}`);
        } catch (error) {
            console.error('❌ Error storing OAuth tokens:', error);
            throw error;
        }
    }

    // Get OAuth tokens for session reuse
    async getGarminTokens(userId) {
        try {
            const query = `
                SELECT oauth1_token, oauth1_iv, oauth2_token, oauth2_iv, token_expires_at, last_login_at
                FROM garmin_credentials 
                WHERE user_id = $1 AND is_active = true
            `;
            
            const result = await db.query(query, [userId]);
            
            if (result.rows.length === 0) {
                return null;
            }
            
            const { oauth1_token, oauth1_iv, oauth2_token, oauth2_iv, token_expires_at, last_login_at } = result.rows[0];
            
            // If no tokens stored yet
            if (!oauth1_token || !oauth2_token) {
                console.log(`ℹ️ No stored OAuth tokens for user ${userId}`);
                return null;
            }
            
            // Check if tokens are expired
            if (token_expires_at && new Date() > new Date(token_expires_at)) {
                console.log(`⚠️ OAuth tokens expired for user ${userId}`);
                return null;
            }
            
            // Decrypt tokens
            const oauth1 = JSON.parse(encryptionUtil.decrypt({ 
                encryptedData: oauth1_token, 
                iv: oauth1_iv
            }));
            
            const oauth2 = JSON.parse(encryptionUtil.decrypt({ 
                encryptedData: oauth2_token, 
                iv: oauth2_iv
            }));
            
            console.log(`✅ Retrieved valid OAuth tokens for user ${userId}`);
            return { oauth1, oauth2, last_login_at };
            
        } catch (error) {
            console.error('❌ Error getting OAuth tokens:', error);
            // Return null instead of throwing to allow fallback to fresh login
            return null;
        }
    }

    // Clear OAuth tokens (on logout or auth failure)
    async clearGarminTokens(userId) {
        try {
            const query = `
                UPDATE garmin_credentials 
                SET 
                    oauth1_token = NULL,
                    oauth1_iv = NULL,
                    oauth2_token = NULL,
                    oauth2_iv = NULL,
                    token_expires_at = NULL,
                    updated_at = NOW()
                WHERE user_id = $1
            `;
            
            await db.query(query, [userId]);
            console.log(`✅ Cleared OAuth tokens for user ${userId}`);
        } catch (error) {
            console.error('❌ Error clearing OAuth tokens:', error);
            throw error;
        }
    }
}

module.exports = StorageService;
