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
    let mut old_profile = match read(pool, email.clone()).await? {
        Some(old_profile) => old_profile,
        None => Profile {
            email: email.clone(),
            steam_id: 0,
            last_refreshed: None,
        },
    };

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
        ON CONFLICT (email)
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
