use std::fmt::Display;

use sqlx::PgPool;

use crate::{
    controllers::Error,
    repositories::{game, game_update, steam_api},
    routes::games::SteamGameResponse,
};

// Implement From for SteamGameResponse from Game
impl From<crate::repositories::game::Game> for SteamGameResponse {
    fn from(game: crate::repositories::game::Game) -> Self {
        Self {
            appid: game.appid,
            name: game.name,
            last_modified: game.last_modified,
            rank: game.rank,
        }
    }
}

pub async fn get(
    pool: &PgPool,
    query: String,
    count: i64,
    page: i64,
) -> Result<Vec<SteamGameResponse>, Error> {
    // Build new game Filter
    let game_filter_values = game::Filter { query, count, page };
    // Return all games
    match game::filter(pool, game_filter_values).await {
        Ok(games) => Ok(games.into_iter().map(SteamGameResponse::from).collect()),
        Err(e) => Err(Error::Controller(format!(
            "Unable to get games due to: {e}"
        ))),
    }
}

/// Result of a Steam game cache refresh.
pub struct CacheRefresh {
    pub games_cached: i64,
    pub games_added: i64,
    pub last_refreshed: Option<chrono::DateTime<chrono::Utc>>,
}

/// Rows per batched upsert; keeps each statement well under Postgres' limits.
const UPSERT_BATCH_SIZE: usize = 5000;

pub async fn cache_stats(pool: &PgPool) -> Result<game::CacheStats, Error> {
    game::cache_stats(pool)
        .await
        .map_err(|e| Error::Controller(format!("Unable to get Steam game cache stats: {e}")))
}

/// Shown to admins when Steam's app list can't be fetched. The underlying
/// error (often Steam's HTML error page) is logged, never returned.
pub const REFRESH_STEAM_UNAVAILABLE: &str =
    "Couldn't fetch the game list from Steam. The cache was not changed; try again later.";
/// Shown to admins when saving the fetched list fails part-way.
pub const REFRESH_SAVE_FAILED: &str =
    "Couldn't save the Steam game list. Some games may not have been updated; try again.";

/// Log `detail` and return a controller error carrying only `message`.
fn refresh_failed(message: &str, detail: impl Display) -> Error {
    log::error!("Steam game cache refresh failed: {detail}");
    Error::Controller(message.to_string())
}

pub async fn update(pool: &PgPool, steam_api_key: &String) -> Result<CacheRefresh, Error> {
    let steam_game_update = game_update::create(pool)
        .await
        .map_err(|e| refresh_failed(REFRESH_SAVE_FAILED, format!("creating update log: {e}")))?;

    let steam_games = steam_api::get_app_list(steam_api_key)
        .await
        .map_err(|e| refresh_failed(REFRESH_STEAM_UNAVAILABLE, e))?;

    log::info!("Retrieved {} games from Steam API", steam_games.len());

    let mut games_added = 0;
    for chunk in steam_games.chunks(UPSERT_BATCH_SIZE) {
        let appids: Vec<i64> = chunk.iter().map(|g| g.appid).collect();
        let names: Vec<String> = chunk.iter().map(|g| g.name.clone()).collect();

        games_added += game::upsert_many(pool, steam_game_update.id, &appids, &names)
            .await
            .map_err(|e| refresh_failed(REFRESH_SAVE_FAILED, format!("inserting games: {e}")))?;

        log::info!("Upserted {} games.", chunk.len());
    }

    game_update::complete(pool, steam_game_update.id)
        .await
        .map_err(|e| refresh_failed(REFRESH_SAVE_FAILED, format!("completing update log: {e}")))?;

    let stats = cache_stats(pool).await?;

    Ok(CacheRefresh {
        games_cached: stats.games_cached,
        games_added,
        last_refreshed: stats.last_refreshed,
    })
}
