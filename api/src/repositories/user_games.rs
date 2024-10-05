use sqlx::{postgres::PgQueryResult, PgPool};

pub struct UserGame {
    pub email: String,
    pub appid: i64,
    pub name: Option<String>,
    pub playtime_forever: i32,
}

pub async fn create(pool: &PgPool, user_game: &UserGame) -> Result<PgQueryResult, sqlx::Error> {
    sqlx::query!(
        r#"
        INSERT INTO user_game (email, appid, playtime_forever)
        VALUES ($1, $2, $3)
        ON CONFLICT (email, appid) DO UPDATE SET playtime_forever = $3
        "#,
        user_game.email,
        user_game.appid,
        user_game.playtime_forever,
    )
    .execute(pool)
    .await
}

pub async fn read(pool: &PgPool, email: String) -> Result<Vec<UserGame>, sqlx::Error> {
    sqlx::query_as!(
        UserGame,
        r#"
        SELECT email, appid, name, playtime_forever FROM user_game JOIN steam_game USING(appid) WHERE email = $1
        "#,
        email,
    )
    .fetch_all(pool)
    .await
}
