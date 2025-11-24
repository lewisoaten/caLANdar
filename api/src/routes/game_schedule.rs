use crate::{
    auth::{AdminUser, User},
    controllers::{game_schedule, Error},
};
use chrono::{DateTime, Utc};
use rocket::{
    delete, get, patch, post,
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
/// Returns both pinned (manually scheduled) games and suggested games from the algorithm
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

custom_errors!(
    GameScheduleCreateError,
    BadRequest,
    Unauthorized,
    InternalServerError
);

/// Create a new scheduled game (admin only)
#[openapi(tag = "Game Schedule")]
#[post(
    "/events/<event_id>/game_schedule",
    format = "json",
    data = "<request>"
)]
pub async fn create(
    event_id: i32,
    request: Json<GameScheduleRequest>,
    pool: &State<PgPool>,
    admin_user: AdminUser,
) -> Result<Json<GameScheduleEntry>, GameScheduleCreateError> {
    match game_schedule::create(pool, event_id, request.into_inner(), &admin_user.email).await {
        Ok(entry) => Ok(Json(entry)),
        Err(Error::NotPermitted(e)) => Err(GameScheduleCreateError::Unauthorized(e)),
        Err(Error::Controller(e)) if e.contains("overlap") => {
            Err(GameScheduleCreateError::BadRequest(e))
        }
        Err(e) => Err(GameScheduleCreateError::InternalServerError(format!(
            "Error creating game schedule, due to: {e}"
        ))),
    }
}

custom_errors!(
    GameScheduleUpdateError,
    BadRequest,
    Unauthorized,
    InternalServerError
);

/// Update an existing scheduled game (admin only)
#[openapi(tag = "Game Schedule")]
#[patch(
    "/events/<_event_id>/game_schedule/<schedule_id>",
    format = "json",
    data = "<request>"
)]
pub async fn update(
    _event_id: i32,
    schedule_id: i32,
    request: Json<GameScheduleRequest>,
    pool: &State<PgPool>,
    admin_user: AdminUser,
) -> Result<Json<GameScheduleEntry>, GameScheduleUpdateError> {
    match game_schedule::update(pool, schedule_id, request.into_inner(), &admin_user.email).await {
        Ok(entry) => Ok(Json(entry)),
        Err(Error::NotPermitted(e)) => Err(GameScheduleUpdateError::Unauthorized(e)),
        Err(Error::Controller(e)) if e.contains("overlap") || e.contains("not found") => {
            Err(GameScheduleUpdateError::BadRequest(e))
        }
        Err(e) => Err(GameScheduleUpdateError::InternalServerError(format!(
            "Error updating game schedule, due to: {e}"
        ))),
    }
}

custom_errors!(
    GameScheduleDeleteError,
    BadRequest,
    Unauthorized,
    InternalServerError
);

/// Delete a scheduled game (admin only)
#[openapi(tag = "Game Schedule")]
#[delete("/events/<_event_id>/game_schedule/<schedule_id>")]
pub async fn delete(
    _event_id: i32,
    schedule_id: i32,
    pool: &State<PgPool>,
    admin_user: AdminUser,
) -> Result<(), GameScheduleDeleteError> {
    match game_schedule::delete(pool, schedule_id, &admin_user.email).await {
        Ok(()) => Ok(()),
        Err(Error::NotPermitted(e)) => Err(GameScheduleDeleteError::Unauthorized(e)),
        Err(Error::Controller(e)) if e.contains("not found") => {
            Err(GameScheduleDeleteError::BadRequest(e))
        }
        Err(e) => Err(GameScheduleDeleteError::InternalServerError(format!(
            "Error deleting game schedule, due to: {e}"
        ))),
    }
}

custom_errors!(
    GameSchedulePinError,
    BadRequest,
    Unauthorized,
    InternalServerError
);

/// Pin a suggested game to the schedule (admin only)
/// Converts a suggested game into a pinned game
#[openapi(tag = "Game Schedule")]
#[post(
    "/events/<event_id>/game_schedule/pin",
    format = "json",
    data = "<request>"
)]
pub async fn pin(
    event_id: i32,
    request: Json<GameScheduleRequest>,
    pool: &State<PgPool>,
    admin_user: AdminUser,
) -> Result<Json<GameScheduleEntry>, GameSchedulePinError> {
    match game_schedule::pin(pool, event_id, request.into_inner(), &admin_user.email).await {
        Ok(entry) => Ok(Json(entry)),
        Err(Error::NotPermitted(e)) => Err(GameSchedulePinError::Unauthorized(e)),
        Err(Error::Controller(e)) if e.contains("overlap") => {
            Err(GameSchedulePinError::BadRequest(e))
        }
        Err(e) => Err(GameSchedulePinError::InternalServerError(format!(
            "Error pinning game schedule, due to: {e}"
        ))),
    }
}

custom_errors!(
    GameScheduleRecalculateError,
    Unauthorized,
    InternalServerError
);

/// Force recalculation of suggested game schedule (admin only)
#[openapi(tag = "Game Schedule")]
#[post("/events/<event_id>/game_schedule/recalculate")]
pub async fn recalculate_suggested_schedule(
    event_id: i32,
    pool: &State<PgPool>,
    _admin_user: AdminUser,
) -> Result<Json<Vec<GameScheduleEntry>>, GameScheduleRecalculateError> {
    match game_schedule::schedule_suggested_games(pool, event_id).await {
        Ok(suggested) => {
            log::info!(
                "Admin forced recalculation of {} suggested games for event {}",
                suggested.len(),
                event_id
            );
            Ok(Json(suggested))
        }
        Err(Error::NotPermitted(e)) => Err(GameScheduleRecalculateError::Unauthorized(e)),
        Err(e) => Err(GameScheduleRecalculateError::InternalServerError(format!(
            "Error recalculating suggested schedule, due to: {e}"
        ))),
    }
}
