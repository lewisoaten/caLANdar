use crate::{
    auth::{AdminUser, User},
    controllers::{room, Error},
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

/// The response for room endpoints.
#[derive(Clone, Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
#[schemars(example = "Self::example")]
pub struct Room {
    /// The room ID.
    pub id: i32,

    /// The event ID this room belongs to.
    pub event_id: i32,

    /// The name of the room.
    pub name: String,

    /// Optional description of the room.
    pub description: Option<String>,

    /// Optional image URL for the room floorplan.
    pub image: Option<String>,

    /// Sort order for displaying rooms.
    pub sort_order: i32,

    /// The date the room was created.
    pub created_at: DateTime<Utc>,

    /// The last time this room was modified.
    pub last_modified: DateTime<Utc>,
}

impl SchemaExample for Room {
    fn example() -> Self {
        Self {
            id: 1,
            event_id: 1,
            name: "Main Hall".to_string(),
            description: Some("The main gaming hall".to_string()),
            image: Some("https://example.com/floorplan.jpg".to_string()),
            sort_order: 0,
            created_at: Utc::now(),
            last_modified: Utc::now(),
        }
    }
}

/// The request body for creating/updating a room.
#[derive(Deserialize, Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
#[schemars(example = "Self::example")]
pub struct RoomSubmit {
    pub name: String,
    pub description: Option<String>,
    pub image: Option<String>,
    pub sort_order: i32,
}

impl SchemaExample for RoomSubmit {
    fn example() -> Self {
        Self {
            name: "Main Hall".to_string(),
            description: Some("The main gaming hall".to_string()),
            image: Some("https://example.com/floorplan.jpg".to_string()),
            sort_order: 0,
        }
    }
}

custom_errors!(RoomGetAllError, Unauthorized, InternalServerError);
custom_errors!(RoomGetAllUserError, Unauthorized, InternalServerError);

/// Get all rooms for an event (admin only).
#[openapi(tag = "Rooms")]
#[get("/events/<event_id>/rooms?<_as_admin>", format = "json")]
pub async fn get_all(
    event_id: i32,
    pool: &State<PgPool>,
    _as_admin: Option<bool>,
    _user: AdminUser,
) -> Result<Json<Vec<Room>>, RoomGetAllError> {
    match room::get_all(pool, event_id).await {
        Ok(rooms) => Ok(Json(rooms)),
        Err(e) => Err(RoomGetAllError::InternalServerError(format!(
            "Error getting rooms, due to: {e}"
        ))),
    }
}

/// Get all rooms for an event if the user has been invited.
///
/// Rank 2: Lower priority than the admin route (rank 1) for the same path.
/// Rocket matches routes in order of rank, so admin users will match the rank 1 route first.
#[openapi(tag = "Rooms")]
#[get("/events/<event_id>/rooms", format = "json", rank = 2)]
pub async fn get_all_user(
    event_id: i32,
    pool: &State<PgPool>,
    user: User,
) -> Result<Json<Vec<Room>>, RoomGetAllUserError> {
    let email = user.email;
    match room::get_all_for_invited_user(pool, event_id, &email).await {
        Ok(rooms) => Ok(Json(rooms)),
        Err(Error::NotPermitted(e)) => Err(RoomGetAllUserError::Unauthorized(e)),
        Err(e) => Err(RoomGetAllUserError::InternalServerError(format!(
            "Error getting rooms, due to: {e}"
        ))),
    }
}

custom_errors!(RoomGetError, Unauthorized, NotFound, InternalServerError);
custom_errors!(
    RoomGetUserError,
    Unauthorized,
    NotFound,
    InternalServerError
);

/// Get a specific room (admin only).
#[openapi(tag = "Rooms")]
#[get("/events/<_event_id>/rooms/<room_id>?<_as_admin>", format = "json")]
pub async fn get(
    _event_id: i32,
    room_id: i32,
    pool: &State<PgPool>,
    _as_admin: Option<bool>,
    _user: AdminUser,
) -> Result<Json<Room>, RoomGetError> {
    match room::get(pool, room_id).await {
        Ok(Some(room)) => Ok(Json(room)),
        Ok(None) => Err(RoomGetError::NotFound("Room not found".to_string())),
        Err(e) => Err(RoomGetError::InternalServerError(format!(
            "Error getting room, due to: {e}"
        ))),
    }
}

/// Get a room if the current user has a reserved seat inside it.
#[openapi(tag = "Rooms")]
#[get("/events/<event_id>/rooms/<room_id>", format = "json", rank = 2)]
pub async fn get_user(
    event_id: i32,
    room_id: i32,
    pool: &State<PgPool>,
    user: User,
) -> Result<Json<Room>, RoomGetUserError> {
    match room::get_reserved_room_for_user(pool, event_id, room_id, &user.email).await {
        Ok(room) => Ok(Json(room)),
        Err(Error::NotPermitted(e)) => Err(RoomGetUserError::Unauthorized(e)),
        Err(Error::NotFound(e)) => Err(RoomGetUserError::NotFound(e)),
        Err(e) => Err(RoomGetUserError::InternalServerError(format!(
            "Error getting room, due to: {e}"
        ))),
    }
}

custom_errors!(RoomPostError, Unauthorized, BadRequest, InternalServerError);

/// Create a new room (admin only).
#[openapi(tag = "Rooms")]
#[post(
    "/events/<event_id>/rooms?<_as_admin>",
    format = "json",
    data = "<room_submit>"
)]
pub async fn post(
    event_id: i32,
    room_submit: Json<RoomSubmit>,
    pool: &State<PgPool>,
    _as_admin: Option<bool>,
    _user: AdminUser,
) -> Result<Json<Room>, RoomPostError> {
    match room::create(pool, event_id, room_submit.into_inner()).await {
        Ok(room) => Ok(Json(room)),
        Err(Error::BadInput(e)) => Err(RoomPostError::BadRequest(format!(
            "Invalid request, due to {e}"
        ))),
        Err(e) => Err(RoomPostError::InternalServerError(format!(
            "Error creating room, due to: {e}"
        ))),
    }
}

custom_errors!(
    RoomPutError,
    Unauthorized,
    BadRequest,
    NotFound,
    InternalServerError
);

/// Update an existing room (admin only).
#[openapi(tag = "Rooms")]
#[put(
    "/events/<_event_id>/rooms/<room_id>?<_as_admin>",
    format = "json",
    data = "<room_submit>"
)]
pub async fn put(
    _event_id: i32,
    room_id: i32,
    room_submit: Json<RoomSubmit>,
    pool: &State<PgPool>,
    _as_admin: Option<bool>,
    _user: AdminUser,
) -> Result<Json<Room>, RoomPutError> {
    match room::update(pool, room_id, room_submit.into_inner()).await {
        Ok(room) => Ok(Json(room)),
        Err(Error::BadInput(e)) => Err(RoomPutError::BadRequest(format!(
            "Invalid request, due to {e}"
        ))),
        Err(e) => Err(RoomPutError::InternalServerError(format!(
            "Error updating room, due to: {e}"
        ))),
    }
}

custom_errors!(RoomDeleteError, Unauthorized, InternalServerError);

/// Delete a room (admin only).
#[openapi(tag = "Rooms")]
#[delete("/events/<_event_id>/rooms/<room_id>?<_as_admin>")]
pub async fn delete(
    _event_id: i32,
    room_id: i32,
    pool: &State<PgPool>,
    _as_admin: Option<bool>,
    _user: AdminUser,
) -> Result<rocket::response::status::NoContent, RoomDeleteError> {
    match room::delete(pool, room_id).await {
        Ok(()) => Ok(rocket::response::status::NoContent),
        Err(e) => Err(RoomDeleteError::InternalServerError(format!(
            "Error deleting room, due to: {e}"
        ))),
    }
}
