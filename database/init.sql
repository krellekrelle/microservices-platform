-- Microservices Platform Database Schema
-- Initializes the database with tables and initial admin user

-- Create users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    google_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    profile_picture_url TEXT,
    status VARCHAR(20) DEFAULT 'unknown' CHECK (status IN ('unknown', 'approved', 'rejected')),
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'
);

-- Create user sessions table (for future use if needed)
CREATE TABLE user_sessions (
    session_id VARCHAR(255) PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create audit log for user status changes
CREATE TABLE user_status_changes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    old_status VARCHAR(20),
    new_status VARCHAR(20),
    changed_by INTEGER REFERENCES users(id), -- Admin who made the change
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    reason TEXT
);

-- Create indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_google_id ON users(google_id);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_sessions_expires ON user_sessions(expires_at);

-- Insert initial admin user (your email)
-- Note: This will be updated with actual Google ID when you first login
INSERT INTO users (google_id, email, name, status, is_admin, profile_picture_url)
VALUES ('pending', 'klarsen1997@gmail.com', 'Kristian Larsen (Admin)', 'approved', TRUE, '')
ON CONFLICT (email) DO NOTHING;

-- Create a function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Create a view for easy user management
CREATE VIEW user_management AS
SELECT 
    id,
    email,
    name,
    status,
    is_admin,
    created_at,
    updated_at,
    CASE 
        WHEN status = 'unknown' THEN 'Pending Approval'
        WHEN status = 'approved' THEN 'Approved'
        WHEN status = 'rejected' THEN 'Rejected'
    END as status_display
FROM users
ORDER BY created_at DESC;
