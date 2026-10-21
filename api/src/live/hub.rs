//! Cross-instance fan-out of `live_log` rows (DESIGN.md §3.3).
//!
//! Each instance runs at most one `PgListener` on [`log::NOTIFY_CHANNEL`],
//! started lazily by the first stream subscriber so that an instance with no
//! viewers holds no extra connection. On a notification the instance reads
//! the new rows of that event **once** and pushes them to a per-event
//! `tokio::sync::broadcast` channel that every local subscriber reads. A 5s
//! poll per active event covers a dropped `LISTEN` connection.

use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc, Mutex, PoisonError,
    },
    time::Duration,
};

use sqlx::{postgres::PgListener, PgPool};
use tokio::sync::{broadcast, Mutex as AsyncMutex};

use super::log::{self, LogRow};

/// Buffered rows per event before a slow subscriber lags (and is reset).
const CHANNEL_CAPACITY: usize = 512;
/// Most rows replayed to a reconnecting client before it is told to reset.
pub const MAX_REPLAY: i64 = 500;
/// Safety-net poll interval while an event has subscribers.
const POLL_INTERVAL: Duration = Duration::from_secs(5);

struct EventChannel {
    tx: broadcast::Sender<Arc<LogRow>>,
    /// Highest seq pushed to `tx`. The async mutex also serialises pumps.
    last_seq: AsyncMutex<i64>,
    subscribers: AtomicUsize,
}

/// Fan-out hub, one per process (managed Rocket state).
pub struct LiveHub {
    pool: PgPool,
    channels: Mutex<HashMap<i32, Arc<EventChannel>>>,
    started: AtomicBool,
}

/// What a new subscriber gets: rows to replay, then the live receiver.
pub struct Subscription {
    pub event_id: i32,
    /// Rows after the requested cursor, oldest first.
    pub replay: Vec<LogRow>,
    /// True when the gap was too large to replay: refetch the snapshot.
    pub reset: bool,
    pub rx: broadcast::Receiver<Arc<LogRow>>,
    hub: Arc<LiveHub>,
}

impl Drop for Subscription {
    fn drop(&mut self) {
        self.hub.unsubscribe(self.event_id);
    }
}

impl LiveHub {
    pub fn new(pool: PgPool) -> Arc<Self> {
        Arc::new(Self {
            pool,
            channels: Mutex::new(HashMap::new()),
            started: AtomicBool::new(false),
        })
    }

    fn channels(&self) -> std::sync::MutexGuard<'_, HashMap<i32, Arc<EventChannel>>> {
        self.channels.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Events with at least one local subscriber.
    pub fn active_events(&self) -> Vec<i32> {
        self.channels()
            .iter()
            .filter(|(_, c)| c.subscribers.load(Ordering::SeqCst) > 0)
            .map(|(id, _)| *id)
            .collect()
    }

    /// Subscribe to an event's rows after `since`.
    pub async fn subscribe(
        self: &Arc<Self>,
        event_id: i32,
        since: i64,
    ) -> Result<Subscription, sqlx::Error> {
        self.ensure_started();

        let latest = log::latest_seq(&self.pool, event_id).await?;
        let channel = {
            let mut channels = self.channels();
            let channel = channels.entry(event_id).or_insert_with(|| {
                Arc::new(EventChannel {
                    tx: broadcast::channel(CHANNEL_CAPACITY).0,
                    last_seq: AsyncMutex::new(latest),
                    subscribers: AtomicUsize::new(0),
                })
            });
            let channel = Arc::clone(channel);
            // Counted under the map lock, so unsubscribe can't remove it now.
            channel.subscribers.fetch_add(1, Ordering::SeqCst);
            drop(channels);
            channel
        };
        // Subscribe before reading the replay so nothing falls in between;
        // the stream skips live rows it already replayed. The guard exists
        // before anything fallible, so an error still unsubscribes.
        let mut subscription = Subscription {
            event_id,
            replay: Vec::new(),
            reset: false,
            rx: channel.tx.subscribe(),
            hub: Arc::clone(self),
        };
        // Always read the replay: `latest` was read before subscribing, and a
        // pump may have broadcast a newer row in between.
        let replay = log::since(&self.pool, event_id, since, MAX_REPLAY + 1).await?;
        if replay.len() > usize::try_from(MAX_REPLAY).unwrap_or(500) {
            subscription.reset = true;
        } else {
            subscription.replay = replay;
        }
        Ok(subscription)
    }

    fn unsubscribe(&self, event_id: i32) {
        let mut channels = self.channels();
        let empty = channels
            .get(&event_id)
            .is_some_and(|c| c.subscribers.fetch_sub(1, Ordering::SeqCst) <= 1);
        if empty {
            channels.remove(&event_id);
        }
    }

    /// Read rows of `event_id` newer than the last pushed one and broadcast
    /// them. Cheap no-op when the event has no local subscribers.
    pub async fn pump(&self, event_id: i32) {
        let Some(channel) = self.channels().get(&event_id).cloned() else {
            return;
        };
        let mut last = channel.last_seq.lock().await;
        match log::since(&self.pool, event_id, *last, 1000).await {
            Ok(rows) => {
                for row in rows {
                    *last = (*last).max(row.seq);
                    // An error only means there are no receivers right now.
                    let _ = channel.tx.send(Arc::new(row));
                }
            }
            Err(e) => ::log::warn!("live: reading log of event {event_id} failed: {e}"),
        }
        drop(last);
    }

    fn ensure_started(self: &Arc<Self>) {
        if self.started.swap(true, Ordering::SeqCst) {
            return;
        }
        let hub = Arc::clone(self);
        tokio::spawn(async move { hub.listen_loop().await });
        let hub = Arc::clone(self);
        tokio::spawn(async move { hub.poll_loop().await });
    }

    async fn listen_loop(self: Arc<Self>) {
        loop {
            match PgListener::connect_with(&self.pool).await {
                Ok(mut listener) => {
                    if let Err(e) = listener.listen(log::NOTIFY_CHANNEL).await {
                        ::log::warn!("live: LISTEN failed: {e}");
                    } else {
                        ::log::info!("live: listening for log notifications");
                        loop {
                            match listener.recv().await {
                                Ok(notification) => {
                                    if let Some(event_id) =
                                        parse_notification(notification.payload())
                                    {
                                        self.pump(event_id).await;
                                    }
                                }
                                Err(e) => {
                                    ::log::warn!("live: listener error, reconnecting: {e}");
                                    break;
                                }
                            }
                        }
                    }
                }
                Err(e) => ::log::warn!("live: can't connect listener: {e}"),
            }
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
    }

    async fn poll_loop(self: Arc<Self>) {
        let mut interval = tokio::time::interval(POLL_INTERVAL);
        loop {
            interval.tick().await;
            for event_id in self.active_events() {
                self.pump(event_id).await;
            }
        }
    }
}

/// `"<event_id>:<seq>"` → event id.
fn parse_notification(payload: &str) -> Option<i32> {
    payload.split(':').next()?.parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_notifications() {
        assert_eq!(parse_notification("12:3456"), Some(12));
        assert_eq!(parse_notification("x:1"), None);
        assert_eq!(parse_notification(""), None);
    }
}
