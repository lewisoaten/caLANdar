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
    pub grid_col: Option<i32>,
    pub grid_row: Option<i32>,
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
            last_modified,
            grid_col,
            grid_row
        FROM seat
        WHERE event_id = $1
        ORDER BY room_id, label
        "#,
        event_id
    )
    .fetch_all(pool)
    .await
}

#[allow(dead_code)]
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
            last_modified,
            grid_col,
            grid_row
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
            last_modified,
            grid_col,
            grid_row
        FROM seat
        WHERE id = $1
        "#,
        seat_id
    )
    .fetch_optional(pool)
    .await
}

#[allow(clippy::too_many_arguments)]
pub async fn create<'e, E: sqlx::PgExecutor<'e>>(
    executor: E,
    event_id: i32,
    room_id: i32,
    label: String,
    description: Option<String>,
    x: f64,
    y: f64,
    grid: (Option<i32>, Option<i32>),
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
            y,
            grid_col,
            grid_row
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING
            id,
            event_id,
            room_id,
            label,
            description,
            x,
            y,
            created_at,
            last_modified,
            grid_col,
            grid_row
        "#,
        event_id,
        room_id,
        label,
        description,
        x,
        y,
        grid.0,
        grid.1
    )
    .fetch_one(executor)
    .await
}

/// Update a seat; `None` grid coordinates keep the stored values.
pub async fn update<'e, E: sqlx::PgExecutor<'e>>(
    executor: E,
    seat_id: i32,
    label: String,
    description: Option<String>,
    x: f64,
    y: f64,
    grid: (Option<i32>, Option<i32>),
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
            grid_col = COALESCE($6, grid_col),
            grid_row = COALESCE($7, grid_row),
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
            last_modified,
            grid_col,
            grid_row
        "#,
        seat_id,
        label,
        description,
        x,
        y,
        grid.0,
        grid.1
    )
    .fetch_one(executor)
    .await
}

pub async fn delete<'e, E: sqlx::PgExecutor<'e>>(
    executor: E,
    seat_id: i32,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"
        DELETE FROM seat
        WHERE id = $1
        "#,
        seat_id
    )
    .execute(executor)
    .await?;
    Ok(())
}

/// A reservation on a specific seat, with the reserver's details.
pub struct SeatReserver {
    pub seat_id: i32,
    pub room_id: i32,
    pub label: String,
    pub email: String,
    pub handle: Option<String>,
    pub avatar_url: String,
}

/// Reservations on specific seats of an event, with the reserver's handle and avatar.
pub async fn reservers_by_event<'e, E: sqlx::PgExecutor<'e>>(
    executor: E,
    event_id: i32,
) -> Result<Vec<SeatReserver>, sqlx::Error> {
    sqlx::query_as!(
        SeatReserver,
        r#"
        SELECT
            s.id AS seat_id,
            s.room_id,
            s.label,
            sr.invitation_email AS email,
            i.handle AS "handle?",
            'https://www.gravatar.com/avatar/' || MD5(LOWER(sr.invitation_email)) || '?d=robohash' AS "avatar_url!"
        FROM seat_reservation sr
        INNER JOIN seat s ON s.id = sr.seat_id
        LEFT JOIN invitation i ON i.event_id = sr.event_id AND i.email = sr.invitation_email
        WHERE sr.event_id = $1
        ORDER BY s.room_id, s.label
        "#,
        event_id
    )
    .fetch_all(executor)
    .await
}

/// Move reservations off the given seats (the attendee keeps their RSVP and
/// attendance but has to pick another seat).
pub async fn release_reservations<'e, E: sqlx::PgExecutor<'e>>(
    executor: E,
    seat_ids: &[i32],
) -> Result<u64, sqlx::Error> {
    Ok(sqlx::query!(
        "UPDATE seat_reservation SET seat_id = NULL, last_modified = NOW() WHERE seat_id = ANY($1)",
        seat_ids
    )
    .execute(executor)
    .await?
    .rows_affected())
}
