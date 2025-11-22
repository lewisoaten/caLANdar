-- Add down migration script here
DROP INDEX IF EXISTS idx_event_game_schedule_event_pinned;
DROP INDEX IF EXISTS idx_event_game_schedule_start_time;
DROP INDEX IF EXISTS idx_event_game_schedule_game_id;
DROP INDEX IF EXISTS idx_event_game_schedule_event_id;
DROP TABLE IF EXISTS event_game_schedule;
