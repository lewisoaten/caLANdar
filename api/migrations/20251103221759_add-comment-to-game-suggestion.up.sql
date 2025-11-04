-- Add up migration script here
ALTER TABLE event_game
ADD COLUMN comment TEXT CHECK (char_length(comment) <= 500);
