use sqlx::PgPool;

pub struct UserGame {
    pub email: String,
    pub appid: i64,
    pub playtime_forever: i32,
}

pub async fn create(pool: &PgPool, user_game: &UserGame) -> Result<UserGame, sqlx::Error> {
    sqlx::query_as!(
        UserGame,
        r#"
        INSERT INTO user_games (email, appid, playtime_forever)
        VALUES ($1, $2, $3)
        ON CONFLICT (email, appid) DO UPDATE SET playtime_forever = $3
        RETURNING *
        "#,
        user_game.email,
        user_game.appid,
        user_game.playtime_forever,
    )
    .fetch_one(pool)
    .await
}

pub async fn read(pool: &PgPool, email: String) -> Result<Vec<UserGame>, sqlx::Error> {
    sqlx::query_as!(
        UserGame,
        r#"
        SELECT email, appid, playtime_forever FROM user_games WHERE email = $1
        "#,
        email,
    )
    .fetch_all(pool)
    .await
}
