-- Add up migration script here
ALTER TABLE event
ADD COLUMN image BYTEA NULL;
