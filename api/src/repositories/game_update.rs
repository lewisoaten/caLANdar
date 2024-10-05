use chrono::{DateTime, Utc};
use sqlx::PgPool;

#[derive(Clone)]
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
