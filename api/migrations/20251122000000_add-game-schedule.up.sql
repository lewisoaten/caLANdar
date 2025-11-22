-- Add up migration script here
CREATE TABLE event_game_schedule (
   id serial PRIMARY KEY,
   event_id INTEGER NOT NULL,
   game_id BIGINT NOT NULL,
   start_time TIMESTAMPTZ NOT NULL,
   duration_minutes INTEGER NOT NULL DEFAULT 120,
   is_pinned BOOLEAN NOT NULL DEFAULT true,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   CONSTRAINT fk_event
      FOREIGN KEY(event_id)
	    REFERENCES event(id)
        ON DELETE CASCADE,
   CONSTRAINT fk_steam_game
      FOREIGN KEY(game_id)
	    REFERENCES steam_game(appid)
        ON DELETE CASCADE
);

-- Index for efficient queries by event
CREATE INDEX idx_event_game_schedule_event_id ON event_game_schedule(event_id);

-- Index for efficient queries by game
CREATE INDEX idx_event_game_schedule_game_id ON event_game_schedule(game_id);

-- Index for efficient time range queries
CREATE INDEX idx_event_game_schedule_start_time ON event_game_schedule(start_time);

-- Composite index for common queries (event + pinned status)
CREATE INDEX idx_event_game_schedule_event_pinned ON event_game_schedule(event_id, is_pinned);
