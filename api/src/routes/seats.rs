use crate::{
    auth::{AdminUser, User},
    controllers::{seat, Error},
};
use chrono::{prelude::Utc, DateTime};
use rocket::{
    delete, get, post, put,
    serde::{json::Json, Deserialize, Serialize},
    State,
};
use rocket_okapi::okapi::schemars;
use rocket_okapi::okapi::schemars::JsonSchema;
use rocket_okapi::openapi;
use sqlx::postgres::PgPool;

use super::SchemaExample;

/// The response for seat endpoints.
#[derive(Clone, Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
#[schemars(example = "Self::example")]
pub struct Seat {
    /// The seat ID.
    pub id: i32,

    /// The event ID this seat belongs to.
    pub event_id: i32,

    /// The room ID this seat belongs to.
    pub room_id: i32,

    /// The label for the seat.
    pub label: String,

    /// Optional description of the seat.
    pub description: Option<String>,

    /// X coordinate of the seat on the floorplan (0.0 to 1.0).
    pub x: f64,

    /// Y coordinate of the seat on the floorplan (0.0 to 1.0).
    pub y: f64,

    /// The date the seat was created.
    pub created_at: DateTime<Utc>,

    /// The last time this seat was modified.
    pub last_modified: DateTime<Utc>,
}

impl SchemaExample for Seat {
    fn example() -> Self {
        Self {
            id: 1,
            event_id: 1,
            room_id: 1,
            label: "A1".to_string(),
            description: Some("Front row, left corner".to_string()),
            x: 0.25,
            y: 0.5,
            created_at: Utc::now(),
            last_modified: Utc::now(),
        }
    }
}

/// The request body for creating/updating a seat.
#[derive(Deserialize, Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
#[schemars(example = "Self::example")]
pub struct SeatSubmit {
    pub room_id: i32,
    pub label: String,
    pub description: Option<String>,
    pub x: f64,
    pub y: f64,
}

impl SchemaExample for SeatSubmit {
    fn example() -> Self {
        Self {
            room_id: 1,
            label: "A1".to_string(),
            description: Some("Front row, left corner".to_string()),
            x: 0.25,
            y: 0.5,
        }
    }
}

custom_errors!(SeatGetAllError, Unauthorized, InternalServerError);
custom_errors!(
    SeatGetUserError,
    Unauthorized,
    NotFound,
    InternalServerError
);
custom_errors!(SeatGetAllUserError, Unauthorized, InternalServerError);

/// Get all seats for an event (admin only).
#[openapi(tag = "Seats")]
#[get("/events/<event_id>/seats?<_as_admin>", format = "json")]
pub async fn get_all(
    event_id: i32,
    pool: &State<PgPool>,
    _as_admin: Option<bool>,
    _user: AdminUser,
) -> Result<Json<Vec<Seat>>, SeatGetAllError> {
    match seat::get_all(pool, event_id).await {
        Ok(seats) => Ok(Json(seats)),
        Err(e) => Err(SeatGetAllError::InternalServerError(format!(
            "Error getting seats, due to: {e}"
        ))),
    }
}

/// Get the requested seat if it has been reserved by the current user.
#[openapi(tag = "Seats")]
#[get("/events/<event_id>/seats/<seat_id>", format = "json", rank = 2)]
pub async fn get_user(
    event_id: i32,
    seat_id: i32,
    pool: &State<PgPool>,
    user: User,
) -> Result<Json<Seat>, SeatGetUserError> {
    match seat::get_reserved_seat_for_user(pool, event_id, seat_id, &user.email).await {
        Ok(seat) => Ok(Json(seat)),
        Err(Error::NotPermitted(e)) => Err(SeatGetUserError::Unauthorized(e)),
        Err(Error::NotFound(e)) => Err(SeatGetUserError::NotFound(e)),
        Err(e) => Err(SeatGetUserError::InternalServerError(format!(
            "Error getting reserved seat, due to: {e}"
        ))),
    }
}

/// Get all seats for an event if the user has been invited.
///
/// Rank 2: Lower priority than the admin route (rank 1) for the same path.
/// Rocket matches routes in order of rank, so admin users will match the rank 1 route first.
#[openapi(tag = "Seats")]
#[get("/events/<event_id>/seats", format = "json", rank = 2)]
pub async fn get_all_user(
    event_id: i32,
    pool: &State<PgPool>,
    user: User,
) -> Result<Json<Vec<Seat>>, SeatGetAllUserError> {
    match seat::get_all_for_invited_user(pool, event_id, &user.email).await {
        Ok(seats) => Ok(Json(seats)),
        Err(Error::NotPermitted(e)) => Err(SeatGetAllUserError::Unauthorized(e)),
        Err(e) => Err(SeatGetAllUserError::InternalServerError(format!(
            "Error getting seats, due to: {e}"
        ))),
    }
}

custom_errors!(SeatGetError, Unauthorized, NotFound, InternalServerError);

/// Get a specific seat (admin only).
#[openapi(tag = "Seats")]
#[get("/events/<_event_id>/seats/<seat_id>?<_as_admin>", format = "json")]
pub async fn get(
    _event_id: i32,
    seat_id: i32,
    pool: &State<PgPool>,
    _as_admin: Option<bool>,
    _user: AdminUser,
) -> Result<Json<Seat>, SeatGetError> {
    match seat::get(pool, seat_id).await {
        Ok(Some(seat)) => Ok(Json(seat)),
        Ok(None) => Err(SeatGetError::NotFound("Seat not found".to_string())),
        Err(e) => Err(SeatGetError::InternalServerError(format!(
            "Error getting seat, due to: {e}"
        ))),
    }
}

custom_errors!(SeatPostError, Unauthorized, BadRequest, InternalServerError);

/// Create a new seat (admin only).
#[openapi(tag = "Seats")]
#[post(
    "/events/<event_id>/seats?<_as_admin>",
    format = "json",
    data = "<seat_submit>"
)]
pub async fn post(
    event_id: i32,
    seat_submit: Json<SeatSubmit>,
    pool: &State<PgPool>,
    _as_admin: Option<bool>,
    _user: AdminUser,
) -> Result<Json<Seat>, SeatPostError> {
    match seat::create(pool, event_id, seat_submit.into_inner()).await {
        Ok(seat) => Ok(Json(seat)),
        Err(Error::BadInput(e)) => Err(SeatPostError::BadRequest(format!(
            "Invalid request, due to {e}"
        ))),
        Err(e) => Err(SeatPostError::InternalServerError(format!(
            "Error creating seat, due to: {e}"
        ))),
    }
}

custom_errors!(
    SeatPutError,
    Unauthorized,
    BadRequest,
    NotFound,
    InternalServerError
);

/// Update an existing seat (admin only).
#[openapi(tag = "Seats")]
#[put(
    "/events/<_event_id>/seats/<seat_id>?<_as_admin>",
    format = "json",
    data = "<seat_submit>"
)]
pub async fn put(
    _event_id: i32,
    seat_id: i32,
    seat_submit: Json<SeatSubmit>,
    pool: &State<PgPool>,
    _as_admin: Option<bool>,
    _user: AdminUser,
) -> Result<Json<Seat>, SeatPutError> {
    match seat::update(pool, seat_id, seat_submit.into_inner()).await {
        Ok(seat) => Ok(Json(seat)),
        Err(Error::BadInput(e)) => Err(SeatPutError::BadRequest(format!(
            "Invalid request, due to {e}"
        ))),
        Err(e) => Err(SeatPutError::InternalServerError(format!(
            "Error updating seat, due to: {e}"
        ))),
    }
}

custom_errors!(SeatDeleteError, Unauthorized, InternalServerError);

/// Delete a seat (admin only).
#[openapi(tag = "Seats")]
#[delete("/events/<_event_id>/seats/<seat_id>?<_as_admin>")]
pub async fn delete(
    _event_id: i32,
    seat_id: i32,
    pool: &State<PgPool>,
    _as_admin: Option<bool>,
    _user: AdminUser,
) -> Result<rocket::response::status::NoContent, SeatDeleteError> {
    match seat::delete(pool, seat_id).await {
        Ok(()) => Ok(rocket::response::status::NoContent),
        Err(e) => Err(SeatDeleteError::InternalServerError(format!(
            "Error deleting seat, due to: {e}"
        ))),
    }
}
