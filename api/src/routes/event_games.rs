use crate::{
    auth::User,
    util::{is_attending_event, is_event_active},
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
    appid: i64,
    name: String,
    last_modified: DateTime<Utc>,
    requested_at: DateTime<Utc>,
    suggestion_last_modified: DateTime<Utc>,
    self_vote: Option<GameVote>,
    votes: Option<i64>,
}

#[openapi(tag = "Event Games")]
#[get("/events/<event_id>/games", format = "json")]
pub async fn get_all(
    event_id: i32,
    pool: &State<PgPool>,
    user: User,
) -> Result<Json<Vec<EventGameSuggestionResponse>>, rocket::response::status::BadRequest<String>> {
    // Return all games
    let games: Vec<EventGameSuggestionResponse> = match sqlx::query_as!(
        EventGameSuggestionResponse,
        r#"SELECT
            steam_game.appid AS appid,
            steam_game.name AS name,
            steam_game.last_modified AS last_modified,
            event_game.requested_at AS requested_at,
            event_game.last_modified AS suggestion_last_modified,
            self_votes.vote AS "self_vote: _",
            count(all_votes.*) AS votes
        FROM event_game
        INNER JOIN steam_game
            ON event_game.game_id = steam_game.appid
        LEFT JOIN event_game_vote AS self_votes
            ON event_game.event_id = self_votes.event_id
            AND event_game.game_id = self_votes.game_id
            AND self_votes.email = $2
        LEFT JOIN event_game_vote AS all_votes
            ON event_game.event_id = all_votes.event_id
            AND event_game.game_id = all_votes.game_id
            AND all_votes.vote = 'yes'::vote
        WHERE event_game.event_id = $1
        GROUP BY steam_game.appid, steam_game.name, steam_game.last_modified, event_game.requested_at, event_game.last_modified, self_votes.vote"#,
        event_id,
        user.email,
    )
    .fetch_all(pool.inner())
    .await
    {
        Ok(games) => games,
        Err(_) => {
            return Err(rocket::response::status::BadRequest(Some(
                "Error getting database ID".to_string(),
            )))
        }
    };

    Ok(Json(games))
}

#[derive(Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde")]
pub struct EventGameSuggestionRequest {
    appid: i64,
}

#[openapi(tag = "Event Games")]
#[post("/events/<event_id>/games", format = "json", data = "<game_request>")]
pub async fn post(
    event_id: i32,
    game_request: Json<EventGameSuggestionRequest>,
    pool: &State<PgPool>,
    user: User,
) -> Result<
    status::Created<Json<EventGameSuggestionResponse>>,
    rocket::response::status::BadRequest<String>,
> {
    match is_event_active(pool.inner(), event_id).await {
        Err(e) => return Err(rocket::response::status::BadRequest(Some(e))),
        Ok(false) => {
            return Err(rocket::response::status::BadRequest(Some(
                "You can only suggest games for active events".to_string(),
            )))
        }
        Ok(true) => (),
    }

    match is_attending_event(pool.inner(), event_id, &user).await {
        Err(e) => Err(rocket::response::status::BadRequest(Some(e))),
        Ok(false) => Err(rocket::response::status::BadRequest(Some(
            "You can only suggest games for events you have RSVP'd to".to_string(),
        ))),
        Ok(true) => {
            // Insert new game suggestion
            let event_game_suggestion: EventGameSuggestionResponse = match sqlx::query_as!(
                EventGameSuggestionResponse,
                r#"WITH event_game_suggestion_response AS (
                    INSERT INTO event_game (event_id, game_id)
                        VALUES ($1, $2)
                        RETURNING event_id, game_id, requested_at, last_modified
                ) SELECT
                    steam_game.appid AS appid,
                    steam_game.name AS name,
                    steam_game.last_modified AS last_modified,
                    event_game_suggestion_response.requested_at AS requested_at,
                    event_game_suggestion_response.last_modified AS suggestion_last_modified,
                    'novote'::vote AS "self_vote: _",
                    0::BIGINT AS votes
                FROM event_game_suggestion_response
                INNER JOIN steam_game
                    ON event_game_suggestion_response.game_id = steam_game.appid"#,
                event_id,
                game_request.appid,
            )
            .fetch_one(pool.inner())
            .await
            {
                Ok(event_game_suggestion) => event_game_suggestion,
                Err(_) => {
                    return Err(rocket::response::status::BadRequest(Some(
                        "Error getting database ID".to_string(),
                    )))
                }
            };

            Ok(status::Created::new(format!(
                "/events/{}/games/{}",
                event_id,
                &game_request.appid.to_string()
            ))
            .body(Json(event_game_suggestion)))
        }
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
    match is_event_active(pool.inner(), event_id).await {
        Err(e) => return Err(rocket::response::status::Unauthorized(Some(e))),
        Ok(false) => {
            return Err(rocket::response::status::Unauthorized(Some(
                "You can only vote for games for active events".to_string(),
            )))
        }
        Ok(true) => (),
    }

    match is_attending_event(pool.inner(), event_id, &user).await {
        Err(e) => Err(rocket::response::status::Unauthorized(Some(e))),
        Ok(false) => Err(rocket::response::status::Unauthorized(Some(
            "You can only vote for games for events you have RSVP'd to".to_string(),
        ))),
        Ok(true) => {
            // Insert new event and return it
            match sqlx::query_as!(
                EventGameSuggestionResponse,
                r#"WITH event_game_patch_response AS (
                    INSERT INTO event_game_vote (event_id, game_id, email, vote)
                        VALUES ($1, $2, $3, $4)
                        ON CONFLICT (event_id, game_id, email) DO UPDATE SET vote = $4, last_modified = NOW()
                        RETURNING event_id, game_id, email, vote, vote_date, last_modified
                ) SELECT
                    steam_game.appid AS appid,
                    steam_game.name AS name,
                    steam_game.last_modified AS last_modified,
                    event_game.requested_at AS requested_at,
                    event_game.last_modified AS suggestion_last_modified,
                    self_vote.vote AS "self_vote: _",
                    CASE
                        WHEN self_vote.vote = 'yes'::vote THEN count(all_votes.*) + 1
                        ELSE count(all_votes.*) - 1
                    END AS votes
                FROM event_game
                INNER JOIN steam_game
                    ON event_game.game_id = steam_game.appid
                LEFT JOIN event_game_patch_response AS self_vote
                    ON event_game.event_id = self_vote.event_id
                    AND event_game.game_id = self_vote.game_id
                LEFT JOIN event_game_vote AS all_votes
                    ON event_game.event_id = all_votes.event_id
                    AND event_game.game_id = all_votes.game_id
                    AND all_votes.vote = 'yes'::vote
                WHERE event_game.event_id = $1
                AND event_game.game_id = $2
                GROUP BY steam_game.appid, steam_game.name, steam_game.last_modified, event_game.requested_at, event_game.last_modified, self_vote.vote"#,
                event_id,
                game_id,
                user.email,
                game_patch.vote as _,
            )
            .fetch_one(pool.inner())
            .await
            {
                Ok(updated_game_suggestion) => Ok(Json(updated_game_suggestion)),
                Err(_) => {
                    Err(rocket::response::status::Unauthorized(Some(
                        "Error updating game vote in the database".to_string(),
                    )))
                }
            }
        }
    }
}
