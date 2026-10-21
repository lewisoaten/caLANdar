//! The stream instance's background loop (DESIGN.md §3.6, §3.7).
//!
//! While an instance has stream subscribers for an event, it ticks the
//! event every 2 seconds and (claimed through `live_runtime`, so instances
//! share) polls Steam every 30 seconds and checks the plan every minute.
//! CPU is only allocated while a stream request is open, which is exactly
//! when this has anything to do. With nobody watching, Cloud Scheduler's
//! call to `/api/internal/live/tick` does the same once a minute.

use std::{sync::Arc, time::Duration};

use sqlx::PgPool;

use super::hub::LiveHub;

const TICK: Duration = Duration::from_secs(2);

/// Start the loop (once per process).
pub fn spawn(hub: Arc<LiveHub>, pool: PgPool, steam_api_key: String) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(TICK);
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            interval.tick().await;
            for event_id in hub.active_events() {
                crate::controllers::live::background(&pool, &steam_api_key, event_id).await;
            }
        }
    });
}
