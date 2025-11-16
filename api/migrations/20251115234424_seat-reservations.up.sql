-- Add up migration script here
-- Seat Reservation Table
-- Stores seat reservations for events, tied to attendance buckets.
-- Supports both specific seats and "unspecified" seats (seat_id IS NULL).
CREATE TABLE seat_reservation (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    seat_id INTEGER REFERENCES seat(id) ON DELETE CASCADE,  -- NULL for unspecified seat
    invitation_email VARCHAR(255) NOT NULL,
    attendance_buckets BYTEA NOT NULL,  -- Array of bytes representing time buckets (1=attending, 0=not attending)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Foreign key to ensure invitation exists
    CONSTRAINT fk_invitation FOREIGN KEY (event_id, invitation_email)
        REFERENCES invitation(event_id, email) ON DELETE CASCADE
);

-- Index for finding reservations by event
CREATE INDEX idx_seat_reservation_event_id ON seat_reservation(event_id);

-- Index for finding reservations by seat (for conflict detection)
CREATE INDEX idx_seat_reservation_seat_id ON seat_reservation(seat_id) WHERE seat_id IS NOT NULL;

-- Index for finding reservations by email
CREATE INDEX idx_seat_reservation_email ON seat_reservation(event_id, invitation_email);

-- Unique constraint: one reservation per email per event
-- A user can only have one seat reservation for an event (but can change it)
CREATE UNIQUE INDEX idx_seat_reservation_unique_email_event ON seat_reservation(event_id, invitation_email);
