use chrono::{DateTime, Utc};
use sqlx::PgPool;

#[derive(Clone)]
pub struct Room {
    pub id: i32,
    pub event_id: i32,
    pub name: String,
    pub description: Option<String>,
    pub image: Option<String>,
    pub sort_order: i32,
    pub created_at: DateTime<Utc>,
    pub last_modified: DateTime<Utc>,
}

pub async fn get_all(pool: &PgPool, event_id: i32) -> Result<Vec<Room>, sqlx::Error> {
    sqlx::query_as!(
        Room,
        r#"
        SELECT
            id,
            event_id,
            name,
            description,
            image,
            sort_order,
            created_at,
            last_modified
        FROM room
        WHERE event_id = $1
        ORDER BY sort_order, id
        "#,
        event_id
    )
    .fetch_all(pool)
    .await
}

pub async fn get(pool: &PgPool, room_id: i32) -> Result<Option<Room>, sqlx::Error> {
    sqlx::query_as!(
        Room,
        r#"
        SELECT
            id,
            event_id,
            name,
            description,
            image,
            sort_order,
            created_at,
            last_modified
        FROM room
        WHERE id = $1
        "#,
        room_id
    )
    .fetch_optional(pool)
    .await
}

pub async fn create(
    pool: &PgPool,
    event_id: i32,
    name: String,
    description: Option<String>,
    image: Option<String>,
    sort_order: i32,
) -> Result<Room, sqlx::Error> {
    sqlx::query_as!(
        Room,
        r#"
        INSERT INTO room (
            event_id,
            name,
            description,
            image,
            sort_order
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING
            id,
            event_id,
            name,
            description,
            image,
            sort_order,
            created_at,
            last_modified
        "#,
        event_id,
        name,
        description,
        image,
        sort_order
    )
    .fetch_one(pool)
    .await
}

pub async fn update(
    pool: &PgPool,
    room_id: i32,
    name: String,
    description: Option<String>,
    image: Option<String>,
    sort_order: i32,
) -> Result<Room, sqlx::Error> {
    sqlx::query_as!(
        Room,
        r#"
        UPDATE room
        SET
            name = $2,
            description = $3,
            image = $4,
            sort_order = $5,
            last_modified = NOW()
        WHERE id = $1
        RETURNING
            id,
            event_id,
            name,
            description,
            image,
            sort_order,
            created_at,
            last_modified
        "#,
        room_id,
        name,
        description,
        image,
        sort_order
    )
    .fetch_one(pool)
    .await
}

pub async fn delete(pool: &PgPool, room_id: i32) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"
        DELETE FROM room
        WHERE id = $1
        "#,
        room_id
    )
    .execute(pool)
    .await?;
    Ok(())
}
