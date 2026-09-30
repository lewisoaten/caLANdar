-- Record when a Steam game cache refresh finished, so the Gamers screen can
-- show "refreshed N days ago" without counting failed/in-flight refreshes.
ALTER TABLE steam_game_update ADD COLUMN completed_at TIMESTAMPTZ;

-- Historical refreshes have no completion record; assume they finished.
UPDATE steam_game_update SET completed_at = update_time;
