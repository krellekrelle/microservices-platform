-- Cleanup script for removing soft delete mechanism
-- This script permanently deletes soft-deleted riot accounts and optionally removes the is_active column

-- 1. First, let's see what we have
SELECT 
    'BEFORE CLEANUP' as stage,
    COUNT(*) as total_accounts,
    COUNT(CASE WHEN is_active = true THEN 1 END) as active_accounts,
    COUNT(CASE WHEN is_active = false THEN 1 END) as soft_deleted_accounts
FROM riot_accounts;

-- 2. Permanently delete soft-deleted accounts
DELETE FROM riot_accounts WHERE is_active = false;

-- 3. Show results after cleanup
SELECT 
    'AFTER CLEANUP' as stage,
    COUNT(*) as total_accounts,
    COUNT(CASE WHEN is_active = true THEN 1 END) as active_accounts,
    COUNT(CASE WHEN is_active = false THEN 1 END) as soft_deleted_accounts
FROM riot_accounts;

-- 4. Optional: Remove the is_active column entirely (uncomment if desired)
-- Note: This will also drop the related index
-- DROP INDEX IF EXISTS idx_riot_accounts_active;
-- ALTER TABLE riot_accounts DROP COLUMN is_active;

-- 5. Show final schema (optional)
-- \d riot_accounts
