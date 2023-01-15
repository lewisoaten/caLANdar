-- Add up migration script here
ALTER TABLE event_game
ADD COLUMN user_email VARCHAR (255) NOT NULL default 'lewis@oaten.name';
