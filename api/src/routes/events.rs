use crate::{
    auth::{AdminUser, User},
    controllers::{event, Error},
};
use chrono::{prelude::Utc, DateTime};
use rocket::{
    delete, get, post,
    response::status,
    serde::{json::Json, Deserialize, Serialize},
    State,
};
use rocket_okapi::okapi::schemars;
use rocket_okapi::okapi::schemars::JsonSchema;
use rocket_okapi::openapi;
use sqlx::postgres::PgPool;

use super::SchemaExample;

/// The response for the `GET /events` endpoint.
#[derive(Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
#[schemars(example = "Self::example")]
pub struct Event {
    /// An integer ID of the event, unique within the database.
    pub id: i32,

    /// The date the event was inserted into the database.
    pub created_at: DateTime<Utc>,

    /// The last time this event was modified.
    /// Note that this doesn't account for when any other database entries are modified related to this event such as invitations or game suggestions.
    pub last_modified: DateTime<Utc>,

    /// The title of the event.
    pub title: String,

    /// The description of the event.
    pub description: String,

    /// The time the event begins.
    pub time_begin: DateTime<Utc>,

    /// The time the event ends.
    pub time_end: DateTime<Utc>,
}

// Implement From for EventsGetResponse from Event
impl From<crate::repositories::event::Event> for Event {
    fn from(event: crate::repositories::event::Event) -> Self {
        Self {
            id: event.id,
            created_at: event.created_at,
            last_modified: event.last_modified,
            title: event.title,
            description: event.description,
            time_begin: event.time_begin,
            time_end: event.time_end,
        }
    }
}

impl SchemaExample for Event {
    fn example() -> Self {
        Self {
            id: 1,
            created_at: Utc::now(),
            last_modified: Utc::now(),
            title: "Example Event".to_string(),
            description: "This is an example event.".to_string(),
            time_begin: Utc::now(),
            time_end: Utc::now(),
        }
    }
}

/// The request body for creating an event.
#[derive(Deserialize, Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
#[schemars(example = "Self::example")]
pub struct EventCreate {
    pub title: String,
    pub description: String,
    pub time_begin: DateTime<Utc>,
    pub time_end: DateTime<Utc>,
}

impl SchemaExample for EventCreate {
    fn example() -> Self {
        Self {
            title: "Example Event".to_string(),
            description: "This is an example event.".to_string(),
            time_begin: Utc::now(),
            time_end: Utc::now(),
        }
    }
}

custom_errors!(EventsGetError, Unauthorized, InternalServerError);

/// Get all events as an administrator, even those which the user is not invited to.
/// Will return an empty list if no events are found.
#[openapi(tag = "Events")]
#[get("/events", format = "json")]
pub async fn get_all(
    pool: &State<PgPool>,
    _user: AdminUser,
) -> Result<Json<Vec<Event>>, EventsGetError> {
    match event::get_all(pool).await {
        Ok(events) => Ok(Json(events)),
        Err(e) => Err(EventsGetError::InternalServerError(format!(
            "Error getting events, due to: {}",
            e
        ))),
    }
}

/// Return all events the user is invited to.
/// Will return an empty list if no events are found.
#[openapi(tag = "Events")]
#[get("/events", format = "json", rank = 2)]
pub async fn get_all_user(
    pool: &State<PgPool>,
    user: User,
) -> Result<Json<Vec<Event>>, EventsGetError> {
    match event::get_all_user(pool, user.email).await {
        Ok(events) => Ok(Json(events)),
        Err(e) => Err(EventsGetError::InternalServerError(format!(
            "Error getting events, due to: {}",
            e
        ))),
    }
}

custom_errors!(EventGetError, Unauthorized, NotFound, InternalServerError);

/// Return requested event.
#[openapi(tag = "Events")]
#[get("/events/<id>", format = "json")]
pub async fn get(
    id: i32,
    pool: &State<PgPool>,
    _user: AdminUser,
) -> Result<Json<Event>, EventGetError> {
    match event::get(pool, id).await {
        Ok(event) => Ok(Json(event)),
        Err(Error::NoDataError(_)) => Err(EventGetError::NotFound(format!(
            "Event with ID {} not found",
            id
        ))),
        Err(e) => Err(EventGetError::InternalServerError(format!(
            "Error getting event, due to: {}",
            e
        ))),
    }
}

/// Return requested event if the user is invited to it.
#[openapi(tag = "Events")]
#[get("/events/<id>", format = "json", rank = 2)]
pub async fn get_user(
    id: i32,
    pool: &State<PgPool>,
    user: User,
) -> Result<Json<Event>, EventGetError> {
    match event::get_user(pool, id, user.email).await {
        Ok(event) => Ok(Json(event)),
        Err(Error::NoDataError(_)) => Err(EventGetError::NotFound(format!(
            "Event with ID {} not found",
            id
        ))),
        Err(e) => Err(EventGetError::InternalServerError(format!(
            "Error getting event, due to: {}",
            e
        ))),
    }
}

custom_errors!(
    EventDeleteError,
    Unauthorized,
    NotFound,
    InternalServerError
);

/// Delete an event.
#[openapi(tag = "Events")]
#[delete("/events/<id>", format = "json")]
pub async fn delete(
    id: i32,
    pool: &State<PgPool>,
    _user: AdminUser,
) -> Result<rocket::response::status::NoContent, EventDeleteError> {
    match event::delete(pool, id).await {
        Ok(_) => Ok(rocket::response::status::NoContent),
        Err(Error::NoDataError(_)) => Err(EventDeleteError::NotFound(format!(
            "Event with ID {} not found",
            id
        ))),
        Err(e) => Err(EventDeleteError::InternalServerError(format!(
            "Error deleting event, due to: {}",
            e
        ))),
    }
}

custom_errors!(EventPostError, Unauthorized, InternalServerError);

/// Create an event
#[openapi(tag = "Events")]
#[post("/events", format = "json", data = "<event_request>")]
pub async fn post(
    event_request: Json<EventCreate>,
    pool: &State<PgPool>,
    _user: AdminUser,
) -> Result<status::Created<Json<Event>>, EventPostError> {
    match event::create(pool, event_request.into_inner()).await {
        Ok(event) => Ok(
            status::Created::new("/events/".to_string() + &event.id.to_string()).body(Json(event)),
        ),
        Err(e) => Err(EventPostError::InternalServerError(format!(
            "Error creating event, due to: {}",
            e
        ))),
    }
}
