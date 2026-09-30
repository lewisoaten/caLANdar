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

/// Sort order for a single user's library.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LibrarySort {
    Playtime,
    Name,
}

/// One page of a single user's library, optionally filtered by game name.
pub async fn library(
    pool: &PgPool,
    email: &str,
    search: Option<&str>,
    sort: LibrarySort,
    count: i64,
    page: i64,
) -> Result<Vec<UserGame>, sqlx::Error> {
    let pattern = search.map(crate::util::like_pattern);
    sqlx::query_as!(
        UserGame,
        r#"
        SELECT
            ARRAY[user_game.email]::text[] AS emails,
            appid AS "appid!",
            name,
            playtime_forever::bigint AS playtime_forever,
            user_game.last_modified AS "last_modified?"
        FROM user_game
        INNER JOIN steam_game USING(appid)
        WHERE LOWER(user_game.email) = LOWER($1)
        AND ($2::text IS NULL OR name ILIKE $2)
        ORDER BY
            CASE WHEN $3 THEN LOWER(name) END ASC,
            playtime_forever DESC,
            LOWER(name) ASC
        LIMIT $4
        OFFSET $5
        "#,
        email,
        pattern,
        sort == LibrarySort::Name,
        count,
        page * count,
    )
    .fetch_all(pool)
    .await
}

pub struct LibraryStats {
    /// Games matching the search.
    pub matching: i64,
    /// Whole library size.
    pub total: i64,
    pub max_playtime_forever: i64,
    pub last_synced: Option<DateTime<Utc>>,
}

pub async fn library_stats(
    pool: &PgPool,
    email: &str,
    search: Option<&str>,
) -> Result<LibraryStats, sqlx::Error> {
    let pattern = search.map(crate::util::like_pattern);
    let row = sqlx::query!(
        r#"
        SELECT
            COUNT(*) FILTER (WHERE $2::text IS NULL OR name ILIKE $2) AS "matching!",
            COUNT(*) AS "total!",
            COALESCE(MAX(playtime_forever), 0)::bigint AS "max_playtime!",
            MAX(user_game.last_modified) AS last_synced
        FROM user_game
        INNER JOIN steam_game USING(appid)
        WHERE LOWER(user_game.email) = LOWER($1)
        "#,
        email,
        pattern,
    )
    .fetch_one(pool)
    .await?;

    Ok(LibraryStats {
        matching: row.matching,
        total: row.total,
        max_playtime_forever: row.max_playtime,
        last_synced: row.last_synced,
    })
}

/// Remove a user's synced library (used when their Steam ID changes).
pub async fn delete_for_email(pool: &PgPool, email: &str) -> Result<u64, sqlx::Error> {
    Ok(sqlx::query!(
        "DELETE FROM user_game WHERE LOWER(email) = LOWER($1)",
        email
    )
    .execute(pool)
    .await?
    .rows_affected())
}
