use crate::{
    auth::{AdminUser, User},
    controllers::{profile, Error},
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

    /// The number of games that the user owns
    pub game_count: i64,
}

impl SchemaExample for Profile {
    fn example() -> Self {
        Self {
            email: "test@test.invalid".to_string(),
            steam_id: "12345678901234567".to_string(),
            games: vec![UserGame::example()],
            game_count: 123,
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

custom_errors!(ProfileGetError, NotFound, InternalServerError);

/// Return the user's profile.
#[openapi(tag = "Profile")]
#[get("/profile?<page>&<count>", format = "json")]
pub async fn get(
    pool: &State<PgPool>,
    user: User,
    page: Option<i64>,
    count: Option<i64>,
) -> Result<Json<Profile>, ProfileGetError> {
    let page = page.unwrap_or(0);
    let count = count.unwrap_or(10);

    match profile::get(pool, user.email.clone(), count, page).await {
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

custom_errors!(ProfileUpdateError, NotFound, InternalServerError);

/// Update the user's profile.
#[openapi(tag = "Profile")]
#[put("/profile", format = "json", data = "<profile_submit>")]
pub async fn put(
    pool: &State<PgPool>,
    user: User,
    profile_submit: Json<ProfileSubmit>,
) -> Result<Json<Profile>, ProfileUpdateError> {
    match profile::edit(pool, user.email.clone(), profile_submit.into_inner(), None).await {
        Ok(updated_profile) => Ok(Json(updated_profile)),
        Err(Error::NoData(_)) => Err(ProfileUpdateError::NotFound(format!(
            "Profile for {}",
            user.email
        ))),
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
    _as_admin: Option<bool>,
    _user: AdminUser,
    email: String,
    profile_submit: Json<ProfileSubmit>,
) -> Result<Json<Profile>, AdminProfileUpdateError> {
    match profile::edit(
        pool,
        email.clone(),
        profile_submit.into_inner(),
        Some(_user.email),
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
