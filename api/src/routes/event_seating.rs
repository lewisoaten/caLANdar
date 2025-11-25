use crate::{
    auth::{AdminUser, User},
    controllers::{event_seating_config, Error},
};
use chrono::{prelude::Utc, DateTime};
use rocket::{
    get, put,
    serde::{json::Json, Deserialize, Serialize},
    State,
};
use rocket_okapi::okapi::schemars;
use rocket_okapi::okapi::schemars::JsonSchema;
use rocket_okapi::openapi;
use sqlx::postgres::PgPool;

use super::SchemaExample;

/// The response for the `GET /events/{eventId}/seating-config` endpoint.
#[derive(Clone, Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
#[schemars(example = "Self::example")]
pub struct EventSeatingConfig {
    /// The event ID this configuration belongs to.
    pub event_id: i32,

    /// Whether seating is enabled for this event.
    pub has_seating: bool,

    /// Whether the 'unspecified seat' option is allowed.
    pub allow_unspecified_seat: bool,

    /// Label for the unspecified seat option.
    pub unspecified_seat_label: String,

    /// The date the configuration was created.
    pub created_at: DateTime<Utc>,

    /// The last time this configuration was modified.
    pub last_modified: DateTime<Utc>,
}

impl SchemaExample for EventSeatingConfig {
    fn example() -> Self {
        Self {
            event_id: 1,
            has_seating: true,
            allow_unspecified_seat: true,
            unspecified_seat_label: "Unspecified Seat".to_string(),
            created_at: Utc::now(),
            last_modified: Utc::now(),
        }
    }
}

/// The request body for creating/updating seating configuration.
#[derive(Deserialize, Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
#[schemars(example = "Self::example")]
pub struct EventSeatingConfigSubmit {
    pub has_seating: bool,
    pub allow_unspecified_seat: bool,
    pub unspecified_seat_label: String,
}

impl SchemaExample for EventSeatingConfigSubmit {
    fn example() -> Self {
        Self {
            has_seating: true,
            allow_unspecified_seat: true,
            unspecified_seat_label: "Unspecified Seat".to_string(),
        }
    }
}

custom_errors!(
    EventSeatingConfigGetError,
    Unauthorized,
    InternalServerError
);
custom_errors!(
    EventSeatingConfigGetUserError,
    Unauthorized,
    InternalServerError
);

/// Get seating configuration for an event (admin only).
#[openapi(tag = "Event Seating")]
#[get("/events/<event_id>/seating-config?<_as_admin>", format = "json")]
pub async fn get(
    event_id: i32,
    pool: &State<PgPool>,
    _as_admin: Option<bool>,
    _user: AdminUser,
) -> Result<Json<EventSeatingConfig>, EventSeatingConfigGetError> {
    match event_seating_config::get_or_default(pool, event_id).await {
        Ok(config) => Ok(Json(config)),
        Err(e) => Err(EventSeatingConfigGetError::InternalServerError(format!(
            "Error getting seating config, due to: {e}"
        ))),
    }
}

/// Get seating configuration for an event (authenticated users only).
#[openapi(tag = "Event Seating")]
#[get("/events/<event_id>/seating-config", format = "json", rank = 2)]
pub async fn get_user(
    event_id: i32,
    pool: &State<PgPool>,
    _user: User,
) -> Result<Json<EventSeatingConfig>, EventSeatingConfigGetUserError> {
    match event_seating_config::get_or_default(pool, event_id).await {
        Ok(config) => Ok(Json(config)),
        Err(e) => Err(EventSeatingConfigGetUserError::InternalServerError(
            format!("Error getting seating config, due to: {e}"),
        )),
    }
}

custom_errors!(
    EventSeatingConfigPutError,
    Unauthorized,
    BadRequest,
    InternalServerError
);

/// Update seating configuration for an event (admin only).
#[openapi(tag = "Event Seating")]
#[put(
    "/events/<event_id>/seating-config?<_as_admin>",
    format = "json",
    data = "<config_submit>"
)]
pub async fn put(
    event_id: i32,
    config_submit: Json<EventSeatingConfigSubmit>,
    pool: &State<PgPool>,
    _as_admin: Option<bool>,
    user: AdminUser,
) -> Result<Json<EventSeatingConfig>, EventSeatingConfigPutError> {
    match event_seating_config::upsert(pool, event_id, config_submit.into_inner(), user.email).await
    {
        Ok(config) => Ok(Json(config)),
        Err(Error::BadInput(e)) => Err(EventSeatingConfigPutError::BadRequest(format!(
            "Invalid request, due to {e}"
        ))),
        Err(e) => Err(EventSeatingConfigPutError::InternalServerError(format!(
            "Error saving seating config, due to: {e}"
        ))),
    }
}
