ALTER TABLE live_runtime DROP COLUMN plan_hash;
DROP TABLE game_lobby_defaults;
DROP TABLE live_checkin;
DROP INDEX idx_event_game_schedule_game_status;
DELETE FROM event_game_schedule WHERE kind <> 'game' OR status = 'removed';
ALTER TABLE event_game_schedule
    DROP CONSTRAINT event_game_schedule_game_or_food,
    DROP COLUMN version,
    DROP COLUMN empty_since,
    DROP COLUMN hold_remaining_s,
    DROP COLUMN grace_locked,
    DROP COLUMN grace_until,
    DROP COLUMN created_by_vote,
    DROP COLUMN proposed_by,
    DROP COLUMN teams,
    DROP COLUMN max_players,
    DROP COLUMN actual_end,
    DROP COLUMN actual_start,
    DROP COLUMN planned_minutes,
    DROP COLUMN planned_start,
    DROP COLUMN source,
    DROP COLUMN status,
    DROP COLUMN food,
    DROP COLUMN kind,
    ALTER COLUMN game_id SET NOT NULL;
ALTER TABLE event
    DROP COLUMN venue,
    DROP COLUMN timezone,
    DROP COLUMN wallboard_token,
    DROP COLUMN discord_invite_url;
