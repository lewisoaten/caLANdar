//! The SSE stream endpoint (DESIGN.md §3.4).
//!
//! `GET /api/events/<id>/live/stream?st=<token>[&since=<seq>]` streams
//! `live_log` rows as `id: seq`, `data: {seq, at, kind, tier, payload}`. It holds no
//! database connection while open: rows arrive through [`LiveHub`].

use std::{sync::Arc, time::Duration};

use chrono::Utc;
use rocket::{
    get,
    http::Status,
    request::{FromRequest, Outcome, Request},
    response::stream::{Event, EventStream},
    serde::json::serde_json::{self, json},
    Shutdown, State,
};
use rusty_paseto::prelude::*;
use tokio::sync::broadcast::error::RecvError;

use super::{hub::LiveHub, log::LogRow, token};

/// The server ends each stream after this long with `event: reconnect`, well
/// inside Cloud Run's request timeout, so instance recycles look like normal
/// reconnects.
const MAX_STREAM: Duration = Duration::from_mins(50);
/// Heartbeat interval. Each ping carries the server time for clock offsets.
const PING: Duration = Duration::from_secs(15);

/// The `Last-Event-ID` header `EventSource` sends when it reconnects.
pub struct LastEventId(pub Option<i64>);

#[rocket::async_trait]
impl<'r> FromRequest<'r> for LastEventId {
    type Error = ();

    async fn from_request(request: &'r Request<'_>) -> Outcome<Self, Self::Error> {
        Outcome::Success(Self(
            request
                .headers()
                .get_one("Last-Event-ID")
                .and_then(|v| v.trim().parse().ok()),
        ))
    }
}

/// Rows go out as plain `message` events (the kind is in the data), so the
/// client needs one listener however many kinds there are. Only the control
/// events (`ping`, `reset`, `reconnect`) are named.
fn to_event(row: &LogRow) -> Event {
    Event::data(serde_json::to_string(&row_json(row)).unwrap_or_default()).id(row.seq.to_string())
}

/// The JSON shape of a row on the wire (also used by the snapshot's feed).
/// `actor` stays server-side: it can hold an email, and the wall-board and
/// other gamers must not see addresses.
pub fn row_json(row: &LogRow) -> serde_json::Value {
    json!({
        "seq": row.seq,
        "at": row.at,
        "kind": row.kind,
        "tier": row.tier,
        "payload": row.payload,
    })
}

fn ping() -> Event {
    Event::data(json!({ "serverTime": Utc::now() }).to_string()).event("ping")
}

/// Stream an event's live log.
#[get("/events/<event_id>/live/stream?<st>&<since>")]
pub async fn stream(
    event_id: i32,
    st: &str,
    since: Option<i64>,
    last_event_id: LastEventId,
    hub: &State<Arc<LiveHub>>,
    key: &State<PasetoSymmetricKey<V4, Local>>,
    mut shutdown: Shutdown,
) -> Result<EventStream![Event + 'static], Status> {
    let viewer = token::verify(key, st, event_id).map_err(|e| {
        ::log::info!("live: stream refused: {e}");
        Status::Unauthorized
    })?;
    // EventSource sends Last-Event-ID on its own reconnects; `since` is the
    // snapshot's cursor on the first connect.
    let cursor = last_event_id.0.or(since).unwrap_or(0);
    let mut subscription = hub.subscribe(event_id, cursor).await.map_err(|e| {
        ::log::error!("live: can't subscribe to event {event_id}: {e}");
        Status::ServiceUnavailable
    })?;

    Ok(EventStream! {
        // Tell EventSource to retry quickly after a dropped connection.
        yield Event::retry(Duration::from_secs(2));
        yield ping();

        if subscription.reset {
            yield Event::data("{}").event("reset");
            return;
        }

        let mut sent = cursor;
        for row in std::mem::take(&mut subscription.replay) {
            sent = sent.max(row.seq);
            if viewer.can_see(row.audience.as_deref()) {
                yield to_event(&row);
            }
        }

        let deadline = tokio::time::sleep(MAX_STREAM);
        tokio::pin!(deadline);
        let mut heartbeat = tokio::time::interval(PING);
        heartbeat.tick().await;

        loop {
            tokio::select! {
                received = subscription.rx.recv() => match received {
                    Ok(row) => {
                        if row.seq <= sent {
                            continue;
                        }
                        sent = row.seq;
                        if viewer.can_see(row.audience.as_deref()) {
                            yield to_event(&row);
                        }
                    }
                    Err(RecvError::Lagged(_)) => {
                        yield Event::data("{}").event("reset");
                        break;
                    }
                    Err(RecvError::Closed) => {
                        yield Event::data("{}").event("reconnect");
                        break;
                    }
                },
                _ = heartbeat.tick() => yield ping(),
                () = &mut deadline => {
                    yield Event::data("{}").event("reconnect");
                    break;
                }
                () = &mut shutdown => {
                    yield Event::data("{}").event("reconnect");
                    break;
                }
            }
        }
    }
    .heartbeat(None))
}
