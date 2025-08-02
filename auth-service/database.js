const { Pool } = require('pg');

class DatabaseService {
  constructor() {
    // Initialize PostgreSQL connection pool
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
      connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
    });

    // Handle pool errors
    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
      process.exit(-1);
    });

    console.log('📊 Database service initialized');
  }

  async testConnection() {
    try {
      const client = await this.pool.connect();
      const result = await client.query('SELECT NOW()');
      client.release();
      console.log('✅ Database connection successful:', result.rows[0].now);
      return true;
    } catch (error) {
      console.error('❌ Database connection failed:', error.message);
      return false;
    }
  }

  // User management methods
  async createOrUpdateUser(googleProfile) {
    const client = await this.pool.connect();
    try {
      const { id: googleId, emails, displayName, photos } = googleProfile;
      const email = emails[0].value;
      const name = displayName;
      const profilePicture = photos?.[0]?.value || '';

      // Check if user already exists
      const existingUser = await client.query(
        'SELECT * FROM users WHERE email = $1 OR google_id = $2',
        [email, googleId]
      );

      let user;
      if (existingUser.rows.length > 0) {
        // Update existing user
        user = await client.query(
          `UPDATE users 
           SET google_id = $1, name = $2, profile_picture_url = $3, updated_at = CURRENT_TIMESTAMP
           WHERE email = $4 
           RETURNING *`,
          [googleId, name, profilePicture, email]
        );
      } else {
        // Create new user
        user = await client.query(
          `INSERT INTO users (google_id, email, name, profile_picture_url, status, is_admin)
           VALUES ($1, $2, $3, $4, 'unknown', FALSE)
           RETURNING *`,
          [googleId, email, name, profilePicture]
        );
      }

      return user.rows[0];
    } finally {
      client.release();
    }
  }

  async getUserByEmail(email) {
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT * FROM users WHERE email = $1', [email]);
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  async getUserById(id) {
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT * FROM users WHERE id = $1', [id]);
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  async getAllUsers() {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT id, email, name, status, is_admin, created_at, updated_at,
               CASE 
                 WHEN status = 'unknown' THEN 'Pending Approval'
                 WHEN status = 'approved' THEN 'Approved'
                 WHEN status = 'rejected' THEN 'Rejected'
               END as status_display
        FROM users 
        ORDER BY created_at DESC
      `);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async getUsersByStatus(status) {
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT * FROM users WHERE status = $1 ORDER BY created_at DESC', [status]);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async updateUserStatus(email, newStatus, changedBy = null) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Get current user
      const currentUser = await client.query('SELECT * FROM users WHERE email = $1', [email]);
      if (currentUser.rows.length === 0) {
        throw new Error('User not found');
      }

      const user = currentUser.rows[0];
      const oldStatus = user.status;

      // Update user status
      const updatedUser = await client.query(
        'UPDATE users SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE email = $2 RETURNING *',
        [newStatus, email]
      );

      // Log the status change
      await client.query(
        `INSERT INTO user_status_changes (user_id, old_status, new_status, changed_by, reason)
         VALUES ($1, $2, $3, $4, $5)`,
        [user.id, oldStatus, newStatus, changedBy, `Status changed from ${oldStatus} to ${newStatus}`]
      );

      await client.query('COMMIT');
      return updatedUser.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async approveUser(email, changedBy = null) {
    return this.updateUserStatus(email, 'approved', changedBy);
  }

  async rejectUser(email, changedBy = null) {
    return this.updateUserStatus(email, 'rejected', changedBy);
  }

  async getUserStatusHistory(userId) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT usc.*, u.email as changed_by_email
        FROM user_status_changes usc
        LEFT JOIN users u ON usc.changed_by = u.id
        WHERE usc.user_id = $1
        ORDER BY usc.changed_at DESC
      `, [userId]);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async deleteUser(email, changedBy = null) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Get user first
      const currentUser = await client.query('SELECT * FROM users WHERE email = $1', [email]);
      if (currentUser.rows.length === 0) {
        throw new Error('User not found');
      }

      const user = currentUser.rows[0];

      // Log deletion
      await client.query(
        `INSERT INTO user_status_changes (user_id, old_status, new_status, changed_by, reason)
         VALUES ($1, $2, 'deleted', $3, $4)`,
        [user.id, user.status, changedBy, 'User deleted by admin']
      );

      // Delete user
      await client.query('DELETE FROM users WHERE email = $1', [email]);

      await client.query('COMMIT');
      return user;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async promoteToAdmin(email, changedBy = null) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Get current user
      const currentUser = await client.query('SELECT * FROM users WHERE email = $1', [email]);
      if (currentUser.rows.length === 0) {
        throw new Error('User not found');
      }

      const user = currentUser.rows[0];

      // Update user to admin
      const updatedUser = await client.query(
        'UPDATE users SET is_admin = true, updated_at = CURRENT_TIMESTAMP WHERE email = $1 RETURNING *',
        [email]
      );

      // Log the change
      await client.query(
        `INSERT INTO user_status_changes (user_id, old_status, new_status, changed_by, reason)
         VALUES ($1, $2, $3, $4, $5)`,
        [user.id, 'user', 'admin', changedBy, 'Promoted to admin']
      );

      await client.query('COMMIT');
      return updatedUser.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async demoteFromAdmin(email, changedBy = null) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Get current user
      const currentUser = await client.query('SELECT * FROM users WHERE email = $1', [email]);
      if (currentUser.rows.length === 0) {
        throw new Error('User not found');
      }

      const user = currentUser.rows[0];

      // Update user to regular user
      const updatedUser = await client.query(
        'UPDATE users SET is_admin = false, updated_at = CURRENT_TIMESTAMP WHERE email = $1 RETURNING *',
        [email]
      );

      // Log the change
      await client.query(
        `INSERT INTO user_status_changes (user_id, old_status, new_status, changed_by, reason)
         VALUES ($1, $2, $3, $4, $5)`,
        [user.id, 'admin', 'user', changedBy, 'Demoted from admin']
      );

      await client.query('COMMIT');
      return updatedUser.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Clean up method
  async close() {
    await this.pool.end();
    console.log('📊 Database pool closed');
  }
}

module.exports = DatabaseService;
