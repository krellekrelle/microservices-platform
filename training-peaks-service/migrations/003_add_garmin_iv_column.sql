-- Add IV column for Garmin password encryption
-- Migration: 003_add_garmin_iv_column.sql

-- Add iv_password column to store the initialization vector for password decryption
ALTER TABLE garmin_credentials ADD COLUMN IF NOT EXISTS iv_password VARCHAR(32);

-- Update the table comment
COMMENT ON COLUMN garmin_credentials.iv_password IS 'Initialization vector for password encryption/decryption';
