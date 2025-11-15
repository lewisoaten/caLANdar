-- Add up migration script here
CREATE TABLE event_seating_config (
    event_id INTEGER PRIMARY KEY REFERENCES event(id) ON DELETE CASCADE,
    has_seating BOOLEAN NOT NULL DEFAULT FALSE,
    allow_unspecified_seat BOOLEAN NOT NULL DEFAULT FALSE,
    unspecified_seat_label VARCHAR(255) NOT NULL DEFAULT 'Unspecified Seat',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
