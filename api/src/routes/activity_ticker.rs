use crate::{
    auth::User,
    controllers::{activity_ticker, ensure_user_invited},
};
use chrono::{DateTime, Utc};
use rocket::{get, serde::json::Json, serde::Serialize, State};
use rocket_okapi::okapi::schemars;
use rocket_okapi::okapi::schemars::JsonSchema;
use rocket_okapi::openapi;
use sqlx::PgPool;

use super::SchemaExample;

#[derive(Clone, Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
#[schemars(example = "Self::example")]
pub struct ActivityTickerEventResponse {
    pub id: i64,
    pub timestamp: DateTime<Utc>,
    pub message: String,
    pub icon: String,
    pub event_type: String,
    pub user_handle: Option<String>,
    pub user_avatar_url: Option<String>,
    pub game_id: Option<i64>,
}

impl SchemaExample for ActivityTickerEventResponse {
    fn example() -> Self {
        Self {
            id: 1,
            timestamp: Utc::now(),
            message: "Alice RSVPed Yes!".to_string(),
            icon: "🎉".to_string(),
            event_type: "rsvp".to_string(),
            user_handle: Some("Alice".to_string()),
            user_avatar_url: Some("https://www.gravatar.com/avatar/example?d=robohash".to_string()),
            game_id: None,
        }
    }
}

impl From<activity_ticker::ActivityTickerEvent> for ActivityTickerEventResponse {
    fn from(event: activity_ticker::ActivityTickerEvent) -> Self {
        Self {
            id: event.id,
            timestamp: event.timestamp,
            message: event.message,
            icon: event.icon,
            event_type: event.event_type,
            user_handle: event.user_handle,
            user_avatar_url: event.user_avatar_url,
            game_id: event.game_id,
        }
    }
}

#[derive(Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
#[schemars(example = "Self::example")]
pub struct ActivityTickerResponse {
    pub events: Vec<ActivityTickerEventResponse>,
}

impl SchemaExample for ActivityTickerResponse {
    fn example() -> Self {
        Self {
            events: vec![ActivityTickerEventResponse::example()],
        }
    }
}

custom_errors!(
    ActivityTickerGetError,
    Unauthorized,
    Forbidden,
    InternalServerError
);

/// Get activity ticker events for an event
#[openapi(tag = "Events")]
#[get("/events/<event_id>/activity-ticker", format = "json")]
pub async fn get_activity_ticker(
    event_id: i32,
    pool: &State<PgPool>,
    user: User,
) -> Result<Json<ActivityTickerResponse>, ActivityTickerGetError> {
    // Ensure user is invited to the event
    if let Err(e) = ensure_user_invited(pool, event_id, &user.email).await {
        return Err(ActivityTickerGetError::Forbidden(format!(
            "You are not invited to this event: {e}"
        )));
    }

    match activity_ticker::get_ticker_events(pool, event_id).await {
        Ok(events) => Ok(Json(ActivityTickerResponse {
            events: events.into_iter().map(Into::into).collect(),
        })),
        Err(e) => Err(ActivityTickerGetError::InternalServerError(format!(
            "Error retrieving activity ticker: {e}"
        ))),
    }
}
