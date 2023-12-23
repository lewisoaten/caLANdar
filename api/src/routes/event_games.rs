use crate::{
    auth::User,
    controllers::{game_suggestion, Error},
};
use chrono::{prelude::Utc, DateTime};
use rocket::{
    get, patch, post,
    response::status,
    serde::{json::Json, Deserialize, Serialize},
    State,
};
use rocket_okapi::okapi::schemars;
use rocket_okapi::okapi::schemars::JsonSchema;
use rocket_okapi::openapi;
use sqlx::postgres::PgPool;

#[derive(Serialize, JsonSchema)]
#[serde(crate = "rocket::serde")]
pub struct EventGameSuggestionResponse {
    pub appid: i64,
    pub name: String,
    pub last_modified: DateTime<Utc>,
    pub requested_at: DateTime<Utc>,
    pub suggestion_last_modified: DateTime<Utc>,
    pub self_vote: Option<GameVote>,
    pub votes: Option<i64>,
}

custom_errors!(EventGameError, Unauthorized, InternalServerError);

#[openapi(tag = "Event Games")]
#[get("/events/<event_id>/games", format = "json")]
pub async fn get_all(
    event_id: i32,
    pool: &State<PgPool>,
    user: User,
) -> Result<Json<Vec<EventGameSuggestionResponse>>, EventGameError> {
    // Return all games
    match game_suggestion::get(pool, event_id, user.email).await {
        Ok(game_suggestions) => Ok(Json(game_suggestions)),
        Err(Error::NotPermitted(e)) => Err(EventGameError::Unauthorized(e)),
        Err(e) => Err(EventGameError::InternalServerError(format!(
            "Error getting event, due to: {e}"
        ))),
    }
}

custom_errors!(EventGameSuggestionError, InternalServerError);

#[derive(Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde")]
pub struct EventGameSuggestionRequest {
    pub appid: i64,
}

#[openapi(tag = "Event Games")]
#[post("/events/<event_id>/games", format = "json", data = "<game_request>")]
pub async fn post(
    event_id: i32,
    game_request: Json<EventGameSuggestionRequest>,
    pool: &State<PgPool>,
    user: User,
) -> Result<status::Created<Json<EventGameSuggestionResponse>>, EventGameSuggestionError> {
    match game_suggestion::create(pool, event_id, user.email, game_request.into_inner()).await {
        Ok(event_game_suggestion) => Ok(status::Created::new(format!(
            "/events/{}/games/{}",
            event_id, event_game_suggestion.appid
        ))
        .body(Json(event_game_suggestion))),
        Err(e) => Err(EventGameSuggestionError::InternalServerError(format!(
            "Error creating event, due to: {e}"
        ))),
    }
}

#[derive(sqlx::Type, Deserialize, Serialize, JsonSchema, PartialEq, Eq)]
#[sqlx(type_name = "vote", rename_all = "lowercase")]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub enum GameVote {
    Yes,
    NoVote,
    No, // Not used for now
}

#[derive(Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde")]
pub struct EventGameSuggestionPatch {
    vote: GameVote,
}

#[openapi(tag = "Event Games")]
#[patch(
    "/events/<event_id>/games/<game_id>",
    format = "json",
    data = "<game_patch>"
)]
pub async fn patch(
    event_id: i32,
    game_id: i64,
    game_patch: Json<EventGameSuggestionPatch>,
    pool: &State<PgPool>,
    user: User,
) -> Result<Json<EventGameSuggestionResponse>, rocket::response::status::Unauthorized<String>> {
    #[allow(clippy::option_if_let_else)]
    match game_suggestion::vote(
        pool,
        event_id,
        game_id,
        user.email,
        game_patch.into_inner().vote,
    )
    .await
    {
        Ok(updated_game_suggestion) => Ok(Json(updated_game_suggestion)),
        Err(_) => Err(rocket::response::status::Unauthorized(
            "Error updating game vote in the database".to_string(),
        )),
    }
}
