use chrono::{DateTime, Utc};
use sqlx::PgPool;

#[derive(Clone)]
pub struct EventSeatingConfig {
    pub event_id: i32,
    pub has_seating: bool,
    pub allow_unspecified_seat: bool,
    pub unspecified_seat_label: String,
    pub created_at: DateTime<Utc>,
    pub last_modified: DateTime<Utc>,
}

pub async fn get(pool: &PgPool, event_id: i32) -> Result<Option<EventSeatingConfig>, sqlx::Error> {
    sqlx::query_as!(
        EventSeatingConfig,
        r#"
        SELECT
            event_id,
            has_seating,
            allow_unspecified_seat,
            unspecified_seat_label,
            created_at,
            last_modified
        FROM event_seating_config
        WHERE event_id = $1
        "#,
        event_id
    )
    .fetch_optional(pool)
    .await
}

pub async fn upsert(
    pool: &PgPool,
    event_id: i32,
    has_seating: bool,
    allow_unspecified_seat: bool,
    unspecified_seat_label: String,
) -> Result<EventSeatingConfig, sqlx::Error> {
    sqlx::query_as!(
        EventSeatingConfig,
        r#"
        INSERT INTO event_seating_config (
            event_id,
            has_seating,
            allow_unspecified_seat,
            unspecified_seat_label
        )
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (event_id)
        DO UPDATE SET
            has_seating = $2,
            allow_unspecified_seat = $3,
            unspecified_seat_label = $4,
            last_modified = NOW()
        RETURNING
            event_id,
            has_seating,
            allow_unspecified_seat,
            unspecified_seat_label,
            created_at,
            last_modified
        "#,
        event_id,
        has_seating,
        allow_unspecified_seat,
        unspecified_seat_label
    )
    .fetch_one(pool)
    .await
}
