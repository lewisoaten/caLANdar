-- caLANdar Live, phase 4: room-scale (DESIGN.md §8).

ALTER TABLE event
    -- Results, proposals and admin posts go to this Discord channel.
    ADD COLUMN discord_webhook_url TEXT,
    -- The wall-board sleeps between these local times, e.g. '03:00-09:00'.
    ADD COLUMN wallboard_sleep TEXT;

-- Web Push subscriptions (one per browser), for alerts on locked phones.
CREATE TABLE live_push_subscription (
    id BIGSERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (event_id, endpoint)
);

CREATE INDEX idx_live_push_subscription_email ON live_push_subscription(event_id, email);
