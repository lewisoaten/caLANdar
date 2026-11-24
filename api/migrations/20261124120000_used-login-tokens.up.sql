-- Sign-in links are meant to be single use. A token is a signed, self-contained
-- string, so "used" has to be remembered somewhere: one row per spent link,
-- keyed by the SHA-256 of the token (the token itself is never stored).
-- Links last 30 minutes, so rows older than a day can be deleted safely.
CREATE TABLE used_login_tokens (
    token_hash TEXT PRIMARY KEY,
    used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_used_login_tokens_used_at ON used_login_tokens (used_at);
