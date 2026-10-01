use chrono::{DateTime, Utc};
use sqlx::{postgres::PgQueryResult, PgPool};
use std::collections::HashMap;

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
    /// Optional case-insensitive substring of the game name (wildcards escaped).
    pub search: Option<String>,
}

/// Upsert a whole library in one statement, rather than one round trip per
/// game, so large libraries sync well inside the request timeout.
pub async fn create_many(
    pool: &PgPool,
    email: &str,
    games: &[(i64, i32)],
) -> Result<PgQueryResult, sqlx::Error> {
    // A repeated appid would make the upsert touch the same row twice.
    let mut unique: std::collections::BTreeMap<i64, i32> = std::collections::BTreeMap::new();
    for (appid, playtime) in games {
        unique.insert(*appid, *playtime);
    }
    let appids: Vec<i64> = unique.keys().copied().collect();
    let playtimes: Vec<i32> = unique.values().copied().collect();

    sqlx::query(
        r"
        INSERT INTO user_game (email, appid, playtime_forever, last_modified)
        SELECT $1, appid, playtime_forever, NOW()
        FROM UNNEST($2::bigint[], $3::int[]) AS g(appid, playtime_forever)
        ON CONFLICT (LOWER(email), appid) DO UPDATE
            SET playtime_forever = EXCLUDED.playtime_forever, last_modified = NOW()
        ",
    )
    .bind(email)
    .bind(&appids)
    .bind(&playtimes)
    .execute(pool)
    .await
}

pub async fn filter(pool: &PgPool, filter: Filter) -> Result<Vec<UserGame>, sqlx::Error> {
    let appid = filter.appid.map_or((0, true), |appid| (appid, false));
    let emails = filter.emails.map_or_else(
        || (vec![], true),
        |emails| (emails.iter().map(|s| s.to_lowercase()).collect(), false),
    );
    let pattern = filter.search.as_deref().map(crate::util::like_pattern);

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
        AND ($7::text IS NULL OR name ILIKE $7)
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
        pattern,
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
    let pattern = filter.search.as_deref().map(crate::util::like_pattern);

    sqlx::query_scalar!(
        r#"
        SELECT COALESCE (
            (
                SELECT COUNT(appid) OVER () as count
                FROM user_game
                INNER JOIN steam_game USING(appid)
                WHERE (appid = $1 OR $2)
                AND (LOWER(email) = ANY($3) OR $4)
                AND ($5::text IS NULL OR name ILIKE $5)
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
        pattern,
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

/// How many of `emails` own each of `appids`, in one grouped query.
/// Apps nobody owns are absent from the map.
pub async fn owner_counts(
    pool: &PgPool,
    appids: &[i64],
    emails: &[String],
) -> Result<HashMap<i64, usize>, sqlx::Error> {
    if appids.is_empty() || emails.is_empty() {
        return Ok(HashMap::new());
    }
    let emails: Vec<String> = emails.iter().map(|e| e.to_lowercase()).collect();

    let rows = sqlx::query!(
        r#"
        SELECT appid, COUNT(*) AS "owners!"
        FROM user_game
        WHERE appid = ANY($1)
        AND LOWER(email) = ANY($2)
        GROUP BY appid
        "#,
        appids,
        &emails,
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| (r.appid, usize::try_from(r.owners).unwrap_or(0)))
        .collect())
}
