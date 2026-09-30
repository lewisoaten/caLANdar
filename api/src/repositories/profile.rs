use chrono::{DateTime, Utc};
use sqlx::PgPool;

pub struct Profile {
    pub email: String,
    pub steam_id: i64,
    pub last_refreshed: Option<DateTime<Utc>>,
}

pub async fn read(pool: &PgPool, email: String) -> Result<Option<Profile>, sqlx::Error> {
    sqlx::query_as!(
        Profile,
        r#"
        SELECT * FROM profiles WHERE LOWER(email) = LOWER($1)
        "#,
        email,
    )
    .fetch_optional(pool)
    .await
}

pub async fn update(
    pool: &PgPool,
    email: String,
    steam_id: Option<i64>,
    last_refreshed: Option<DateTime<Utc>>,
) -> Result<Profile, sqlx::Error> {
    let mut old_profile = (read(pool, email.clone()).await?).unwrap_or_else(|| Profile {
        email: email.clone(),
        steam_id: 0,
        last_refreshed: None,
    });

    if let Some(new_steam_id) = steam_id {
        old_profile.steam_id = new_steam_id;
    }

    if let Some(new_last_refreshed) = last_refreshed {
        old_profile.last_refreshed = Some(new_last_refreshed);
    }

    sqlx::query_as!(
        Profile,
        r#"
        INSERT INTO profiles (
            email,
            steam_id,
            last_refreshed
        )
        VALUES (
            $1,
            $2,
            $3
        )
        ON CONFLICT (LOWER(email))
        DO UPDATE SET
            steam_id = $2,
            last_refreshed = $3
        RETURNING *
        "#,
        email,
        old_profile.steam_id,
        old_profile.last_refreshed,
    )
    .fetch_one(pool)
    .await
}

pub struct Callsign {
    pub handle: String,
    pub event_count: i64,
    pub last_event_id: i32,
    pub last_event_title: String,
    pub last_used: DateTime<Utc>,
}

/// Distinct callsigns (invitation handles) a user has used across events.
pub async fn callsigns(pool: &PgPool, email: &str) -> Result<Vec<Callsign>, sqlx::Error> {
    sqlx::query_as!(
        Callsign,
        r#"
        SELECT DISTINCT ON (i.handle)
            i.handle AS "handle!",
            COUNT(*) OVER (PARTITION BY i.handle) AS "event_count!",
            e.id AS last_event_id,
            e.title AS last_event_title,
            e.time_begin AS last_used
        FROM invitation i
        INNER JOIN event e ON e.id = i.event_id
        WHERE LOWER(i.email) = LOWER($1)
        AND i.handle IS NOT NULL AND TRIM(i.handle) <> ''
        ORDER BY i.handle, e.time_begin DESC
        "#,
        email,
    )
    .fetch_all(pool)
    .await
}
