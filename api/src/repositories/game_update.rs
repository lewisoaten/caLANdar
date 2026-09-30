use chrono::{DateTime, Utc};
use sqlx::PgPool;

#[derive(Clone)]
#[allow(dead_code)]
pub struct SteamGameUpdate {
    pub id: i32,
    pub update_time: DateTime<Utc>,
}

pub async fn create(pool: &PgPool) -> Result<SteamGameUpdate, sqlx::Error> {
    // Insert new game suggestion
    sqlx::query_as!(
        SteamGameUpdate,
        "INSERT INTO steam_game_update DEFAULT VALUES RETURNING id, update_time",
    )
    .fetch_one(pool)
    .await
}

/// Mark a refresh as finished.
pub async fn complete(pool: &PgPool, id: i32) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE steam_game_update SET completed_at = NOW() WHERE id = $1",
        id
    )
    .execute(pool)
    .await?;
    Ok(())
}
