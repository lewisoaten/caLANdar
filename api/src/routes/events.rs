use crate::{
    auth::{AdminUser, User},
    controllers::{event, Error},
    repositories::event::EventFilter,
};
use chrono::{prelude::Utc, DateTime};
use rocket::{
    delete, get, post, put,
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
#[derive(Clone, Serialize, JsonSchema, Hash, Eq, PartialEq)]
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

    /// The optional cover image for the event. Base64 and binary encodings are supported.
    pub image: Option<String>,

    /// The time the event begins.
    pub time_begin: DateTime<Utc>,

    /// The time the event ends.
    pub time_end: DateTime<Utc>,
}

impl SchemaExample for Event {
    fn example() -> Self {
        Self {
            id: 1,
            created_at: Utc::now(),
            last_modified: Utc::now(),
            title: "Example Event".to_string(),
            description: "This is an example event.".to_string(),
            image: Some("iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAAXNSR0IArs4c6QAAAE9JREFUGFcBRAC7/wGjoJj/iK2zACQmHAAYFRkAAdLPyv/h9QsA9/v8AMnCsQABsrW5/wURGgDu9vcAtcGtAAFafW7/XEoxAMXZ4gDs7gUANG0fr2k/YhsAAAAASUVORK5CYII=".to_string()),
            time_begin: Utc::now(),
            time_end: Utc::now(),
        }
    }
}

/// The request body for creating an event.
#[derive(Deserialize, Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
#[schemars(example = "Self::example")]
pub struct EventSubmit {
    pub title: String,
    pub description: String,
    pub image: Option<String>,
    pub time_begin: DateTime<Utc>,
    pub time_end: DateTime<Utc>,
}

impl SchemaExample for EventSubmit {
    fn example() -> Self {
        Self {
            title: "Example Event".to_string(),
            description: "This is an example event.".to_string(),
            image: Some("iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAAXNSR0IArs4c6QAAAE9JREFUGFcBRAC7/wGjoJj/iK2zACQmHAAYFRkAAdLPyv/h9QsA9/v8AMnCsQABsrW5/wURGgDu9vcAtcGtAAFafW7/XEoxAMXZ4gDs7gUANG0fr2k/YhsAAAAASUVORK5CYII=".to_string()),
            time_begin: Utc::now(),
            time_end: Utc::now(),
        }
    }
}

/// The response for paginated events
#[derive(Clone, Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct PaginatedEventsResponse {
    pub events: Vec<Event>,
    pub total: i64,
    pub page: i64,
    pub limit: i64,
    pub total_pages: i64,
}

custom_errors!(EventsGetError, Unauthorized, InternalServerError);

/// Get all events as an administrator, even those which the user is not invited to.
/// Supports pagination and filtering via query parameters.
/// - page: Page number (default: 1, must be >= 1)
/// - limit: Items per page (default: 20, range: 1-100)
/// - filter: Event filter - "all", "upcoming", or "past" (default: "all")
#[openapi(tag = "Events")]
#[get("/events?<_as_admin>&<page>&<limit>&<filter>", format = "json")]
pub async fn get_all(
    pool: &State<PgPool>,
    _as_admin: Option<bool>,
    page: Option<i64>,
    limit: Option<i64>,
    filter: Option<String>,
    _user: AdminUser,
) -> Result<Json<PaginatedEventsResponse>, EventsGetError> {
    let page = page.unwrap_or(1).max(1);
    let limit = limit.unwrap_or(20).clamp(1, 100);

    let event_filter = match filter.as_deref() {
        Some("upcoming") => EventFilter::Upcoming,
        Some("past") => EventFilter::Past,
        _ => EventFilter::All,
    };

    match event::get_all_paginated(pool, page, limit, event_filter).await {
        Ok(response) => Ok(Json(PaginatedEventsResponse {
            events: response.events,
            total: response.total,
            page: response.page,
            limit: response.limit,
            total_pages: response.total_pages,
        })),
        Err(e) => Err(EventsGetError::InternalServerError(format!(
            "Error getting events, due to: {e}"
        ))),
    }
}

/// Return all events the user is invited to.
/// Supports pagination via query parameters.
/// - page: Page number (default: 1, must be >= 1)
/// - limit: Items per page (default: 20, range: 1-100)
/// - filter: Event filter - "all", "upcoming", or "past" (default: "all")
#[openapi(tag = "Events")]
#[get("/events?<page>&<limit>&<filter>", format = "json", rank = 2)]
pub async fn get_all_user(
    pool: &State<PgPool>,
    page: Option<i64>,
    limit: Option<i64>,
    filter: Option<String>,
    user: User,
) -> Result<Json<PaginatedEventsResponse>, EventsGetError> {
    let page = page.unwrap_or(1).max(1);
    let limit = limit.unwrap_or(20).clamp(1, 100);

    let event_filter = match filter.as_deref() {
        Some("upcoming") => EventFilter::Upcoming,
        Some("past") => EventFilter::Past,
        _ => EventFilter::All,
    };

    // NOTE: This implementation fetches all user events and then applies pagination client-side.
    // This is a temporary solution that works well for users with a moderate number of events.
    // For optimal performance with users having many events, this should be refactored to:
    // 1. Join events with invitations in a single query
    // 2. Apply filtering and pagination at the database level
    // 3. Use indexes on the invitation table for the email column
    match event::get_all_user(pool, user.email).await {
        Ok(all_events) => {
            // Apply filter
            let now = chrono::Utc::now();
            let filtered_events: Vec<Event> = match event_filter {
                EventFilter::Upcoming => all_events
                    .into_iter()
                    .filter(|e| e.time_end > now)
                    .collect(),
                EventFilter::Past => all_events
                    .into_iter()
                    .filter(|e| e.time_end <= now)
                    .collect(),
                EventFilter::All => all_events,
            };

            #[allow(clippy::cast_possible_wrap)]
            let total = filtered_events.len() as i64;
            let total_pages = (total + limit - 1) / limit;

            #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
            let start = ((page - 1) * limit) as usize;

            #[allow(clippy::cast_sign_loss)]
            let end = (start + limit as usize).min(filtered_events.len());

            let events = if start < filtered_events.len() {
                filtered_events[start..end].to_vec()
            } else {
                vec![]
            };

            Ok(Json(PaginatedEventsResponse {
                events,
                total,
                page,
                limit,
                total_pages,
            }))
        }
        Err(e) => Err(EventsGetError::InternalServerError(format!(
            "Error getting events, due to: {e}"
        ))),
    }
}

custom_errors!(EventGetError, Unauthorized, NotFound, InternalServerError);

/// Return requested event.
#[openapi(tag = "Events")]
#[get("/events/<id>?<_as_admin>", format = "json")]
pub async fn get(
    id: i32,
    pool: &State<PgPool>,
    _as_admin: Option<bool>,
    _user: AdminUser,
) -> Result<Json<Event>, EventGetError> {
    match event::get(pool, id).await {
        Ok(event) => Ok(Json(event)),
        Err(Error::NoData(_)) => Err(EventGetError::NotFound(format!(
            "Event with ID {id} not found"
        ))),
        Err(e) => Err(EventGetError::InternalServerError(format!(
            "Error getting event, due to: {e}"
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
        Err(Error::NoData(_)) => Err(EventGetError::NotFound(format!(
            "Event with ID {id} not found"
        ))),
        Err(e) => Err(EventGetError::InternalServerError(format!(
            "Error getting event, due to: {e}"
        ))),
    }
}

custom_errors!(EventPutError, Unauthorized, BadRequest, InternalServerError);

/// Edit an event
#[openapi(tag = "Events")]
#[put("/events/<id>?<_as_admin>", format = "json", data = "<event_submit>")]
pub async fn put(
    id: i32,
    event_submit: Json<EventSubmit>,
    pool: &State<PgPool>,
    _as_admin: Option<bool>,
    user: AdminUser,
) -> Result<status::NoContent, EventPutError> {
    match event::edit(pool, id, event_submit.into_inner(), user.email).await {
        Ok(_) => Ok(status::NoContent),
        Err(Error::BadInput(e)) => Err(EventPutError::BadRequest(format!(
            "Invalid request, due to {e}"
        ))),
        Err(Error::Controller(e)) => Err(EventPutError::InternalServerError(format!(
            "Error creating event, due to: {e}"
        ))),
        Err(e) => Err(EventPutError::InternalServerError(format!(
            "Error creating event, due to: {e}"
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
#[delete("/events/<id>?<_as_admin>", format = "json")]
pub async fn delete(
    id: i32,
    pool: &State<PgPool>,
    _as_admin: Option<bool>,
    user: AdminUser,
) -> Result<rocket::response::status::NoContent, EventDeleteError> {
    match event::delete(pool, id, user.email).await {
        Ok(()) => Ok(rocket::response::status::NoContent),
        Err(Error::NoData(_)) => Err(EventDeleteError::NotFound(format!(
            "Event with ID {id} not found"
        ))),
        Err(e) => Err(EventDeleteError::InternalServerError(format!(
            "Error deleting event, due to: {e}"
        ))),
    }
}

custom_errors!(EventPostError, Unauthorized, InternalServerError);

/// Create an event
#[openapi(tag = "Events")]
#[post("/events?<_as_admin>", format = "json", data = "<event_submit>")]
pub async fn post(
    event_submit: Json<EventSubmit>,
    pool: &State<PgPool>,
    _as_admin: Option<bool>,
    user: AdminUser,
) -> Result<status::Created<Json<Event>>, EventPostError> {
    match event::create(pool, event_submit.into_inner(), user.email).await {
        Ok(event) => Ok(
            status::Created::new("/events/".to_string() + &event.id.to_string()).body(Json(event)),
        ),
        Err(e) => Err(EventPostError::InternalServerError(format!(
            "Error creating event, due to: {e}"
        ))),
    }
}
