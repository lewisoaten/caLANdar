-- Add up migration script here
-- Add indexes to optimize event queries for pagination and filtering
CREATE INDEX IF NOT EXISTS idx_event_time_begin ON event(time_begin);
CREATE INDEX IF NOT EXISTS idx_event_created_at ON event(created_at);
