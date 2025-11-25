use chrono::{DateTime, Utc};
use rocket::serde::json::serde_json::Value as JsonValue;
use sqlx::PgPool;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct TickerEvent {
    pub id: i64,
    pub timestamp: DateTime<Utc>,
    pub user_id: Option<String>,
    pub user_handle: Option<String>,
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
        SELECT 
            al.id, 
            al.timestamp, 
            al.user_id,
            i.handle AS user_handle,
            al.action, 
            al.entity_type, 
            al.entity_id, 
            al.metadata
        FROM audit_log al
        LEFT JOIN invitation i ON LOWER(i.email) = LOWER(al.user_id) AND i.event_id = $1
        WHERE (
            (al.action = 'rsvp.update' AND al.entity_type = 'rsvp' AND al.entity_id = $1::text)
            OR (al.action = 'game_suggestion.create' AND al.entity_type = 'game_suggestion' AND al.entity_id LIKE $2)
            OR (al.action = 'game_vote.update' AND al.entity_type = 'game_vote' AND al.entity_id LIKE $2)
        )
        ORDER BY al.timestamp DESC
        LIMIT $3
        "
    )
    .bind(event_id)
    .bind(format!("{event_id}-%"))
    .bind(limit)
    .fetch_all(pool)
    .await?;

    Ok(events)
}
