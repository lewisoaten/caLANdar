use chrono::{prelude::Utc, DateTime};
use rocket::{
    get, post,
    response::status::Accepted,
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
    /// The most recent refresh attempt.
    pub refresh: SteamGameCacheRefresh,
}

/// State of the most recent Steam game cache refresh. Refreshes run in the
/// background; poll the stats endpoint until `running` is false.
#[derive(Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct SteamGameCacheRefresh {
    pub running: bool,
    pub started_at: Option<DateTime<Utc>>,
    /// Games that were not in the cache before the last finished refresh.
    pub games_added: Option<i64>,
    /// Why the last refresh failed, if it did.
    pub error: Option<String>,
}

impl From<game::RefreshStatus> for SteamGameCacheRefresh {
    fn from(status: game::RefreshStatus) -> Self {
        Self {
            running: status.running,
            started_at: status.started_at,
            games_added: status.games_added,
            error: status.error,
        }
    }
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
    let stats = game::cache_stats(pool)
        .await
        .map_err(|e| SteamGameCacheStatsError::InternalServerError(e.to_string()))?;
    let refresh = game::refresh_status(pool)
        .await
        .map_err(|e| SteamGameCacheStatsError::InternalServerError(e.to_string()))?;
    Ok(Json(SteamGameCacheStats {
        games_cached: stats.games_cached,
        last_refreshed: stats.last_refreshed,
        refresh: refresh.into(),
    }))
}

custom_errors!(UpdateGameError, Unauthorized, InternalServerError);

#[openapi(tag = "Games")]
#[post("/steam-game-update-v2?<_as_admin>")]
/// Start refreshing the list of games from the Steam API (admin only).
///
/// Returns 202 at once; the refresh continues in the background and its
/// progress is reported by the stats endpoint. Starting one while another is
/// running is a no-op.
pub async fn steam_game_update_v2(
    pool: &State<PgPool>,
    steam_api_key: &State<String>,
    _as_admin: Option<bool>,
    user: AdminUser,
) -> Result<Accepted<Json<SteamGameCacheRefresh>>, UpdateGameError> {
    game::start_update(pool, steam_api_key.inner(), user.email)
        .await
        .map_err(|e| UpdateGameError::InternalServerError(e.to_string()))?;
    let status = game::refresh_status(pool)
        .await
        .map_err(|e| UpdateGameError::InternalServerError(e.to_string()))?;
    Ok(Accepted(Json(status.into())))
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

/// Where a game's Steam store header image lives.
#[derive(Serialize, JsonSchema, Debug)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct SteamGameCover {
    /// An https Steam CDN URL, or null when Steam has no header image.
    pub header_url: Option<String>,
}

custom_errors!(SteamGameCoverError, Unauthorized, BadRequest, BadGateway);

/// A Steam appid from a path segment: a positive integer.
fn parse_appid(raw: &str) -> Option<u32> {
    if raw.is_empty() || !raw.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    raw.parse::<u32>().ok().filter(|id| *id > 0)
}

fn steam_cover_error(e: Error) -> SteamGameCoverError {
    match e {
        Error::Upstream(msg) => SteamGameCoverError::BadGateway(msg),
        _ => SteamGameCoverError::BadGateway(game::COVER_STEAM_UNAVAILABLE.to_string()),
    }
}

#[openapi(tag = "Games")]
#[get("/steam-game/<appid>/cover")]
/// The Steam store header image for a game. Newer games have no image at
/// the legacy `header.jpg` path; this looks up the real one (cached).
pub async fn get_steam_game_cover(
    appid: &str,
    _user: User,
) -> Result<Json<SteamGameCover>, SteamGameCoverError> {
    let appid = parse_appid(appid).ok_or_else(|| {
        SteamGameCoverError::BadRequest("appid must be a positive integer".to_string())
    })?;
    game::steam_cover(appid)
        .await
        .map(|header_url| Json(SteamGameCover { header_url }))
        .map_err(steam_cover_error)
}

#[cfg(test)]
mod tests {
    use super::parse_appid;

    #[test]
    fn appid_must_be_a_positive_integer() {
        assert_eq!(parse_appid("3949040"), Some(3_949_040));
        assert_eq!(parse_appid("1"), Some(1));
        for bad in ["0", "", "-1", "+1", "1.5", "abc", " 1", "99999999999"] {
            assert_eq!(parse_appid(bad), None, "{bad}");
        }
    }
}
