use crate::{
    auth::User,
    controllers::{game_schedule, Error},
};
use chrono::{DateTime, Utc};
use rocket::{
    get,
    serde::{json::Json, Deserialize, Serialize},
    State,
};
use rocket_okapi::okapi::schemars;
use rocket_okapi::okapi::schemars::JsonSchema;
use rocket_okapi::openapi;
use sqlx::postgres::PgPool;

use super::SchemaExample;

/// A scheduled game entry in the calendar
#[derive(Clone, Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
#[schemars(example = "Self::example")]
pub struct GameScheduleEntry {
    /// The schedule entry ID.
    pub id: i32,

    /// The event ID this game is scheduled for.
    pub event_id: i32,

    /// The Steam game ID (appid).
    pub game_id: i64,

    /// The game name.
    pub game_name: String,

    /// When the game is scheduled to start.
    pub start_time: DateTime<Utc>,

    /// How long the game is scheduled for (in minutes).
    pub duration_minutes: i32,

    /// Whether this is a pinned (manually scheduled) game.
    pub is_pinned: bool,

    /// Whether this is a suggested (algorithmically scheduled) game.
    /// Slice 3 will populate this for suggested games.
    pub is_suggested: bool,

    /// The date this schedule entry was created.
    pub created_at: DateTime<Utc>,

    /// The last time this schedule entry was modified.
    pub last_modified: DateTime<Utc>,
}

impl SchemaExample for GameScheduleEntry {
    fn example() -> Self {
        Self {
            id: 1,
            event_id: 1,
            game_id: 730,
            game_name: "Counter-Strike 2".to_string(),
            start_time: Utc::now(),
            duration_minutes: 120,
            is_pinned: true,
            is_suggested: false,
            created_at: Utc::now(),
            last_modified: Utc::now(),
        }
    }
}

/// Request body for creating/updating a scheduled game
#[derive(Deserialize, Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
#[schemars(example = "Self::example")]
pub struct GameScheduleRequest {
    pub game_id: i64,
    pub start_time: DateTime<Utc>,
    pub duration_minutes: i32,
}

impl SchemaExample for GameScheduleRequest {
    fn example() -> Self {
        Self {
            game_id: 730,
            start_time: Utc::now(),
            duration_minutes: 120,
        }
    }
}

custom_errors!(GameScheduleGetError, Unauthorized, InternalServerError);

/// Get all scheduled games for an event
/// Slice 1: Returns only pinned (manually scheduled) games
/// Slice 3: Will also return suggested games from the algorithm
#[openapi(tag = "Game Schedule")]
#[get("/events/<event_id>/game_schedule", format = "json")]
pub async fn get_all(
    event_id: i32,
    pool: &State<PgPool>,
    user: User,
) -> Result<Json<Vec<GameScheduleEntry>>, GameScheduleGetError> {
    match game_schedule::get_all(pool, event_id, &user.email).await {
        Ok(schedule) => Ok(Json(schedule)),
        Err(Error::NotPermitted(e)) => Err(GameScheduleGetError::Unauthorized(e)),
        Err(e) => Err(GameScheduleGetError::InternalServerError(format!(
            "Error getting game schedule, due to: {e}"
        ))),
    }
}
