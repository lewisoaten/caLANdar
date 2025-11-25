use chrono::{DateTime, Utc};
use sqlx::PgPool;

#[derive(Clone, Debug)]
pub struct GamerSummary {
    pub email: String,
    pub avatar_url: String,
    pub handles: Vec<String>,
    pub steam_id: Option<String>,
    pub events_invited_count: i64,
    pub events_accepted_count: i64,
    pub events_tentative_count: i64,
    pub events_declined_count: i64,
    pub events_last_response: Option<DateTime<Utc>>,
    pub games_owned_count: i64,
    pub games_owned_last_modified: Option<DateTime<Utc>>,
}

pub struct PaginationParams {
    pub page: i64,
    pub limit: i64,
    pub search: Option<String>,
}

pub struct PaginatedGamers {
    pub gamers: Vec<GamerSummary>,
    pub total: i64,
    pub page: i64,
    pub limit: i64,
    pub total_pages: i64,
}

pub async fn index_paginated(
    pool: &PgPool,
    params: PaginationParams,
) -> Result<PaginatedGamers, sqlx::Error> {
    let offset = (params.page - 1) * params.limit;
    
    // Build search pattern
    let search_pattern = params.search.as_ref().map(|s| format!("%{}%", s.to_lowercase()));
    let has_search = search_pattern.is_some();
    let search_pattern = search_pattern.unwrap_or_default();

    // Get total count of gamers matching search
    let total: i64 = sqlx::query_scalar!(
        r#"
        SELECT COUNT(DISTINCT LOWER(i.email)) as "count!"
        FROM invitation i
        WHERE ($1::text IS NULL OR $2 = false OR 
               LOWER(i.email) LIKE $1 OR 
               LOWER(i.handle) LIKE $1)
        "#,
        if has_search { Some(search_pattern.as_str()) } else { None },
        has_search
    )
    .fetch_one(pool)
    .await?;

    // Optimized query to get gamer summaries with aggregated data
    let gamers = sqlx::query!(
        r#"
        WITH gamer_base AS (
            SELECT 
                LOWER(i.email) as email,
                'https://www.gravatar.com/avatar/' || MD5(LOWER(i.email)) || '?d=robohash' as avatar_url,
                ARRAY_AGG(DISTINCT i.handle) FILTER (WHERE i.handle IS NOT NULL) as handles,
                MAX(i.responded_at) as events_last_response
            FROM invitation i
            WHERE ($1::text IS NULL OR $2 = false OR 
                   LOWER(i.email) LIKE $1 OR 
                   LOWER(i.handle) LIKE $1)
            GROUP BY LOWER(i.email)
            ORDER BY LOWER(i.email)
            LIMIT $3 OFFSET $4
        ),
        gamer_events AS (
            SELECT 
                LOWER(i.email) as email,
                COUNT(*) FILTER (WHERE i.response IS NULL) as events_invited_count,
                COUNT(*) FILTER (WHERE i.response = 'yes') as events_accepted_count,
                COUNT(*) FILTER (WHERE i.response = 'maybe') as events_tentative_count,
                COUNT(*) FILTER (WHERE i.response = 'no') as events_declined_count
            FROM invitation i
            WHERE LOWER(i.email) IN (SELECT email FROM gamer_base)
            GROUP BY LOWER(i.email)
        ),
        gamer_games AS (
            SELECT 
                LOWER(ug.email) as email,
                COUNT(*) as games_owned_count,
                MAX(ug.last_modified) as games_owned_last_modified
            FROM user_game ug
            WHERE LOWER(ug.email) IN (SELECT email FROM gamer_base)
            GROUP BY LOWER(ug.email)
        ),
        gamer_profiles AS (
            SELECT 
                LOWER(p.email) as email,
                p.steam_id
            FROM profiles p
            WHERE LOWER(p.email) IN (SELECT email FROM gamer_base)
        )
        SELECT 
            gb.email,
            gb.avatar_url,
            gb.handles,
            gp.steam_id as "steam_id?",
            COALESCE(ge.events_invited_count, 0) as "events_invited_count!",
            COALESCE(ge.events_accepted_count, 0) as "events_accepted_count!",
            COALESCE(ge.events_tentative_count, 0) as "events_tentative_count!",
            COALESCE(ge.events_declined_count, 0) as "events_declined_count!",
            gb.events_last_response,
            COALESCE(gg.games_owned_count, 0) as "games_owned_count!",
            gg.games_owned_last_modified
        FROM gamer_base gb
        LEFT JOIN gamer_events ge ON gb.email = ge.email
        LEFT JOIN gamer_games gg ON gb.email = gg.email
        LEFT JOIN gamer_profiles gp ON gb.email = gp.email
        ORDER BY gb.email
        "#,
        if has_search { Some(search_pattern.as_str()) } else { None },
        has_search,
        params.limit,
        offset
    )
    .fetch_all(pool)
    .await?;

    let gamer_summaries: Vec<GamerSummary> = gamers
        .into_iter()
        .map(|row| GamerSummary {
            email: row.email.unwrap_or_default(),
            avatar_url: row.avatar_url.unwrap_or_default(),
            handles: row.handles.unwrap_or_default(),
            steam_id: row.steam_id.map(|id| id.to_string()),
            events_invited_count: row.events_invited_count,
            events_accepted_count: row.events_accepted_count,
            events_tentative_count: row.events_tentative_count,
            events_declined_count: row.events_declined_count,
            events_last_response: row.events_last_response,
            games_owned_count: row.games_owned_count,
            games_owned_last_modified: row.games_owned_last_modified,
        })
        .collect();

    let total_pages = if total > 0 {
        (total + params.limit - 1) / params.limit
    } else {
        0
    };

    Ok(PaginatedGamers {
        gamers: gamer_summaries,
        total,
        page: params.page,
        limit: params.limit,
        total_pages,
    })
}
