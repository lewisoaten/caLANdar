use crate::{auth::AdminUser, controllers::gamer};
use chrono::{prelude::Utc, DateTime};
use rocket::{
    get,
    serde::{json::Json, Serialize},
    State,
};
use rocket_okapi::okapi::schemars;
use rocket_okapi::okapi::schemars::JsonSchema;
use rocket_okapi::openapi;
use sqlx::postgres::PgPool;

use super::{events::Event, SchemaExample};

/// A user of the system
#[derive(Clone, Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
#[schemars(example = "Self::example")]
pub struct Gamer {
    pub email: String,
    pub avatar_url: String,
    pub handles: Vec<String>,
    pub events_invited: Vec<Event>,
    pub events_accepted: Vec<Event>,
    pub events_tentative: Vec<Event>,
    pub events_declined: Vec<Event>,
    pub events_last_response: Option<DateTime<Utc>>,
    pub games_owned_count: u16,
    pub games_owned_last_modified: Option<DateTime<Utc>>,
}

impl SchemaExample for Gamer {
    fn example() -> Self {
        Self {
            email: "test@gamer.example".to_string(),
            avatar_url: "https://www.gravatar.com/avatar/27205e5c51cb03f862138b22bcb5dc20f94a342e744ff6df1b8dc8af3c865109?d=robohash".to_string(),
            handles: vec!["test_gamer".to_string(), "test_gamer2".to_string()],
            events_invited: vec![Event::example()],
            events_accepted: vec![Event::example()],
            events_tentative: vec![Event::example()],
            events_declined: vec![Event::example()],
            events_last_response: Some(Utc::now()),
            games_owned_count: 12345,
            games_owned_last_modified: Some(Utc::now()),
        }
    }
}

custom_errors!(GamersGetError, NotFound, InternalServerError);

/// Get all users across all events as an administrator
/// Will return an empty list if no users are found.
#[openapi(tag = "Gamers")]
#[get("/gamers?<_as_admin>", format = "json")]
pub async fn get_all(
    pool: &State<PgPool>,
    _as_admin: Option<bool>,
    _user: AdminUser,
) -> Result<Json<Vec<Gamer>>, GamersGetError> {
    match gamer::get_all(pool).await {
        Ok(gamers) => Ok(Json(gamers)),
        Err(e) => Err(GamersGetError::InternalServerError(format!(
            "Error getting events, due to: {e}"
        ))),
    }
}
