-- Add down migration script here
ALTER TABLE event
DROP COLUMN image;
