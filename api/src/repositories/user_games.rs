use chrono::{DateTime, Utc};
use sqlx::{postgres::PgQueryResult, PgPool};

pub struct UserGame {
    pub emails: Option<Vec<String>>,
    pub appid: i64,
    pub name: String,
    pub playtime_forever: Option<i64>,
    pub last_modified: Option<DateTime<Utc>>,
}

#[derive(Clone)]
pub struct Filter {
    pub appid: Option<i64>,
    pub emails: Option<Vec<String>>,
    pub count: i64,
    pub page: i64,
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
    let emails = filter.emails.map_or_else(
        || (vec![], true),
        |emails| (emails.iter().map(|s| s.to_lowercase()).collect(), false),
    );

    sqlx::query_as!(
        UserGame,
        r#"
        SELECT
            ARRAY_AGG(email) as emails,
            appid,
            name,
            SUM(playtime_forever) AS playtime_forever,
            MAX(user_game.last_modified) AS last_modified
        FROM user_game
        INNER JOIN steam_game USING(appid)
        WHERE (appid = $1 OR $2)
        AND (LOWER(email) = ANY($3) OR $4)
        GROUP BY
            appid,
            name
        ORDER BY
            COUNT(appid) DESC,
            playtime_forever DESC
        LIMIT $5
        OFFSET $6
        "#,
        appid.0,
        appid.1,
        &emails.0[..],
        emails.1,
        filter.count,
        filter.page * filter.count,
    )
    .fetch_all(pool)
    .await
}

pub async fn count(pool: &PgPool, filter: Filter) -> Result<Option<i64>, sqlx::Error> {
    let appid = filter.appid.map_or((0, true), |appid| (appid, false));
    let emails = filter.emails.map_or_else(
        || (vec![], true),
        |emails| (emails.iter().map(|s| s.to_lowercase()).collect(), false),
    );

    sqlx::query_scalar!(
        r#"
        SELECT COALESCE (
            (
                SELECT COUNT(appid) OVER () as count
                FROM user_game
                INNER JOIN steam_game USING(appid)
                WHERE (appid = $1 OR $2)
                AND (LOWER(email) = ANY($3) OR $4)
                GROUP BY
                    appid,
                    name
                LIMIT 1
            ),
            0
        );
        "#,
        appid.0,
        appid.1,
        &emails.0[..],
        emails.1,
    )
    .fetch_one(pool)
    .await
}
