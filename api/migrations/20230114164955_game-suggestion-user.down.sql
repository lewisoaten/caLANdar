-- Add down migration script here
ALTER TABLE event_game
DROP COLUMN user_email;
