use crate::{
    auth::{AdminUser, User},
    controllers::{profile, Error},
    repositories::user_games::LibrarySort,
};
use chrono::{DateTime, Utc};
use rocket::{
    get, post, put,
    serde::{json::Json, Deserialize, Serialize},
    State,
};
use rocket_okapi::okapi::schemars;
use rocket_okapi::okapi::schemars::JsonSchema;
use rocket_okapi::openapi;
use sqlx::postgres::PgPool;

use super::SchemaExample;

/// The profile user games.
#[derive(Clone, Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
#[schemars(example = "Self::example")]
pub struct UserGame {
    pub appid: i64,
    pub name: String,
    pub playtime_forever: i32,
    pub last_modified: DateTime<Utc>,
}

impl SchemaExample for UserGame {
    fn example() -> Self {
        Self {
            appid: 12345,
            name: "Test Game".to_string(),
            playtime_forever: 300,
            last_modified: Utc::now(),
        }
    }
}

/// The profile response.
#[derive(Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
#[schemars(example = "Self::example")]
pub struct Profile {
    /// The email address of the user.
    pub email: String,

    /// The Steam ID of the user.
    pub steam_id: String,

    /// The games the user owns.
    pub games: Vec<UserGame>,

    /// The number of pages of games (historical name; see `total_games` for the game count).
    pub game_count: i64,

    /// The number of games matching the current `search`.
    pub total_games: i64,

    /// The size of the whole library, ignoring `search`.
    pub library_games: i64,

    /// The highest playtime (minutes) across the whole library, to scale playtime bars.
    pub max_playtime_forever: i64,

    /// When the library was last synced from Steam.
    pub last_synced: Option<DateTime<Utc>>,

    /// The user's avatar (Gravatar).
    pub avatar_url: String,
}

impl SchemaExample for Profile {
    fn example() -> Self {
        Self {
            email: "test@test.invalid".to_string(),
            steam_id: "12345678901234567".to_string(),
            games: vec![UserGame::example()],
            game_count: 13,
            total_games: 123,
            library_games: 123,
            max_playtime_forever: 98_430,
            last_synced: Some(Utc::now()),
            avatar_url: "https://www.gravatar.com/avatar/example?d=robohash".to_string(),
        }
    }
}

#[derive(Serialize, Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
#[schemars(example = "Self::example")]
pub struct ProfileSubmit {
    /// The Steam ID of the user.
    pub steam_id: Option<String>,
}

impl SchemaExample for ProfileSubmit {
    fn example() -> Self {
        Self {
            steam_id: Some("12345678901234567".to_string()),
        }
    }
}

/// A callsign (event handle) the user has used.
#[derive(Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct Callsign {
    pub handle: String,
    /// Number of events this callsign was used for.
    pub event_count: i64,
    pub last_event_id: i32,
    pub last_event_title: String,
    /// Start time of the most recent event using this callsign.
    pub last_used: DateTime<Utc>,
}

/// The signed-in user.
#[derive(Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
#[schemars(example = "Self::example")]
pub struct Me {
    pub email: String,
    pub avatar_url: String,
    pub is_admin: bool,
    /// Distinct callsigns used across events, most recently used first.
    pub callsigns: Vec<Callsign>,
}

impl SchemaExample for Me {
    fn example() -> Self {
        Self {
            email: "test@test.invalid".to_string(),
            avatar_url: "https://www.gravatar.com/avatar/example?d=robohash".to_string(),
            is_admin: false,
            callsigns: vec![Callsign {
                handle: "ProGamer123".to_string(),
                event_count: 3,
                last_event_id: 1,
                last_event_title: "Autumn LAN 2026".to_string(),
                last_used: Utc::now(),
            }],
        }
    }
}

custom_errors!(MeGetError, InternalServerError);

/// Return the signed-in user's identity, avatar and callsigns.
/// Works whether or not the user has a Steam profile.
#[openapi(tag = "Profile")]
#[get("/me", format = "json")]
pub async fn get_me(pool: &State<PgPool>, user: User) -> Result<Json<Me>, MeGetError> {
    profile::me(pool, user.email)
        .await
        .map(Json)
        .map_err(|e| MeGetError::InternalServerError(format!("Error getting user, due to: {e}")))
}

custom_errors!(ProfileGetError, NotFound, BadRequest, InternalServerError);

/// Return the user's profile.
///
/// - page: 0-based page of the library (default 0)
/// - count: games per page (default 10, max 100)
/// - search: optional case-insensitive substring of the game name
/// - sort: "playtime" (default, most played first) or "name" (A-Z)
#[openapi(tag = "Profile")]
#[get("/profile?<page>&<count>&<search>&<sort>", format = "json")]
pub async fn get(
    pool: &State<PgPool>,
    user: User,
    page: Option<i64>,
    count: Option<i64>,
    search: Option<String>,
    sort: Option<String>,
) -> Result<Json<Profile>, ProfileGetError> {
    let page = page.unwrap_or(0);
    let count = count.unwrap_or(10);
    let sort = match sort.as_deref() {
        None | Some("playtime") => LibrarySort::Playtime,
        Some("name") => LibrarySort::Name,
        Some(other) => {
            return Err(ProfileGetError::BadRequest(format!(
                "Unknown sort \"{other}\", expected \"playtime\" or \"name\""
            )))
        }
    };

    match profile::get(pool, user.email.clone(), count, page, search, sort).await {
        Ok(profile) => Ok(Json(profile)),
        Err(Error::NoData(_)) => Err(ProfileGetError::NotFound(format!(
            "Profile for {}",
            user.email
        ))),
        Err(e) => Err(ProfileGetError::InternalServerError(format!(
            "Error getting profile, due to: {e}"
        ))),
    }
}

custom_errors!(
    ProfileUpdateError,
    NotFound,
    BadRequest,
    InternalServerError
);

/// Update the user's profile.
///
/// `steamId` may be a 17-digit `SteamID64` or a `steamcommunity.com/profiles/<id>` or
/// `steamcommunity.com/id/<vanity>` URL (vanity names are resolved via the Steam API).
/// Changing the Steam ID clears the previously synced library; call
/// `POST /profile/games/update` afterwards to resync.
#[openapi(tag = "Profile")]
#[put("/profile", format = "json", data = "<profile_submit>")]
pub async fn put(
    pool: &State<PgPool>,
    steam_api_key: &State<String>,
    user: User,
    profile_submit: Json<ProfileSubmit>,
) -> Result<Json<Profile>, ProfileUpdateError> {
    match profile::edit(
        pool,
        user.email.clone(),
        profile_submit.into_inner(),
        None,
        steam_api_key.inner(),
    )
    .await
    {
        Ok(updated_profile) => Ok(Json(updated_profile)),
        Err(Error::NoData(_)) => Err(ProfileUpdateError::NotFound(format!(
            "Profile for {}",
            user.email
        ))),
        Err(Error::BadInput(msg)) => Err(ProfileUpdateError::BadRequest(msg)),
        Err(e) => Err(ProfileUpdateError::InternalServerError(format!(
            "Error updating profile, due to: {e}"
        ))),
    }
}

custom_errors!(UpdateUserGameError, Unauthorized, InternalServerError);

#[openapi(tag = "Profile")]
#[post("/profile/games/update")]
pub async fn post_games_update(
    pool: &State<PgPool>,
    steam_api_key: &State<String>,
    user: User,
) -> Result<Json<Profile>, UpdateUserGameError> {
    match profile::update_user_games(pool, user.email.clone(), steam_api_key.inner()).await {
        Ok(updated_profile) => Ok(Json(updated_profile)),
        Err(e) => Err(UpdateUserGameError::InternalServerError(format!(
            "Error updating games, due to: {e}"
        ))),
    }
}

custom_errors!(
    AdminProfileUpdateError,
    NotFound,
    BadRequest,
    InternalServerError
);

/// Update a user's profile as an administrator.
#[openapi(tag = "Profile")]
#[put(
    "/profile/<email>?<_as_admin>",
    format = "json",
    data = "<profile_submit>"
)]
pub async fn put_admin(
    pool: &State<PgPool>,
    steam_api_key: &State<String>,
    _as_admin: Option<bool>,
    user: AdminUser,
    email: String,
    profile_submit: Json<ProfileSubmit>,
) -> Result<Json<Profile>, AdminProfileUpdateError> {
    match profile::edit(
        pool,
        email.clone(),
        profile_submit.into_inner(),
        Some(user.email),
        steam_api_key.inner(),
    )
    .await
    {
        Ok(updated_profile) => Ok(Json(updated_profile)),
        Err(Error::NoData(_)) => Err(AdminProfileUpdateError::NotFound(format!(
            "Profile for {email}"
        ))),
        Err(Error::BadInput(msg)) => Err(AdminProfileUpdateError::BadRequest(msg)),
        Err(e) => Err(AdminProfileUpdateError::InternalServerError(format!(
            "Error updating profile, due to: {e}"
        ))),
    }
}
