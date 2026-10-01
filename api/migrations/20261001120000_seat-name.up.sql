-- Seat name: a human-readable title shown instead of the short identifier
-- (label) wherever the seat is mentioned, e.g. "Wall sofa (S)" for seat WS.
ALTER TABLE seat ADD COLUMN name TEXT;
