//! caLANdar Live: the during-the-event view of the schedule.
//!
//! See `docs/live-event/DESIGN.md`. The pieces:
//! - [`log`]: the append-only `live_log`, the source of every stream delta;
//! - [`hub`]: fans new rows out to the stream subscribers of this instance;
//! - [`stream`]: the SSE endpoint, authorised by a [`token`].

// Views and rows are wide data structures (flags, optional fields) and the
// engine's rule functions are long by nature; these pedantic lints add noise
// rather than catch bugs here.
#![allow(
    clippy::struct_excessive_bools,
    clippy::single_option_map,
    clippy::too_many_lines,
    clippy::missing_const_for_fn,
    clippy::derive_partial_eq_without_eq,
    // Engine rules share one `Result` shape and pass the step's context.
    clippy::unnecessary_wraps,
    clippy::too_many_arguments,
    clippy::redundant_pub_crate,
    // Commands are built once per request; boxing them buys nothing.
    clippy::large_enum_variant,
    // Rule functions take the proposal they act on.
    clippy::needless_pass_by_value
)]

pub mod engine;
pub mod hub;
pub mod log;
pub mod model;
pub mod notify;
pub mod places;
pub mod push;
pub mod store;
pub mod stream;
pub mod ticker;
pub mod token;
pub mod views;

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
