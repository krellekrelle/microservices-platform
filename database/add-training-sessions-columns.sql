-- Add distance and workout_id columns to training_sessions table
ALTER TABLE training_sessions 
ADD COLUMN IF NOT EXISTS distance VARCHAR(50),
ADD COLUMN IF NOT EXISTS workout_id VARCHAR(50);

-- Add index for workout_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_training_sessions_workout_id ON training_sessions(workout_id);
