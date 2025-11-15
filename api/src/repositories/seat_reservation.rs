use chrono::{DateTime, Utc};
use sqlx::PgPool;

#[derive(Clone)]
pub struct SeatReservation {
    pub id: i32,
    pub event_id: i32,
    pub seat_id: Option<i32>,
    pub invitation_email: String,
    pub attendance_buckets: Vec<u8>,
    pub created_at: DateTime<Utc>,
    pub last_modified: DateTime<Utc>,
}

/// Get all seat reservations for an event
pub async fn get_all_by_event(
    pool: &PgPool,
    event_id: i32,
) -> Result<Vec<SeatReservation>, sqlx::Error> {
    sqlx::query_as!(
        SeatReservation,
        r#"
        SELECT
            id,
            event_id,
            seat_id,
            invitation_email,
            attendance_buckets,
            created_at,
            last_modified
        FROM seat_reservation
        WHERE event_id = $1
        ORDER BY invitation_email
        "#,
        event_id
    )
    .fetch_all(pool)
    .await
}

/// Get a specific seat reservation by ID
#[allow(dead_code)]
pub async fn get(
    pool: &PgPool,
    reservation_id: i32,
) -> Result<Option<SeatReservation>, sqlx::Error> {
    sqlx::query_as!(
        SeatReservation,
        r#"
        SELECT
            id,
            event_id,
            seat_id,
            invitation_email,
            attendance_buckets,
            created_at,
            last_modified
        FROM seat_reservation
        WHERE id = $1
        "#,
        reservation_id
    )
    .fetch_optional(pool)
    .await
}

/// Get seat reservation for a specific user's email in an event
pub async fn get_by_email(
    pool: &PgPool,
    event_id: i32,
    email: &str,
) -> Result<Option<SeatReservation>, sqlx::Error> {
    sqlx::query_as!(
        SeatReservation,
        r#"
        SELECT
            id,
            event_id,
            seat_id,
            invitation_email,
            attendance_buckets,
            created_at,
            last_modified
        FROM seat_reservation
        WHERE event_id = $1 AND LOWER(invitation_email) = LOWER($2)
        "#,
        event_id,
        email
    )
    .fetch_optional(pool)
    .await
}

/// Get all reservations for a specific seat
pub async fn get_by_seat(pool: &PgPool, seat_id: i32) -> Result<Vec<SeatReservation>, sqlx::Error> {
    sqlx::query_as!(
        SeatReservation,
        r#"
        SELECT
            id,
            event_id,
            seat_id,
            invitation_email,
            attendance_buckets,
            created_at,
            last_modified
        FROM seat_reservation
        WHERE seat_id = $1
        "#,
        seat_id
    )
    .fetch_all(pool)
    .await
}

/// Create a new seat reservation
pub async fn create(
    pool: &PgPool,
    event_id: i32,
    seat_id: Option<i32>,
    invitation_email: String,
    attendance_buckets: Vec<u8>,
) -> Result<SeatReservation, sqlx::Error> {
    sqlx::query_as!(
        SeatReservation,
        r#"
        INSERT INTO seat_reservation (
            event_id,
            seat_id,
            invitation_email,
            attendance_buckets
        )
        VALUES ($1, $2, $3, $4)
        RETURNING
            id,
            event_id,
            seat_id,
            invitation_email,
            attendance_buckets,
            created_at,
            last_modified
        "#,
        event_id,
        seat_id,
        invitation_email,
        &attendance_buckets
    )
    .fetch_one(pool)
    .await
}

/// Update an existing seat reservation
pub async fn update(
    pool: &PgPool,
    reservation_id: i32,
    seat_id: Option<i32>,
    attendance_buckets: Vec<u8>,
) -> Result<SeatReservation, sqlx::Error> {
    sqlx::query_as!(
        SeatReservation,
        r#"
        UPDATE seat_reservation
        SET
            seat_id = $2,
            attendance_buckets = $3,
            last_modified = NOW()
        WHERE id = $1
        RETURNING
            id,
            event_id,
            seat_id,
            invitation_email,
            attendance_buckets,
            created_at,
            last_modified
        "#,
        reservation_id,
        seat_id,
        &attendance_buckets
    )
    .fetch_one(pool)
    .await
}

/// Delete a seat reservation
#[allow(dead_code)]
pub async fn delete(pool: &PgPool, reservation_id: i32) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"
        DELETE FROM seat_reservation
        WHERE id = $1
        "#,
        reservation_id
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// Delete a seat reservation by email and event
pub async fn delete_by_email(pool: &PgPool, event_id: i32, email: &str) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"
        DELETE FROM seat_reservation
        WHERE event_id = $1 AND LOWER(invitation_email) = LOWER($2)
        "#,
        event_id,
        email
    )
    .execute(pool)
    .await?;
    Ok(())
}
