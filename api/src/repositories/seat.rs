use chrono::{DateTime, Utc};
use sqlx::PgPool;

#[derive(Clone)]
pub struct Seat {
    pub id: i32,
    pub event_id: i32,
    pub room_id: i32,
    pub label: String,
    pub description: Option<String>,
    pub x: f64,
    pub y: f64,
    pub created_at: DateTime<Utc>,
    pub last_modified: DateTime<Utc>,
}

pub async fn get_all_by_event(pool: &PgPool, event_id: i32) -> Result<Vec<Seat>, sqlx::Error> {
    sqlx::query_as!(
        Seat,
        r#"
        SELECT
            id,
            event_id,
            room_id,
            label,
            description,
            x,
            y,
            created_at,
            last_modified
        FROM seat
        WHERE event_id = $1
        ORDER BY room_id, label
        "#,
        event_id
    )
    .fetch_all(pool)
    .await
}

pub async fn get_all_by_room(pool: &PgPool, room_id: i32) -> Result<Vec<Seat>, sqlx::Error> {
    sqlx::query_as!(
        Seat,
        r#"
        SELECT
            id,
            event_id,
            room_id,
            label,
            description,
            x,
            y,
            created_at,
            last_modified
        FROM seat
        WHERE room_id = $1
        ORDER BY label
        "#,
        room_id
    )
    .fetch_all(pool)
    .await
}

pub async fn get(pool: &PgPool, seat_id: i32) -> Result<Option<Seat>, sqlx::Error> {
    sqlx::query_as!(
        Seat,
        r#"
        SELECT
            id,
            event_id,
            room_id,
            label,
            description,
            x,
            y,
            created_at,
            last_modified
        FROM seat
        WHERE id = $1
        "#,
        seat_id
    )
    .fetch_optional(pool)
    .await
}

pub async fn create(
    pool: &PgPool,
    event_id: i32,
    room_id: i32,
    label: String,
    description: Option<String>,
    x: f64,
    y: f64,
) -> Result<Seat, sqlx::Error> {
    sqlx::query_as!(
        Seat,
        r#"
        INSERT INTO seat (
            event_id,
            room_id,
            label,
            description,
            x,
            y
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING
            id,
            event_id,
            room_id,
            label,
            description,
            x,
            y,
            created_at,
            last_modified
        "#,
        event_id,
        room_id,
        label,
        description,
        x,
        y
    )
    .fetch_one(pool)
    .await
}

pub async fn update(
    pool: &PgPool,
    seat_id: i32,
    label: String,
    description: Option<String>,
    x: f64,
    y: f64,
) -> Result<Seat, sqlx::Error> {
    sqlx::query_as!(
        Seat,
        r#"
        UPDATE seat
        SET
            label = $2,
            description = $3,
            x = $4,
            y = $5,
            last_modified = NOW()
        WHERE id = $1
        RETURNING
            id,
            event_id,
            room_id,
            label,
            description,
            x,
            y,
            created_at,
            last_modified
        "#,
        seat_id,
        label,
        description,
        x,
        y
    )
    .fetch_one(pool)
    .await
}

pub async fn delete(pool: &PgPool, seat_id: i32) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"
        DELETE FROM seat
        WHERE id = $1
        "#,
        seat_id
    )
    .execute(pool)
    .await?;
    Ok(())
}
