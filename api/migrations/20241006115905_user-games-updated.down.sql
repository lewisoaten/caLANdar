-- Add down migration script here
ALTER TABLE user_game
DROP COLUMN last_modified;
