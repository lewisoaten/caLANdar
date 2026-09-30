use chrono::{DateTime, Utc};
use rocket::serde::json::serde_json::Value as JsonValue;
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
    pub grid_rows: Option<i32>,
    /// JSON array of `{col, row, kind}` objects.
    pub features: JsonValue,
    pub background_style: String,
    pub background_opacity: f64,
    /// Random token of the uploaded background image, if any.
    pub background_token: Option<String>,
}

/// Room editor fields; `None` keeps the stored value (or the column default on create).
#[derive(Clone, Default)]
pub struct RoomLayoutFields {
    pub grid_rows: Option<i32>,
    pub features: Option<JsonValue>,
    pub background_style: Option<String>,
    pub background_opacity: Option<f64>,
}

pub async fn get_all(pool: &PgPool, event_id: i32) -> Result<Vec<Room>, sqlx::Error> {
    sqlx::query_as!(
        Room,
        r#"
        SELECT
            r.id,
            r.event_id,
            r.name,
            r.description,
            r.image,
            r.sort_order,
            r.created_at,
            r.last_modified,
            r.grid_rows,
            r.features,
            r.background_style,
            r.background_opacity,
            rb.token AS "background_token?"
        FROM room r
        LEFT JOIN room_background rb ON rb.room_id = r.id
        WHERE r.event_id = $1
        ORDER BY r.sort_order, r.id
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
            r.id,
            r.event_id,
            r.name,
            r.description,
            r.image,
            r.sort_order,
            r.created_at,
            r.last_modified,
            r.grid_rows,
            r.features,
            r.background_style,
            r.background_opacity,
            rb.token AS "background_token?"
        FROM room r
        LEFT JOIN room_background rb ON rb.room_id = r.id
        WHERE r.id = $1
        "#,
        room_id
    )
    .fetch_optional(pool)
    .await
}

#[allow(clippy::too_many_arguments)]
pub async fn create<'e, E: sqlx::PgExecutor<'e>>(
    executor: E,
    event_id: i32,
    name: String,
    description: Option<String>,
    image: Option<String>,
    sort_order: i32,
    layout: RoomLayoutFields,
) -> Result<i32, sqlx::Error> {
    sqlx::query_scalar!(
        r#"
        INSERT INTO room (
            event_id,
            name,
            description,
            image,
            sort_order,
            grid_rows,
            features,
            background_style,
            background_opacity
        )
        VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, '[]'::jsonb), COALESCE($8, 'retro'), COALESCE($9::float8, 0.6))
        RETURNING id
        "#,
        event_id,
        name,
        description,
        image,
        sort_order,
        layout.grid_rows,
        layout.features,
        layout.background_style,
        layout.background_opacity,
    )
    .fetch_one(executor)
    .await
}

/// Update a room. `image` is only replaced when `set_image` is true (the layout
/// editor never touches the legacy floorplan image).
#[allow(clippy::too_many_arguments)]
pub async fn update<'e, E: sqlx::PgExecutor<'e>>(
    executor: E,
    room_id: i32,
    name: String,
    description: Option<String>,
    image: Option<String>,
    set_image: bool,
    sort_order: i32,
    layout: RoomLayoutFields,
) -> Result<Option<i32>, sqlx::Error> {
    sqlx::query_scalar!(
        r#"
        UPDATE room
        SET
            name = $2,
            description = $3,
            image = CASE WHEN $5 THEN $4 ELSE image END,
            sort_order = $6,
            grid_rows = COALESCE($7, grid_rows),
            features = COALESCE($8, features),
            background_style = COALESCE($9, background_style),
            background_opacity = COALESCE($10, background_opacity),
            last_modified = NOW()
        WHERE id = $1
        RETURNING id
        "#,
        room_id,
        name,
        description,
        image,
        set_image,
        sort_order,
        layout.grid_rows,
        layout.features,
        layout.background_style,
        layout.background_opacity,
    )
    .fetch_optional(executor)
    .await
}

pub async fn delete<'e, E: sqlx::PgExecutor<'e>>(
    executor: E,
    room_id: i32,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"
        DELETE FROM room
        WHERE id = $1
        "#,
        room_id
    )
    .execute(executor)
    .await?;
    Ok(())
}

/// Store (or replace) a room's background image under a new random token.
pub async fn set_background(
    pool: &PgPool,
    room_id: i32,
    token: &str,
    content_type: &str,
    data: &[u8],
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"
        INSERT INTO room_background (room_id, token, content_type, data)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (room_id) DO UPDATE
            SET token = EXCLUDED.token,
                content_type = EXCLUDED.content_type,
                data = EXCLUDED.data,
                created_at = NOW()
        "#,
        room_id,
        token,
        content_type,
        data,
    )
    .execute(pool)
    .await?;
    sqlx::query!(
        "UPDATE room SET last_modified = NOW() WHERE id = $1",
        room_id
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn delete_background(pool: &PgPool, room_id: i32) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM room_background WHERE room_id = $1", room_id)
        .execute(pool)
        .await?;
    sqlx::query!(
        "UPDATE room SET last_modified = NOW() WHERE id = $1",
        room_id
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub struct Background {
    pub content_type: String,
    pub data: Vec<u8>,
}

pub async fn get_background_by_token(
    pool: &PgPool,
    token: &str,
) -> Result<Option<Background>, sqlx::Error> {
    sqlx::query_as!(
        Background,
        "SELECT content_type, data FROM room_background WHERE token = $1",
        token
    )
    .fetch_optional(pool)
    .await
}
