-- Room editor (HyperLAN redesign): grid layout, features and background plan image.
ALTER TABLE room
    ADD COLUMN grid_rows INTEGER CHECK (grid_rows IS NULL OR (grid_rows BETWEEN 1 AND 50)),
    ADD COLUMN features JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN background_style TEXT NOT NULL DEFAULT 'retro'
        CHECK (background_style IN ('retro', 'original')),
    ADD COLUMN background_opacity DOUBLE PRECISION NOT NULL DEFAULT 0.6
        CHECK (background_opacity BETWEEN 0.1 AND 1.0);

ALTER TABLE seat
    ADD COLUMN grid_col INTEGER,
    ADD COLUMN grid_row INTEGER;

-- Background images live in Postgres (Cloud Run has no persistent disk).
-- `token` is a random, unguessable id used in the public image URL so that
-- <img>/CSS can fetch it without a bearer token.
CREATE TABLE room_background (
    room_id INTEGER PRIMARY KEY REFERENCES room(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    content_type TEXT NOT NULL,
    data BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
