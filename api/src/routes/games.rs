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

custom_errors!(UpdateGameError, Unauthorized, InternalServerError);

#[openapi(tag = "Games")]
#[post("/steam-game-update-v2?<_as_admin>")]
/// Update the list of games from the Steam API v2
pub async fn steam_game_update_v2(
    pool: &State<PgPool>,
    steam_api_key: &State<String>,
    _as_admin: Option<bool>,
    _user: AdminUser,
) -> Result<Json<()>, UpdateGameError> {
    match game::update(pool, steam_api_key.inner()).await {
        Ok(_) => Ok(Json(())),
        Err(e) => Err(UpdateGameError::InternalServerError(format!(
            "Error updating games, due to: {e}"
        ))),
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
