-- Add up migration script here
ALTER TABLE user_game
ADD COLUMN last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW();
