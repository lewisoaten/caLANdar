use chrono::{DateTime, Duration, Utc};
use rocket::{
    get, post,
    serde::{
        json::{serde_json::Value as JsonValue, Json},
        Deserialize, Serialize,
    },
    State,
};
use rocket_okapi::okapi::schemars;
use rocket_okapi::okapi::schemars::JsonSchema;
use rocket_okapi::openapi;
use rusty_paseto::prelude::*;
use sqlx::PgPool;

use crate::{
    auth::{AdminUser, User},
    controllers::{live, Error},
    live::{log, stream::row_json, token, LiveConfig},
};

custom_errors!(
    LiveError,
    BadRequest,
    Unauthorized,
    Forbidden,
    NotFound,
    Conflict,
    InternalServerError
);

impl From<Error> for LiveError {
    fn from(e: Error) -> Self {
        match e {
            Error::BadInput(e) => Self::BadRequest(e),
            Error::NotPermitted(e) => Self::Forbidden(e),
            Error::NotFound(e) | Error::NoData(e) => Self::NotFound(e),
            Error::Conflict(e) => Self::Conflict(e),
            Error::Controller(e) | Error::Upstream(e) => Self::InternalServerError(e),
        }
    }
}

/// A stream token and where to use it.
#[derive(Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct StreamTokenResponse {
    /// Pass as `?st=` to the stream.
    pub token: String,
    /// The stream endpoint: absolute when streams are served by a separate
    /// service, otherwise a path on the API origin.
    pub stream_url: String,
    pub expires_at: DateTime<Utc>,
}

/// Mint a stream token for the signed-in user.
///
/// `EventSource` cannot send the bearer token, so the stream takes this
/// short-lived, read-only token in its query string instead.
#[openapi(tag = "Live")]
#[post("/events/<event_id>/live/stream-token")]
pub async fn stream_token(
    event_id: i32,
    pool: &State<PgPool>,
    key: &State<PasetoSymmetricKey<V4, Local>>,
    config: &State<LiveConfig>,
    user: User,
) -> Result<Json<StreamTokenResponse>, LiveError> {
    let viewer = live::viewer_for(pool, event_id, &user.email).await?;
    let token = token::mint(key, event_id, &viewer).map_err(LiveError::InternalServerError)?;
    Ok(Json(StreamTokenResponse {
        token,
        stream_url: config.stream_url(event_id),
        expires_at: Utc::now() + Duration::hours(token::TTL_HOURS),
    }))
}

/// The event, as Live needs it.
#[derive(Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct LiveEventInfo {
    pub id: i32,
    pub title: String,
    pub time_begin: DateTime<Utc>,
    pub time_end: DateTime<Utc>,
    pub discord_invite_url: Option<String>,
    pub timezone: String,
}

/// Everything the Live page needs to render, plus the stream cursor.
#[derive(Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct LiveSnapshot {
    /// Resume the stream after this seq.
    pub seq: i64,
    pub server_time: DateTime<Utc>,
    pub is_admin: bool,
    pub event: LiveEventInfo,
    /// Recent feed entries and admin posts, oldest first.
    pub feed: Vec<JsonValue>,
}

/// Get the live snapshot of an event.
#[openapi(tag = "Live")]
#[get("/events/<event_id>/live", format = "json")]
pub async fn snapshot(
    event_id: i32,
    pool: &State<PgPool>,
    user: User,
) -> Result<Json<LiveSnapshot>, LiveError> {
    let viewer = live::viewer_for(pool, event_id, &user.email).await?;
    let event = crate::controllers::event::get(pool, event_id)
        .await
        .map_err(|_| LiveError::NotFound(format!("Event {event_id} not found")))?;
    let seq = log::latest_seq(pool.inner(), event_id)
        .await
        .map_err(|e| LiveError::InternalServerError(format!("Unable to read the log: {e}")))?;
    let feed = log::feed(pool.inner(), event_id, 200)
        .await
        .map_err(|e| LiveError::InternalServerError(format!("Unable to read the feed: {e}")))?
        .iter()
        .filter(|row| viewer.can_see(row.audience.as_deref()))
        .map(row_json)
        .collect();
    Ok(Json(LiveSnapshot {
        seq,
        server_time: Utc::now(),
        is_admin: viewer.is_admin(),
        event: LiveEventInfo {
            id: event.id,
            title: event.title,
            time_begin: event.time_begin,
            time_end: event.time_end,
            discord_invite_url: None,
            timezone: crate::scheduler::DEFAULT_TIMEZONE.name().to_string(),
        },
        feed,
    }))
}

#[derive(Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct PostRequest {
    pub text: String,
    /// `10m` or `dismiss`.
    pub ttl: String,
    /// Also show it on the wall-board.
    #[serde(default)]
    pub tv: bool,
}

#[derive(Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct SeqResponse {
    pub seq: i64,
}

/// Post a message to everyone at the event (admin only).
#[openapi(tag = "Live")]
#[post("/events/<event_id>/live/posts", format = "json", data = "<request>")]
pub async fn post(
    event_id: i32,
    request: Json<PostRequest>,
    pool: &State<PgPool>,
    admin: AdminUser,
) -> Result<Json<SeqResponse>, LiveError> {
    let ttl = live::PostTtl::parse(&request.ttl)?;
    let seq = live::post_to_everyone(pool, event_id, &admin.email, &request.text, ttl, request.tv)
        .await?;
    Ok(Json(SeqResponse { seq }))
}
