use chrono::{DateTime, Utc};
use sqlx::{postgres::PgQueryResult, PgPool};

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

pub async fn create(
    pool: &PgPool,
    appid: i64,
    update_id: i32,
    name: String,
) -> Result<PgQueryResult, sqlx::Error> {
    // Insert/replace new game
    sqlx::query!(
        "INSERT INTO steam_game (appid, update_id, name, last_modified)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (appid) DO UPDATE SET update_id = $2, name = $3, last_modified = NOW()",
        appid,
        update_id,
        name,
    )
    .execute(pool)
    .await
}
