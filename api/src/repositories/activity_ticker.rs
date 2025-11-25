use chrono::{DateTime, Utc};
use rocket::serde::json::serde_json::Value as JsonValue;
use sqlx::PgPool;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct TickerEvent {
    pub id: i64,
    pub timestamp: DateTime<Utc>,
    pub user_id: Option<String>,
    pub action: String,
    pub entity_type: String,
    pub entity_id: Option<String>,
    pub metadata: Option<JsonValue>,
}

/// Get activity ticker events for a specific event
/// Only returns positive, user-facing events:
/// - RSVP updates (`rsvp.update`)
/// - Game suggestions (`game_suggestion.create`)
/// - Game votes (`game_vote.update`)
pub async fn get_ticker_events(
    pool: &PgPool,
    event_id: i32,
    limit: i64,
) -> Result<Vec<TickerEvent>, sqlx::Error> {
    let events = sqlx::query_as::<_, TickerEvent>(
        r"
        SELECT id, timestamp, user_id, action, entity_type, entity_id, metadata
        FROM audit_log
        WHERE (
            (action = 'rsvp.update' AND entity_type = 'rsvp' AND entity_id = $1)
            OR (action = 'game_suggestion.create' AND entity_type = 'game_suggestion' AND entity_id LIKE $2)
            OR (action = 'game_vote.update' AND entity_type = 'game_vote' AND entity_id LIKE $2)
        )
        ORDER BY timestamp DESC
        LIMIT $3
        "
    )
    .bind(event_id.to_string())
    .bind(format!("{event_id}-%"))
    .bind(limit)
    .fetch_all(pool)
    .await?;

    Ok(events)
}
