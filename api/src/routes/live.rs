use chrono::{DateTime, Duration, Utc};
use rocket::{
    get, post, put,
    serde::{json::Json, Deserialize, Serialize},
    State,
};
use rocket_okapi::okapi::schemars;
use rocket_okapi::okapi::schemars::JsonSchema;
use rocket_okapi::openapi;
use rusty_paseto::prelude::*;
use sqlx::PgPool;

use crate::{
    auth::{AdminUser, User},
    controllers::{
        live::{self, CommandResponse},
        Error,
    },
    live::{
        engine::{Command, Input},
        log, token, LiveConfig,
    },
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

/// Get the live snapshot of an event: everything the Live page renders,
/// plus the stream cursor.
#[openapi(tag = "Live")]
#[get("/events/<event_id>/live", format = "json")]
pub async fn snapshot(
    event_id: i32,
    pool: &State<PgPool>,
    user: User,
) -> Result<Json<live::Snapshot>, LiveError> {
    let viewer = live::viewer_for(pool, event_id, &user.email).await?;
    Ok(Json(live::snapshot(pool, event_id, &viewer).await?))
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

/// The `Idempotency-Key` header of a live command (DESIGN.md §3.5).
pub struct IdempotencyKey(pub Option<String>);

#[rocket::async_trait]
impl<'r> rocket::request::FromRequest<'r> for IdempotencyKey {
    type Error = ();

    async fn from_request(
        request: &'r rocket::Request<'_>,
    ) -> rocket::request::Outcome<Self, Self::Error> {
        rocket::request::Outcome::Success(Self(
            request
                .headers()
                .get_one("Idempotency-Key")
                .map(ToString::to_string),
        ))
    }
}

impl rocket_okapi::request::OpenApiFromRequest<'_> for IdempotencyKey {
    fn from_request_input(
        _gen: &mut rocket_okapi::gen::OpenApiGenerator,
        _name: String,
        _required: bool,
    ) -> rocket_okapi::Result<rocket_okapi::request::RequestHeaderInput> {
        Ok(rocket_okapi::request::RequestHeaderInput::None)
    }
}

/// Run a gamer's command and answer with what changed.
async fn run(
    pool: &PgPool,
    event_id: i32,
    email: &str,
    command: Command,
    key: &IdempotencyKey,
) -> Result<Json<CommandResponse>, LiveError> {
    live::viewer_for(pool, event_id, email).await?;
    let executed = live::execute(
        pool,
        event_id,
        Input::Command {
            actor: live::actor(email),
            command,
        },
        key.0.as_deref(),
    )
    .await?;
    Ok(Json(executed.response))
}

#[derive(Deserialize, JsonSchema, Default)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct CheckInRequest {
    /// Admins only: who to check in (their pid). Omit to check yourself in.
    #[serde(default)]
    pub pid: Option<String>,
}

/// Check in at the venue (yourself; admins may check in someone else).
#[openapi(tag = "Live")]
#[post("/events/<event_id>/live/checkin", format = "json", data = "<request>")]
pub async fn checkin(
    event_id: i32,
    request: Json<CheckInRequest>,
    key: IdempotencyKey,
    pool: &State<PgPool>,
    user: User,
) -> Result<Json<CommandResponse>, LiveError> {
    let email = match &request.pid {
        None => user.email.clone(),
        Some(pid) => live::email_for_pid(pool, event_id, pid).await?,
    };
    run(
        pool,
        event_id,
        &user.email,
        Command::CheckIn { email },
        &key,
    )
    .await
}

#[derive(Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct SettingsRequest {
    /// Empty string clears it; omit to leave it.
    #[serde(default)]
    pub discord_invite_url: Option<String>,
    #[serde(default)]
    pub timezone: Option<String>,
    #[serde(default)]
    pub rotate_wallboard: bool,
}

/// Update an event's Live settings (admin only).
#[openapi(tag = "Live")]
#[put(
    "/events/<event_id>/live/settings",
    format = "json",
    data = "<request>"
)]
pub async fn settings(
    event_id: i32,
    request: Json<SettingsRequest>,
    pool: &State<PgPool>,
    admin: AdminUser,
) -> Result<Json<live::EventView>, LiveError> {
    let request = request.into_inner();
    Ok(Json(
        live::update_settings(
            pool,
            event_id,
            &admin.email,
            live::Settings {
                discord_invite_url: request.discord_invite_url,
                timezone: request.timezone,
                rotate_wallboard: request.rotate_wallboard,
            },
        )
        .await?,
    ))
}

/// Run the time-driven rules now: clients call this when a countdown they
/// show reaches zero, so transitions land within a second (§3.8).
#[openapi(tag = "Live")]
#[post("/events/<event_id>/live/tick")]
pub async fn tick(
    event_id: i32,
    pool: &State<PgPool>,
    user: User,
) -> Result<Json<SeqResponse>, LiveError> {
    live::viewer_for(pool, event_id, &user.email).await?;
    live::tick(pool, event_id).await?;
    let seq = log::latest_seq(pool.inner(), event_id)
        .await
        .map_err(|e| LiveError::InternalServerError(format!("Unable to read the log: {e}")))?;
    Ok(Json(SeqResponse { seq }))
}
