ALTER TABLE sessions ADD COLUMN last_heartbeat INTEGER;
-- Backfill: existing closed sessions get end_time as last_heartbeat (best guess)
UPDATE sessions SET last_heartbeat = end_time WHERE last_heartbeat IS NULL AND end_time IS NOT NULL;
-- Existing orphans get start_time as last_heartbeat (conservative)
UPDATE sessions SET last_heartbeat = start_time WHERE last_heartbeat IS NULL;
