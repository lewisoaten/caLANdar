-- Add down migration script here
-- Remove indexes added for event games optimization

DROP INDEX IF EXISTS idx_user_game_appid;
DROP INDEX IF EXISTS idx_steam_game_name;
DROP INDEX IF EXISTS idx_user_game_email_appid;
