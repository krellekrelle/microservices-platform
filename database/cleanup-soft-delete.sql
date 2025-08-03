-- Cleanup script for removing soft delete mechanism (DEPRECATED)
-- This script is no longer needed as is_active column has been removed from riot_accounts table
-- The table now uses hard deletes only

-- Note: This file is kept for historical reference only
-- If you previously had soft deletes and want to clean them up, 
-- you would need to restore the is_active column first, run cleanup, then remove it again

-- Historical cleanup steps (for reference):
-- 1. Check for soft-deleted records: SELECT COUNT(*) FROM riot_accounts WHERE is_active = false;
-- 2. Permanently delete: DELETE FROM riot_accounts WHERE is_active = false;
-- 3. Remove column: ALTER TABLE riot_accounts DROP COLUMN is_active;
-- 4. Drop index: DROP INDEX IF EXISTS idx_riot_accounts_active;

-- Current schema verification
SELECT 
    'CURRENT STATE' as info,
    COUNT(*) as total_accounts
FROM riot_accounts;
