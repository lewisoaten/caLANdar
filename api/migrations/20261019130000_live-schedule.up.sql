-- caLANdar Live, phase 1: one schedule, two views (DESIGN.md §4).

-- Event settings Live needs.
ALTER TABLE event
    ADD COLUMN discord_invite_url TEXT,
    -- Random, rotatable by an admin; the no-login wall-board link.
    ADD COLUMN wallboard_token TEXT UNIQUE,
    ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Europe/London',
    -- {placeId, lat, lng, name} for food search near the venue.
    ADD COLUMN venue JSONB;

-- A lobby IS a schedule entry. start_time/duration_minutes stay "the current
-- best time" (the actual time once played, else the planned or moved time),
-- so existing readers keep working.
ALTER TABLE event_game_schedule
    ALTER COLUMN game_id DROP NOT NULL,
    ADD COLUMN kind TEXT NOT NULL DEFAULT 'game' CHECK (kind IN ('game', 'food')),
    -- {name, placeId?, photoUrl?, rating?, address?, freeText?}
    ADD COLUMN food JSONB,
    ADD COLUMN status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN (
        'planned', 'proposed', 'confirmed', 'waiting', 'delayed', 'grace',
        'live', 'empty', 'done', 'removed'
    )),
    ADD COLUMN source TEXT NOT NULL DEFAULT 'plan' CHECK (source IN (
        'plan', 'suggestion', 'proposal', 'steam', 'split', 'vote'
    )),
    -- Frozen at the first live change, for "plan vs actual".
    ADD COLUMN planned_start TIMESTAMPTZ,
    ADD COLUMN planned_minutes INTEGER,
    ADD COLUMN actual_start TIMESTAMPTZ,
    -- NULL while running.
    ADD COLUMN actual_end TIMESTAMPTZ,
    ADD COLUMN max_players INTEGER,
    -- [{name, size}]
    ADD COLUMN teams JSONB,
    ADD COLUMN proposed_by TEXT,
    ADD COLUMN created_by_vote BIGINT,
    ADD COLUMN grace_until TIMESTAMPTZ,
    ADD COLUMN grace_locked BOOLEAN NOT NULL DEFAULT false,
    -- Seconds of grace left while a delay vote holds it.
    ADD COLUMN hold_remaining_s INTEGER,
    ADD COLUMN empty_since TIMESTAMPTZ,
    ADD COLUMN version INTEGER NOT NULL DEFAULT 0,
    ADD CONSTRAINT event_game_schedule_game_or_food CHECK (
        (kind = 'game' AND game_id IS NOT NULL) OR (kind = 'food' AND food IS NOT NULL)
    );

-- Typical length is learned from what was actually played (§5.6).
CREATE INDEX idx_event_game_schedule_game_status ON event_game_schedule(game_id, status);

-- Personal check-in at the venue.
CREATE TABLE live_checkin (
    event_id INTEGER NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    checked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Who checked them in (themselves, or an admin).
    by_email VARCHAR(255) NOT NULL,
    PRIMARY KEY (event_id, email)
);

-- Players and teams per game, "saved for everyone" across events (§5.6).
CREATE TABLE game_lobby_defaults (
    game_id BIGINT PRIMARY KEY REFERENCES steam_game(appid) ON DELETE CASCADE,
    max_players INTEGER,
    teams JSONB,
    -- Explicit override; otherwise the learned typical length applies.
    duration_minutes INTEGER,
    set_by VARCHAR(255),
    set_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE live_runtime ADD COLUMN plan_hash TEXT;
