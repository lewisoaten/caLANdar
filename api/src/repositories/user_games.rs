use chrono::{DateTime, Utc};
use sqlx::{postgres::PgQueryResult, PgPool};

pub struct UserGame {
    pub email: String,
    pub appid: i64,
    pub name: String,
    pub playtime_forever: i32,
    pub last_modified: DateTime<Utc>,
}

pub struct Filter {
    pub appid: Option<i64>,
    pub email: Option<String>,
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

pub async fn filter(pool: &PgPool, filter: Filter) -> Result<Vec<UserGame>, sqlx::Error> {
    let appid = filter.appid.map_or((0, true), |appid| (appid, false));

    let email = filter
        .email
        .map_or((String::new(), true), |email| (email, false));

    sqlx::query_as!(
        UserGame,
        r#"
        SELECT
            email,
            appid,
            name,
            playtime_forever,
            user_game.last_modified
        FROM user_game
        JOIN steam_game USING(appid)
        WHERE (appid = $1 OR $2)
        AND (LOWER(email) = LOWER($3) OR $4)
        "#,
        appid.0,
        appid.1,
        email.0,
        email.1,
    )
    .fetch_all(pool)
    .await
}
