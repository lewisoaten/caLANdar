use chrono::{DateTime, Utc};
use sqlx::PgPool;

#[derive(Clone)]
pub struct Game {
    pub appid: i64,
    pub name: String,
    pub last_modified: DateTime<Utc>,
    pub rank: Option<f32>,
}

pub struct Filter {
    pub query: String,
    pub count: i64,
    pub page: i64,
}

pub async fn filter(pool: &PgPool, filter: Filter) -> Result<Vec<Game>, sqlx::Error> {
    sqlx::query_as!(
        Game,
        r#"
        SELECT appid, name, last_modified, ts_rank_cd(to_tsvector('english', name), query, 32 /* rank/(rank+1) */) AS rank
        FROM steam_game, plainto_tsquery('english', $1) query
        WHERE query @@ to_tsvector('english', name)
        ORDER BY lower(name) LIKE lower($1) DESC, rank DESC
        LIMIT $2
        OFFSET $3
        "#,
        filter.query,
        filter.count,
        filter.page * filter.count,
    )
    .fetch_all(pool)
    .await
}

/// Upsert a batch of Steam games in one round trip.
/// Returns the number of games that were not in the cache before.
pub async fn upsert_many(
    pool: &PgPool,
    update_id: i32,
    appids: &[i64],
    names: &[String],
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(
        r#"
        WITH upserted AS (
            INSERT INTO steam_game (appid, update_id, name, last_modified)
            SELECT appid, $1, name, NOW()
            FROM UNNEST($2::bigint[], $3::text[]) AS input(appid, name)
            ON CONFLICT (appid) DO UPDATE SET update_id = $1, name = EXCLUDED.name, last_modified = NOW()
            RETURNING (xmax = 0) AS inserted
        )
        SELECT COUNT(*) FILTER (WHERE inserted) AS "added!" FROM upserted
        "#,
        update_id,
        appids,
        names,
    )
    .fetch_one(pool)
    .await
}

pub struct CacheStats {
    pub games_cached: i64,
    pub last_refreshed: Option<DateTime<Utc>>,
}

/// Size of the Steam game cache and when it was last refreshed.
pub async fn cache_stats(pool: &PgPool) -> Result<CacheStats, sqlx::Error> {
    let row = sqlx::query!(
        r#"
        SELECT
            (SELECT COUNT(*) FROM steam_game) AS "games_cached!",
            (SELECT MAX(completed_at) FROM steam_game_update) AS last_refreshed
        "#
    )
    .fetch_one(pool)
    .await?;

    Ok(CacheStats {
        games_cached: row.games_cached,
        last_refreshed: row.last_refreshed,
    })
}
