-- caLANdar Live, phase 2: presence (DESIGN.md §3.7, §4.2, §5.1).

-- One row per presence interval: who was in a lobby, when, and why they
-- left. Plan vs actual and the audit lens read it.
CREATE TABLE lobby_member (
    id BIGSERIAL PRIMARY KEY,
    lobby_id INTEGER NOT NULL REFERENCES event_game_schedule(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    team TEXT,
    via TEXT NOT NULL CHECK (via IN ('steam', 'manual', 'admin')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    left_at TIMESTAMPTZ,
    -- switched | stopped | left | afk | split | ended | expired | elsewhere
    left_reason TEXT,
    -- Manual "now" lapses at the lobby's planned end + 30 minutes unless the
    -- player says they're still playing.
    manual_expires_at TIMESTAMPTZ
);

CREATE INDEX idx_lobby_member_lobby ON lobby_member(lobby_id);
-- At most one current lobby per person per lobby row.
CREATE UNIQUE INDEX idx_lobby_member_open ON lobby_member(lobby_id, email) WHERE left_at IS NULL;

-- Pre-joins: "I'm in for this one". Dropped rather than deleted, so the log
-- can say why.
CREATE TABLE lobby_prejoin (
    lobby_id INTEGER NOT NULL REFERENCES event_game_schedule(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    team TEXT,
    random_team BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    dropped_at TIMESTAMPTZ,
    -- left | elsewhere | rsvp | split
    drop_reason TEXT,
    PRIMARY KEY (lobby_id, email)
);

-- Latest presence per person: what Steam (or the player) says they're
-- playing, plus the debounce and grace bookkeeping.
CREATE TABLE live_presence (
    event_id INTEGER NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    game_id BIGINT,
    game_name TEXT,
    persona_state INTEGER NOT NULL DEFAULT 0,
    visibility INTEGER NOT NULL DEFAULT 3,
    observed_at TIMESTAMPTZ,
    -- A new game counts once it is seen on two polls in a row.
    pending_game_id BIGINT,
    pending_game_name TEXT,
    pending_since TIMESTAMPTZ,
    afk_since TIMESTAMPTZ,
    afk_noted BOOLEAN NOT NULL DEFAULT false,
    -- Left a lobby while Steam still shows its game: ignore that game.
    ignore_game_id BIGINT,
    -- Joined a lobby by hand while Steam shows another game: launch it
    -- before this, or the join becomes a pre-join.
    switch_lobby_id INTEGER REFERENCES event_game_schedule(id) ON DELETE SET NULL,
    switch_grace_until TIMESTAMPTZ,
    private_hint_sent BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (event_id, email)
);
