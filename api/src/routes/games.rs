use chrono::{prelude::Utc, DateTime};
use rocket::{
    get, post,
    serde::{json::Json, Deserialize, Serialize},
    State,
};
use rocket_okapi::okapi::schemars;
use rocket_okapi::okapi::schemars::JsonSchema;
use rocket_okapi::openapi;
use sqlx::postgres::PgPool;

use crate::{
    auth::{AdminUser, User},
    controllers::{game, Error},
};

/// Steam game cache statistics.
#[derive(Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct SteamGameCacheStats {
    /// Number of Steam games in the local cache.
    pub games_cached: i64,
    /// When the last successful refresh finished.
    pub last_refreshed: Option<DateTime<Utc>>,
}

/// Result of refreshing the Steam game cache.
#[derive(Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct SteamGameCacheRefresh {
    pub games_cached: i64,
    /// Games that were not in the cache before this refresh.
    pub games_added: i64,
    pub last_refreshed: Option<DateTime<Utc>>,
}

custom_errors!(SteamGameCacheStatsError, Unauthorized, InternalServerError);

#[openapi(tag = "Games")]
#[get("/steam-game-update-v2/stats?<_as_admin>", format = "json")]
/// Size of the Steam game cache and when it was last refreshed (admin only)
pub async fn steam_game_cache_stats(
    pool: &State<PgPool>,
    _as_admin: Option<bool>,
    _user: AdminUser,
) -> Result<Json<SteamGameCacheStats>, SteamGameCacheStatsError> {
    game::cache_stats(pool)
        .await
        .map(|stats| {
            Json(SteamGameCacheStats {
                games_cached: stats.games_cached,
                last_refreshed: stats.last_refreshed,
            })
        })
        .map_err(|e| SteamGameCacheStatsError::InternalServerError(e.to_string()))
}

custom_errors!(
    UpdateGameError,
    Unauthorized,
    BadGateway,
    InternalServerError
);

/// Map a controller error from `game::update`: Steam failures are 502.
/// The controller logs the detail; the message is safe to show.
fn update_game_error(e: Error) -> UpdateGameError {
    match e {
        Error::Upstream(msg) => UpdateGameError::BadGateway(msg),
        e => UpdateGameError::InternalServerError(e.to_string()),
    }
}

#[openapi(tag = "Games")]
#[post("/steam-game-update-v2?<_as_admin>")]
/// Update the list of games from the Steam API v2
pub async fn steam_game_update_v2(
    pool: &State<PgPool>,
    steam_api_key: &State<String>,
    _as_admin: Option<bool>,
    user: AdminUser,
) -> Result<Json<SteamGameCacheRefresh>, UpdateGameError> {
    match game::update(pool, steam_api_key.inner()).await {
        Ok(refresh) => {
            // Log audit entry
            crate::util::log_audit(
                pool.inner(),
                Some(user.email),
                "steam_games.update".to_string(),
                "steam_games".to_string(),
                None,
                Some(rocket::serde::json::serde_json::json!({
                    "games_cached": refresh.games_cached,
                    "games_added": refresh.games_added,
                })),
            )
            .await;

            Ok(Json(SteamGameCacheRefresh {
                games_cached: refresh.games_cached,
                games_added: refresh.games_added,
                last_refreshed: refresh.last_refreshed,
            }))
        }
        Err(e) => Err(update_game_error(e)),
    }
}

#[derive(Serialize, Deserialize, JsonSchema, Debug)]
#[serde(crate = "rocket::serde")]
pub struct SteamGameResponse {
    pub appid: i64,
    pub name: String,
    pub last_modified: DateTime<Utc>,
    pub rank: Option<f32>,
}

custom_errors!(SteamGameError, Unauthorized, BadRequest);

#[openapi(tag = "Games")]
#[get("/steam-game?<query>&<page>")]
pub async fn get_steam_game(
    query: String,
    page: Option<i64>,
    pool: &State<PgPool>,
    _user: User,
) -> Result<Json<Vec<SteamGameResponse>>, SteamGameError> {
    const COUNT: i64 = 10;

    let page = page.unwrap_or(0);

    // Return all games
    match game::get(pool, query, COUNT, page).await {
        Ok(games) => Ok(Json(games)),
        Err(Error::NotPermitted(e)) => Err(SteamGameError::Unauthorized(e)),
        Err(e) => Err(SteamGameError::BadRequest(format!(
            "Error searching steam games: {e}"
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::{update_game_error, Error, UpdateGameError};
    use crate::controllers::game::{REFRESH_SAVE_FAILED, REFRESH_STEAM_UNAVAILABLE};

    #[test]
    fn steam_failure_is_bad_gateway() {
        assert!(matches!(
            update_game_error(Error::Upstream(REFRESH_STEAM_UNAVAILABLE.to_string())),
            UpdateGameError::BadGateway(ref m) if m == REFRESH_STEAM_UNAVAILABLE
        ));
    }

    #[test]
    fn save_failure_is_internal() {
        assert!(matches!(
            update_game_error(Error::Controller(REFRESH_SAVE_FAILED.to_string())),
            UpdateGameError::InternalServerError(ref m) if m == REFRESH_SAVE_FAILED
        ));
    }
}
