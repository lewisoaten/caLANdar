//! The append-only `live_log` (DESIGN.md §3.2).
//!
//! Every live write appends rows here inside its own transaction and then
//! `pg_notify`s channel [`NOTIFY_CHANNEL`] with `"<event_id>:<seq>"`. The
//! stream instances read the new rows once per notification and fan them out
//! to their subscribers (see [`super::hub`]).

use chrono::{DateTime, Utc};
use rocket::serde::{json::serde_json::Value as JsonValue, Serialize};
use sqlx::{PgConnection, PgPool};

/// Postgres `LISTEN`/`NOTIFY` channel for new log rows.
pub const NOTIFY_CHANNEL: &str = "live";

/// One `live_log` row.
#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct LogRow {
    pub seq: i64,
    pub event_id: i32,
    pub at: DateTime<Utc>,
    pub actor: Option<String>,
    pub kind: String,
    pub tier: Option<i16>,
    pub audience: Option<String>,
    pub payload: JsonValue,
}

/// Who may see a row.
#[derive(Debug, Clone, PartialEq, Eq)]
#[allow(dead_code)] // People and admins get rows once the engine lands.
pub enum Audience {
    Everyone,
    /// One person, by normalised email.
    Person(String),
    Admins,
}

impl Audience {
    fn column(&self) -> Option<String> {
        match self {
            Self::Everyone => None,
            Self::Person(email) => Some(format!("email:{email}")),
            Self::Admins => Some("admin".to_string()),
        }
    }
}

/// A row to append.
#[derive(Debug, Clone)]
pub struct NewLogRow {
    pub actor: Option<String>,
    pub kind: String,
    pub tier: Option<i16>,
    pub audience: Audience,
    pub payload: JsonValue,
}

impl NewLogRow {
    pub fn new(kind: impl Into<String>, payload: impl Serialize) -> Self {
        Self {
            actor: None,
            kind: kind.into(),
            tier: None,
            audience: Audience::Everyone,
            payload: rocket::serde::json::serde_json::to_value(payload).unwrap_or(JsonValue::Null),
        }
    }

    #[must_use]
    pub fn actor(mut self, actor: impl Into<String>) -> Self {
        self.actor = Some(actor.into());
        self
    }

    #[must_use]
    #[allow(dead_code)]
    pub const fn tier(mut self, tier: i16) -> Self {
        self.tier = Some(tier);
        self
    }

    #[must_use]
    pub fn audience(mut self, audience: Audience) -> Self {
        self.audience = audience;
        self
    }
}

/// Who is reading the stream, for audience filtering.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Viewer {
    /// A signed-in gamer (normalised email) and whether they are an admin.
    Gamer { email: String, admin: bool },
    /// The read-only wall-board: public rows only.
    Wallboard,
}

impl Viewer {
    /// Whether this viewer may see a row with the given `audience` column.
    pub fn can_see(&self, audience: Option<&str>) -> bool {
        match (self, audience) {
            (_, None) => true,
            (Self::Wallboard, Some(_)) => false,
            (Self::Gamer { admin, .. }, Some("admin")) => *admin,
            (Self::Gamer { email, .. }, Some(other)) => other
                .strip_prefix("email:")
                .is_some_and(|target| target == email),
        }
    }

    pub fn email(&self) -> Option<&str> {
        match self {
            Self::Gamer { email, .. } => Some(email),
            Self::Wallboard => None,
        }
    }

    pub const fn is_admin(&self) -> bool {
        matches!(self, Self::Gamer { admin: true, .. })
    }
}

/// Append rows inside the caller's transaction and queue the notification
/// (Postgres delivers it on commit). Returns the appended rows.
pub async fn append(
    conn: &mut PgConnection,
    event_id: i32,
    rows: Vec<NewLogRow>,
) -> Result<Vec<LogRow>, sqlx::Error> {
    let mut appended = Vec::with_capacity(rows.len());
    for row in rows {
        let inserted = sqlx::query_as::<_, LogRow>(
            r"
            INSERT INTO live_log (event_id, actor, kind, tier, audience, payload)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING seq, event_id, at, actor, kind, tier, audience, payload
            ",
        )
        .bind(event_id)
        .bind(&row.actor)
        .bind(&row.kind)
        .bind(row.tier)
        .bind(row.audience.column())
        .bind(&row.payload)
        .fetch_one(&mut *conn)
        .await?;
        appended.push(inserted);
    }
    if let Some(last) = appended.last() {
        sqlx::query("SELECT pg_notify($1, $2)")
            .bind(NOTIFY_CHANNEL)
            .bind(format!("{event_id}:{}", last.seq))
            .execute(&mut *conn)
            .await?;
    }
    Ok(appended)
}

/// Rows of an event after `since`, oldest first, at most `limit`.
pub async fn since(
    pool: &PgPool,
    event_id: i32,
    since: i64,
    limit: i64,
) -> Result<Vec<LogRow>, sqlx::Error> {
    sqlx::query_as::<_, LogRow>(
        r"
        SELECT seq, event_id, at, actor, kind, tier, audience, payload
        FROM live_log
        WHERE event_id = $1 AND seq > $2
        ORDER BY seq
        LIMIT $3
        ",
    )
    .bind(event_id)
    .bind(since)
    .bind(limit)
    .fetch_all(pool)
    .await
}

/// The latest sequence number of an event's log (0 if it has none).
pub async fn latest_seq<'e, E: sqlx::PgExecutor<'e>>(
    executor: E,
    event_id: i32,
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar::<_, Option<i64>>("SELECT MAX(seq) FROM live_log WHERE event_id = $1")
        .bind(event_id)
        .fetch_one(executor)
        .await
        .map(Option::unwrap_or_default)
}

/// The most recent `limit` feed (tiered) rows, oldest first, with deleted
/// entries (those named by a later `feed.delete` row) left out.
pub async fn feed<'e, E: sqlx::PgExecutor<'e>>(
    executor: E,
    event_id: i32,
    limit: i64,
) -> Result<Vec<LogRow>, sqlx::Error> {
    sqlx::query_as::<_, LogRow>(
        r"
        SELECT * FROM (
            SELECT l.seq, l.event_id, l.at, l.actor, l.kind, l.tier, l.audience, l.payload
            FROM live_log l
            WHERE l.event_id = $1
            AND (l.tier IS NOT NULL OR l.kind = 'toast.admin')
            AND NOT EXISTS (
                SELECT 1 FROM live_log d
                WHERE d.event_id = l.event_id
                AND d.kind = 'feed.delete'
                AND d.payload->>'key' = l.payload->>'key'
                AND d.seq > l.seq
            )
            ORDER BY l.seq DESC
            LIMIT $2
        ) recent
        ORDER BY seq
        ",
    )
    .bind(event_id)
    .bind(limit)
    .fetch_all(executor)
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn audience_filtering() {
        let gamer = Viewer::Gamer {
            email: "a@example.com".to_string(),
            admin: false,
        };
        let admin = Viewer::Gamer {
            email: "b@example.com".to_string(),
            admin: true,
        };
        let wall = Viewer::Wallboard;

        assert!(gamer.can_see(None));
        assert!(wall.can_see(None));
        assert!(gamer.can_see(Some("email:a@example.com")));
        assert!(!gamer.can_see(Some("email:b@example.com")));
        assert!(!gamer.can_see(Some("admin")));
        assert!(admin.can_see(Some("admin")));
        assert!(!admin.can_see(Some("email:a@example.com")));
        assert!(!wall.can_see(Some("admin")));
        assert!(!wall.can_see(Some("email:a@example.com")));
    }

    #[test]
    fn audience_column() {
        assert_eq!(Audience::Everyone.column(), None);
        assert_eq!(
            Audience::Person("a@example.com".into()).column(),
            Some("email:a@example.com".to_string())
        );
        assert_eq!(Audience::Admins.column(), Some("admin".to_string()));
    }
}
