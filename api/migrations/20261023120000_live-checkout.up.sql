-- Stepping out: a check-in can be paused until a time, after which the
-- person counts as checked in again. NULL means present.
ALTER TABLE live_checkin ADD COLUMN away_until TIMESTAMPTZ;
