use chrono::{DateTime, Utc};
use sqlx::{postgres::PgQueryResult, PgPool};

pub struct UserGame {
    pub email: String,
    pub appid: i64,
    pub name: String,
    pub playtime_forever: i32,
    pub last_modified: DateTime<Utc>,
}

pub async fn create(
    pool: &PgPool,
    email: String,
    appid: i64,
    playtime_forever: i32,
) -> Result<PgQueryResult, sqlx::Error> {
    sqlx::query!(
        r#"
        INSERT INTO user_game (email, appid, playtime_forever, last_modified)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (LOWER(email), appid) DO UPDATE SET playtime_forever = $3, last_modified = NOW()
        "#,
        email,
        appid,
        playtime_forever,
    )
    .execute(pool)
    .await
}

pub async fn read(pool: &PgPool, email: String) -> Result<Vec<UserGame>, sqlx::Error> {
    sqlx::query_as!(
        UserGame,
        r#"
        SELECT email, appid, name, playtime_forever, user_game.last_modified FROM user_game JOIN steam_game USING(appid) WHERE LOWER(email) = LOWER($1)
        "#,
        email,
    )
    .fetch_all(pool)
    .await
}
