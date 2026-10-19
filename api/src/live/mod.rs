//! caLANdar Live: the during-the-event view of the schedule.
//!
//! See `docs/live-event/DESIGN.md`. The pieces:
//! - [`log`]: the append-only `live_log`, the source of every stream delta;
//! - [`hub`]: fans new rows out to the stream subscribers of this instance;
//! - [`stream`]: the SSE endpoint, authorised by a [`token`].

pub mod hub;
pub mod log;
pub mod stream;
pub mod token;

/// Deployment settings for Live.
#[derive(Clone, Debug, Default)]
pub struct LiveConfig {
    /// Absolute origin of the service that serves streams (the dedicated
    /// `calandar-live` Cloud Run service), e.g. `https://calandar-live-...`.
    /// Empty means "same origin as the API" (local development).
    pub stream_origin: String,
}

impl LiveConfig {
    pub fn from_env() -> Self {
        Self {
            stream_origin: std::env::var("LIVE_STREAM_ORIGIN")
                .unwrap_or_default()
                .trim_end_matches('/')
                .to_string(),
        }
    }

    /// The stream URL for an event, absolute when a stream origin is set.
    pub fn stream_url(&self, event_id: i32) -> String {
        format!("{}/api/events/{event_id}/live/stream", self.stream_origin)
    }
}
