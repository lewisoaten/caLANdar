-- A refresh now runs in the background, so its outcome is recorded here for
-- the admin page to poll. Running = neither completed_at nor error is set.
ALTER TABLE steam_game_update ADD COLUMN games_added BIGINT;
ALTER TABLE steam_game_update ADD COLUMN error TEXT;
