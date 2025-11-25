use crate::{
    auth::User,
    controllers::{game_suggestion, Error},
};
use chrono::{prelude::Utc, DateTime};
use rocket::{
    get, patch, post, put,
    response::status,
    serde::{json::Json, Deserialize, Serialize},
    State,
};
use rocket_okapi::okapi::schemars;
use rocket_okapi::okapi::schemars::JsonSchema;
use rocket_okapi::openapi;
use sqlx::postgres::PgPool;

#[derive(Serialize, JsonSchema, Clone)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct Gamer {
    pub avatar_url: Option<String>,
    pub handle: Option<String>,
}

#[derive(Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct EventGameResponse {
    pub appid: i64,
    pub name: String,
    pub gamer_owned: Vec<Gamer>,
    pub playtime_forever: i32,
    pub last_modified: DateTime<Utc>,
}

#[derive(Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct EventGames {
    pub event_games: Vec<EventGameResponse>,
    pub total_count: i64,
}

custom_errors!(EventGameError, Unauthorized, InternalServerError);

#[openapi(tag = "Event Games")]
#[get("/events/<event_id>/games?<page>&<count>", format = "json")]
pub async fn get_all(
    event_id: i32,
    pool: &State<PgPool>,
    page: Option<i64>,
    count: Option<i64>,
) -> Result<Json<EventGames>, EventGameError> {
    let page = page.unwrap_or(0);
    let count = count.unwrap_or(10);

    // Return all games
    match game_suggestion::get_all_event_games(pool, event_id, count, page).await {
        Ok(game_suggestions) => Ok(Json(game_suggestions)),
        Err(Error::NotPermitted(e)) => Err(EventGameError::Unauthorized(e)),
        Err(e) => Err(EventGameError::InternalServerError(format!(
            "Error getting event, due to: {e}"
        ))),
    }
}

#[derive(Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct EventGameSuggestionResponse {
    pub appid: i64,
    pub name: String,
    pub user_email: String,
    pub comment: Option<String>,
    pub last_modified: DateTime<Utc>,
    pub requested_at: DateTime<Utc>,
    pub suggestion_last_modified: DateTime<Utc>,
    pub self_vote: Option<GameVote>,
    pub votes: Option<i64>,
    pub voters: Vec<Gamer>,
    pub suggester: Option<Gamer>,
    pub gamer_owned: Vec<Gamer>,
    pub gamer_unowned: Vec<Gamer>,
    pub gamer_unknown: Vec<Gamer>,
}

custom_errors!(EventGameSuggestedError, Unauthorized, InternalServerError);

#[openapi(tag = "Event Games")]
#[get("/events/<event_id>/suggested_games", format = "json")]
pub async fn get_all_suggested(
    event_id: i32,
    pool: &State<PgPool>,
    user: User,
) -> Result<Json<Vec<EventGameSuggestionResponse>>, EventGameSuggestedError> {
    // Return all games
    match game_suggestion::get(pool, event_id, user.email).await {
        Ok(game_suggestions) => Ok(Json(game_suggestions)),
        Err(Error::NotPermitted(e)) => Err(EventGameSuggestedError::Unauthorized(e)),
        Err(e) => Err(EventGameSuggestedError::InternalServerError(format!(
            "Error getting event, due to: {e}"
        ))),
    }
}

custom_errors!(EventGameSuggestionError, InternalServerError);

#[derive(Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde")]
pub struct EventGameSuggestionRequest {
    pub appid: i64,
    pub comment: Option<String>,
}

#[openapi(tag = "Event Games")]
#[post(
    "/events/<event_id>/suggested_games",
    format = "json",
    data = "<game_request>"
)]
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

#[derive(Debug, Clone, sqlx::Type, Deserialize, Serialize, JsonSchema, PartialEq, Eq)]
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
    "/events/<event_id>/suggested_games/<game_id>",
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

custom_errors!(
    EventGameCommentUpdateError,
    Unauthorized,
    InternalServerError
);

#[derive(Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde")]
pub struct EventGameCommentUpdate {
    pub comment: Option<String>,
}

#[openapi(tag = "Event Games")]
#[put(
    "/events/<event_id>/suggested_games/<game_id>/comment",
    format = "json",
    data = "<comment_update>"
)]
pub async fn update_comment(
    event_id: i32,
    game_id: i64,
    comment_update: Json<EventGameCommentUpdate>,
    pool: &State<PgPool>,
    user: User,
) -> Result<Json<EventGameSuggestionResponse>, EventGameCommentUpdateError> {
    match game_suggestion::update_comment(
        pool,
        event_id,
        game_id,
        user.email,
        comment_update.into_inner().comment,
    )
    .await
    {
        Ok(updated_game_suggestion) => Ok(Json(updated_game_suggestion)),
        Err(Error::NotPermitted(e)) => Err(EventGameCommentUpdateError::Unauthorized(e)),
        Err(e) => Err(EventGameCommentUpdateError::InternalServerError(format!(
            "Error updating comment: {e}"
        ))),
    }
}
