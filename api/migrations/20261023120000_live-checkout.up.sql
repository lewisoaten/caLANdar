-- Stepping out: a check-in can be paused until a time (away_until, NULL is
-- here), and follows the person's RSVP: departed once it says they've left,
-- staying if they checked in again past it.
ALTER TABLE live_checkin
    ADD COLUMN away_until TIMESTAMPTZ,
    ADD COLUMN departed BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN staying BOOLEAN NOT NULL DEFAULT FALSE;
