-- caLANdar Live, phase 0: the append-only log behind the live stream.
-- See docs/live-event/DESIGN.md §3.2.

-- Every live write appends rows here. A row is at once an SSE delta (full
-- entity snapshot, `id: seq`), a feed history entry (rows with a tier) and
-- the replay cursor for reconnecting clients (`Last-Event-ID`).
CREATE TABLE live_log (
    seq BIGSERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- email, 'steam', 'system' or 'admin:<email>'
    actor TEXT,
    -- 'lobby', 'vote', 'person', 'feed', 'feed.delete', 'toast.admin', ...
    kind TEXT NOT NULL,
    -- Feed tier 1-4 (result, lobby event, action, presence); NULL for
    -- state-only deltas.
    tier SMALLINT,
    -- NULL = everyone; 'email:<address>' = one person; 'admin' = admins.
    audience TEXT,
    payload JSONB NOT NULL
);

CREATE INDEX idx_live_log_event_seq ON live_log(event_id, seq);
-- The feed reads the tiered rows only.
CREATE INDEX idx_live_log_event_feed ON live_log(event_id, seq) WHERE tier IS NOT NULL;

-- Idempotency keys for live commands, so a retried POST on flaky venue
-- Wi-Fi is applied once. Rows older than 10 minutes are pruned.
CREATE TABLE live_command (
    event_id INTEGER NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL,
    response JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (event_id, idempotency_key)
);

CREATE INDEX idx_live_command_created_at ON live_command(created_at);

-- Per-event bookkeeping for the background work (Steam polling, planner
-- materialisation), claimed with a conditional UPDATE so that only one
-- instance does each job at a time.
CREATE TABLE live_runtime (
    event_id INTEGER PRIMARY KEY REFERENCES event(id) ON DELETE CASCADE,
    steam_polled_at TIMESTAMPTZ NOT NULL DEFAULT 'epoch',
    plan_checked_at TIMESTAMPTZ NOT NULL DEFAULT 'epoch',
    ticked_at TIMESTAMPTZ NOT NULL DEFAULT 'epoch'
);
