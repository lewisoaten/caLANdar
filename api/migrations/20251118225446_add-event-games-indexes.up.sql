-- Add up migration script here
-- Add indexes to optimize event games queries

-- Index on user_game.appid for faster lookups when filtering by specific games
CREATE INDEX IF NOT EXISTS idx_user_game_appid ON user_game(appid);

-- Index on steam_game.name for faster sorting and searching
CREATE INDEX IF NOT EXISTS idx_steam_game_name ON steam_game(name);

-- Composite index on user_game for common query patterns
CREATE INDEX IF NOT EXISTS idx_user_game_email_appid ON user_game(LOWER(email), appid);
