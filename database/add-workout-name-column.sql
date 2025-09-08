-- Add workout_name column to training_sessions table
ALTER TABLE training_sessions 
ADD COLUMN IF NOT EXISTS workout_name VARCHAR(255);

-- Add index for workout_name for faster searches
CREATE INDEX IF NOT EXISTS idx_training_sessions_workout_name ON training_sessions(workout_name);

-- Update the unique constraint to include workout_name since workouts can have same description but different names
-- First drop the existing constraint
ALTER TABLE training_sessions DROP CONSTRAINT IF EXISTS training_sessions_user_id_date_type_description_key;

-- Add new constraint that includes workout_name
ALTER TABLE training_sessions ADD CONSTRAINT training_sessions_user_id_date_type_unique 
UNIQUE(user_id, date, type, workout_name, description);
