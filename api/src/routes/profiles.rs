use crate::{
    auth::User,
    controllers::{profile, Error},
};

use rocket::{
    get, put,
    serde::{json::Json, Deserialize, Serialize},
    State,
};
use rocket_okapi::okapi::schemars;
use rocket_okapi::okapi::schemars::JsonSchema;
use rocket_okapi::openapi;
use sqlx::postgres::PgPool;

use super::SchemaExample;

/// The profile response.
#[derive(Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
#[schemars(example = "Self::example")]
pub struct Profile {
    /// The email address of the user.
    pub email: String,

    /// The Steam ID of the user.
    pub steam_id: String,
}

impl SchemaExample for Profile {
    fn example() -> Self {
        Self {
            email: "test@test.invalid".to_string(),
            steam_id: "12345678901234567".to_string(),
        }
    }
}

#[derive(Serialize, Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
#[schemars(example = "Self::example")]
pub struct ProfileSubmit {
    /// The Steam ID of the user.
    pub steam_id: String,
}

impl SchemaExample for ProfileSubmit {
    fn example() -> Self {
        Self {
            steam_id: "12345678901234567".to_string(),
        }
    }
}

custom_errors!(ProfileGetError, NotFound, InternalServerError);

/// Return the user's profile.
#[openapi(tag = "Profile")]
#[get("/profile", format = "json")]
pub async fn get(pool: &State<PgPool>, user: User) -> Result<Json<Profile>, ProfileGetError> {
    match profile::get(pool, user.email.clone()).await {
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
    match profile::edit(pool, user.email.clone(), profile_submit.into_inner()).await {
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
