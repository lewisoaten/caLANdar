-- Add down migration script here
DROP INDEX IF EXISTS idx_event_time_begin;
DROP INDEX IF EXISTS idx_event_created_at;
