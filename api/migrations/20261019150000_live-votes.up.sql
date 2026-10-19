-- caLANdar Live, phase 3: votes (DESIGN.md §5.2-5.4).

-- (Named live_vote: `vote` is already the game-vote enum type.)
-- A competitive decision: what's on at a slot, keep playing, delay,
-- change, kick off early. Who is "involved" is recomputed from live state
-- for each vote type, so there is no eligible[] column (§5.3.3).
CREATE TABLE live_vote (
    id BIGSERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('slot', 'extend', 'delay', 'change', 'kickoff')),
    target_lobby_id INTEGER REFERENCES event_game_schedule(id) ON DELETE SET NULL,
    slot_start TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'final', 'vetoed', 'lapsed')),
    -- unanimous | everyone_split | admin_pick | admin_split | deadline | joined
    resolution TEXT,
    opened_by VARCHAR(255) NOT NULL,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deadline TIMESTAMPTZ NOT NULL,
    -- Unanimous: final at this time unless someone changes their mind.
    settle_at TIMESTAMPTZ,
    resolved_by VARCHAR(255),
    resolved_at TIMESTAMPTZ,
    winner_option_id BIGINT
);

CREATE INDEX idx_live_vote_event ON live_vote(event_id);

CREATE TABLE live_vote_option (
    id BIGSERIAL PRIMARY KEY,
    vote_id BIGINT NOT NULL REFERENCES live_vote(id) ON DELETE CASCADE,
    -- lobby | game | food | keep_playing | yes | no
    kind TEXT NOT NULL,
    -- What the option reads as ("Delay +30m", "Keep playing CS2").
    label TEXT NOT NULL DEFAULT '',
    lobby_id INTEGER REFERENCES event_game_schedule(id) ON DELETE SET NULL,
    game_id BIGINT,
    food JSONB,
    start_delta_min INTEGER,
    duration_min INTEGER,
    new_start TIMESTAMPTZ,
    max_players INTEGER,
    teams JSONB,
    created_by VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_live_vote_option_vote ON live_vote_option(vote_id);

CREATE TABLE live_vote_ballot (
    vote_id BIGINT NOT NULL REFERENCES live_vote(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    option_id BIGINT REFERENCES live_vote_option(id) ON DELETE SET NULL,
    split_ok BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (vote_id, email)
);
