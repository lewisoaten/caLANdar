use chrono::{DateTime, Duration, Utc};
use rocket::{
    delete, get, post, put,
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
        engine::{Command, Input, LobbyRef, PlayersAndTeams, PresenceSample},
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

/// A lobby id from the path: a stored lobby, or a planner suggestion
/// (`s<game>@<ms>`), which must still be on the plan.
async fn lobby_ref(pool: &PgPool, event_id: i32, id: &str) -> Result<LobbyRef, LiveError> {
    if let Ok(stored) = id.parse::<i32>() {
        return Ok(LobbyRef::Stored(stored));
    }
    let Some((game_id, start)) = crate::live::views::parse_suggestion_id(id) else {
        return Err(LiveError::BadRequest(format!("Bad lobby id {id}")));
    };
    let suggestion = live::find_suggestion(pool, event_id, game_id, start)
        .await?
        .ok_or_else(|| {
            LiveError::Conflict("The plan has changed since you looked. Try again.".to_string())
        })?;
    Ok(LobbyRef::Suggested(suggestion))
}

fn stored_id(id: &str) -> Result<i32, LiveError> {
    id.parse()
        .map_err(|_| LiveError::BadRequest(format!("Bad lobby id {id}")))
}

#[derive(Deserialize, JsonSchema, Default)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct PresenceRequest {
    /// Join this lobby now (it must be running or about to start).
    #[serde(default)]
    pub lobby_id: Option<String>,
    /// Leave your current lobby ("I'm not playing").
    #[serde(default)]
    pub none: bool,
    /// Keep a manual join going ("Still playing").
    #[serde(default)]
    pub still_playing: Option<String>,
}

/// Say what you're playing now: join a lobby, leave, or "still playing".
#[openapi(tag = "Live")]
#[post(
    "/events/<event_id>/live/presence",
    format = "json",
    data = "<request>"
)]
pub async fn presence(
    event_id: i32,
    request: Json<PresenceRequest>,
    key: IdempotencyKey,
    pool: &State<PgPool>,
    user: User,
) -> Result<Json<CommandResponse>, LiveError> {
    let command = if request.none {
        Command::Leave
    } else if let Some(id) = &request.still_playing {
        Command::StillPlaying {
            lobby: stored_id(id)?,
        }
    } else if let Some(id) = &request.lobby_id {
        let lobby = match lobby_ref(pool, event_id, id).await? {
            LobbyRef::Stored(id) => id,
            LobbyRef::Suggested(_) => {
                return Err(LiveError::Conflict(
                    "That one hasn't started yet. Pre-join it instead.".to_string(),
                ))
            }
        };
        Command::Join { lobby }
    } else {
        return Err(LiveError::BadRequest(
            "Say which lobby, or none".to_string(),
        ));
    };
    run(pool, event_id, &user.email, command, &key).await
}

#[derive(Deserialize, JsonSchema, Default)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct PrejoinRequest {
    /// A team of the lobby, or none.
    #[serde(default)]
    pub team: Option<String>,
    /// Any team: you're put in one when the lobby starts.
    #[serde(default)]
    pub random: bool,
}

/// Pre-join a lobby (or a suggestion, which is then fixed on the schedule).
#[openapi(tag = "Live")]
#[post(
    "/events/<event_id>/live/lobbies/<lobby_id>/prejoin",
    format = "json",
    data = "<request>"
)]
pub async fn prejoin(
    event_id: i32,
    lobby_id: &str,
    request: Json<PrejoinRequest>,
    key: IdempotencyKey,
    pool: &State<PgPool>,
    user: User,
) -> Result<Json<CommandResponse>, LiveError> {
    let lobby = lobby_ref(pool, event_id, lobby_id).await?;
    let suggested = matches!(lobby, LobbyRef::Suggested(_));
    let request = request.into_inner();
    let response = run(
        pool,
        event_id,
        &user.email,
        Command::Prejoin {
            lobby,
            team: request.team,
            random: request.random,
        },
        &key,
    )
    .await?;
    if suggested {
        // It's on the schedule now: the planner re-plans around it.
        live::refresh_plan(pool, event_id).await;
    }
    Ok(response)
}

/// Drop your pre-join.
#[openapi(tag = "Live")]
#[delete("/events/<event_id>/live/lobbies/<lobby_id>/prejoin")]
pub async fn unprejoin(
    event_id: i32,
    lobby_id: &str,
    key: IdempotencyKey,
    pool: &State<PgPool>,
    user: User,
) -> Result<Json<CommandResponse>, LiveError> {
    let lobby = stored_id(lobby_id)?;
    run(
        pool,
        event_id,
        &user.email,
        Command::Unprejoin { lobby },
        &key,
    )
    .await
}

/// End a running lobby now (admin only).
#[openapi(tag = "Live")]
#[post("/events/<event_id>/live/lobbies/<lobby_id>/end")]
pub async fn end_lobby(
    event_id: i32,
    lobby_id: &str,
    key: IdempotencyKey,
    pool: &State<PgPool>,
    admin: AdminUser,
) -> Result<Json<CommandResponse>, LiveError> {
    let id = stored_id(lobby_id)?;
    run(pool, event_id, &admin.email, Command::EndLobby { id }, &key).await
}

#[derive(Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct TeamRequest {
    pub name: String,
    pub size: i32,
}

#[derive(Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct LobbyDefaultsRequest {
    /// The event the lobby is in.
    pub event_id: i32,
    /// Apply the settings to this lobby too.
    #[serde(default)]
    pub lobby_id: Option<String>,
    #[serde(default)]
    pub max_players: Option<i32>,
    /// Omit for no teams.
    #[serde(default)]
    pub teams: Option<Vec<TeamRequest>>,
}

/// Save a game's players and teams for everyone (every event), and apply
/// them to a lobby.
#[openapi(tag = "Live")]
#[put("/games/<game_id>/lobby-defaults", format = "json", data = "<request>")]
pub async fn lobby_defaults(
    game_id: i64,
    request: Json<LobbyDefaultsRequest>,
    key: IdempotencyKey,
    pool: &State<PgPool>,
    user: User,
) -> Result<Json<CommandResponse>, LiveError> {
    let request = request.into_inner();
    let lobby = request.lobby_id.as_deref().map(stored_id).transpose()?;
    run(
        pool,
        request.event_id,
        &user.email,
        Command::SetPlayers {
            game_id,
            lobby,
            players: PlayersAndTeams {
                max_players: request.max_players,
                teams: request.teams.map(|teams| {
                    teams
                        .into_iter()
                        .map(|t| crate::live::model::Team {
                            name: t.name.trim().to_string(),
                            size: t.size,
                        })
                        .collect()
                }),
            },
        },
        &key,
    )
    .await
}

#[derive(Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct DevPresenceRequest {
    pub pid: String,
    #[serde(default)]
    pub game_id: Option<i64>,
    #[serde(default)]
    pub game_name: Option<String>,
    /// Steam persona state (1 online, 3 away).
    #[serde(default = "online")]
    pub persona_state: i32,
}

const fn online() -> i32 {
    1
}

/// Local development only (`LIVE_DEV_TOOLS=1`): pretend Steam reported a
/// person's game, skipping the two-poll debounce.
#[openapi(tag = "Live")]
#[post(
    "/events/<event_id>/live/dev/presence",
    format = "json",
    data = "<request>"
)]
pub async fn dev_presence(
    event_id: i32,
    request: Json<DevPresenceRequest>,
    pool: &State<PgPool>,
    admin: AdminUser,
) -> Result<Json<CommandResponse>, LiveError> {
    if !live::dev_tools() {
        return Err(LiveError::NotFound("Not available".to_string()));
    }
    let _ = admin;
    let email = live::email_for_pid(pool, event_id, &request.pid).await?;
    let executed = live::execute(
        pool,
        event_id,
        Input::Presence {
            samples: vec![PresenceSample {
                email,
                game_id: request.game_id,
                game_name: request.game_name.clone(),
                persona_state: request.persona_state,
                visibility: 3,
            }],
            immediate: true,
        },
        None,
    )
    .await?;
    Ok(Json(executed.response))
}

/// The shared secret Cloud Scheduler sends to the internal tick.
pub struct TickSecret(bool);

#[rocket::async_trait]
impl<'r> rocket::request::FromRequest<'r> for TickSecret {
    type Error = ();

    async fn from_request(
        request: &'r rocket::Request<'_>,
    ) -> rocket::request::Outcome<Self, Self::Error> {
        let expected = std::env::var("LIVE_TICK_SECRET").unwrap_or_default();
        let given = request
            .headers()
            .get_one("X-Live-Tick-Secret")
            .unwrap_or_default();
        rocket::request::Outcome::Success(Self(!expected.is_empty() && given == expected))
    }
}

impl rocket_okapi::request::OpenApiFromRequest<'_> for TickSecret {
    fn from_request_input(
        _gen: &mut rocket_okapi::gen::OpenApiGenerator,
        _name: String,
        _required: bool,
    ) -> rocket_okapi::Result<rocket_okapi::request::RequestHeaderInput> {
        Ok(rocket_okapi::request::RequestHeaderInput::None)
    }
}

#[derive(Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct InternalTickResponse {
    pub events: Vec<i32>,
}

/// Cloud Scheduler's backstop, once a minute (DESIGN.md §3.6): tick every
/// live event, poll Steam and check the plan, for the times nobody has
/// Live open. Authorised by the `X-Live-Tick-Secret` header.
#[openapi(tag = "Live")]
#[post("/internal/live/tick")]
pub async fn internal_tick(
    secret: TickSecret,
    pool: &State<PgPool>,
    steam_api_key: &State<String>,
) -> Result<Json<InternalTickResponse>, LiveError> {
    if !secret.0 {
        return Err(LiveError::NotFound("Not found".to_string()));
    }
    let events = live::live_events(pool).await?;
    for event_id in &events {
        live::background(pool, steam_api_key, *event_id).await;
    }
    Ok(Json(InternalTickResponse { events }))
}
