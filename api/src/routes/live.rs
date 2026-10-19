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
        engine::{
            Command, Input, LobbyRef, OptionSpec, PlayersAndTeams, PresenceSample, Proposal,
            ProposalMode, Resolve, VoteRequest,
        },
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
    /// Also post it to the event's Discord channel.
    #[serde(default)]
    pub discord: bool,
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
    let seq = live::post_to_everyone(
        pool,
        event_id,
        &admin.email,
        &request.text,
        ttl,
        request.tv,
        request.discord,
    )
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
    /// A Discord webhook (`https://discord.com/api/webhooks/...`).
    #[serde(default)]
    pub discord_webhook_url: Option<String>,
    #[serde(default)]
    pub timezone: Option<String>,
    /// e.g. `03:00-09:00`; empty to never sleep.
    #[serde(default)]
    pub wallboard_sleep: Option<String>,
    #[serde(default)]
    pub venue_name: Option<String>,
    /// `lat,lng`.
    #[serde(default)]
    pub venue_location: Option<String>,
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
                discord_webhook_url: request.discord_webhook_url,
                timezone: request.timezone,
                wallboard_sleep: request.wallboard_sleep,
                venue: match (request.venue_name, request.venue_location) {
                    (None, None) => None,
                    (name, location) => {
                        Some((name.unwrap_or_default(), location.unwrap_or_default()))
                    }
                },
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

#[derive(Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct FoodRequest {
    pub name: String,
    #[serde(default)]
    pub place_id: Option<String>,
    #[serde(default)]
    pub photo_url: Option<String>,
    #[serde(default)]
    pub rating: Option<f64>,
    #[serde(default)]
    pub address: Option<String>,
    #[serde(default)]
    pub free_text: Option<String>,
}

impl From<FoodRequest> for crate::live::model::Food {
    fn from(f: FoodRequest) -> Self {
        Self {
            name: f.name.trim().to_string(),
            place_id: f.place_id,
            photo_url: f.photo_url,
            rating: f.rating,
            address: f.address,
            free_text: f.free_text,
        }
    }
}

#[derive(Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct WhatRequest {
    /// `game` or `food`.
    pub kind: String,
    #[serde(default)]
    pub game_id: Option<i64>,
    #[serde(default)]
    pub food: Option<FoodRequest>,
    #[serde(default)]
    pub max_players: Option<i32>,
    #[serde(default)]
    pub teams: Option<Vec<TeamRequest>>,
}

fn players_of(max_players: Option<i32>, teams: Option<Vec<TeamRequest>>) -> PlayersAndTeams {
    PlayersAndTeams {
        max_players,
        teams: teams.map(|teams| {
            teams
                .into_iter()
                .map(|t| crate::live::model::Team {
                    name: t.name.trim().to_string(),
                    size: t.size,
                })
                .collect()
        }),
    }
}

async fn option_spec(
    pool: &PgPool,
    kind: &str,
    game_id: Option<i64>,
    food: Option<FoodRequest>,
) -> Result<OptionSpec, LiveError> {
    match kind {
        "game" => {
            let game_id =
                game_id.ok_or_else(|| LiveError::BadRequest("Pick a game".to_string()))?;
            let name = live::game_name(pool, game_id).await?;
            Ok(OptionSpec::Game { game_id, name })
        }
        "food" => Ok(OptionSpec::Food(
            food.ok_or_else(|| LiveError::BadRequest("Say what food".to_string()))?
                .into(),
        )),
        other => Err(LiveError::BadRequest(format!("Unknown kind {other}"))),
    }
}

#[derive(Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct ProposeRequest {
    #[serde(flatten)]
    pub what: WhatRequest,
    pub start: DateTime<Utc>,
    pub duration_min: i32,
    /// `alongside` (needs one backer) or `option` (challenges `lobbyId`, or
    /// adds to `voteId`).
    #[serde(default = "alongside")]
    pub mode: String,
    #[serde(default)]
    pub lobby_id: Option<String>,
    #[serde(default)]
    pub vote_id: Option<String>,
}

fn alongside() -> String {
    "alongside".to_string()
}

fn vote_id(id: &str) -> Result<i64, LiveError> {
    id.parse()
        .map_err(|_| LiveError::BadRequest(format!("Bad vote id {id}")))
}

/// Propose a game or food: alongside what's on (needs a backer within five
/// minutes), or as an option against a planned lobby.
#[openapi(tag = "Live")]
#[post("/events/<event_id>/live/lobbies", format = "json", data = "<request>")]
pub async fn propose(
    event_id: i32,
    request: Json<ProposeRequest>,
    key: IdempotencyKey,
    pool: &State<PgPool>,
    user: User,
) -> Result<Json<CommandResponse>, LiveError> {
    let request = request.into_inner();
    let what = option_spec(
        pool,
        &request.what.kind,
        request.what.game_id,
        request.what.food,
    )
    .await?;
    let mode = match request.mode.as_str() {
        "alongside" => ProposalMode::Alongside,
        "option" => match (&request.vote_id, &request.lobby_id) {
            (Some(vote), _) => ProposalMode::AddTo(vote_id(vote)?),
            (None, Some(lobby)) => ProposalMode::Challenge(lobby_ref(pool, event_id, lobby).await?),
            (None, None) => {
                return Err(LiveError::BadRequest("Say which lobby or vote".to_string()))
            }
        },
        other => return Err(LiveError::BadRequest(format!("Unknown mode {other}"))),
    };
    let challenging_suggestion = matches!(mode, ProposalMode::Challenge(LobbyRef::Suggested(_)));
    let response = run(
        pool,
        event_id,
        &user.email,
        Command::Propose(Proposal {
            what,
            start: request.start,
            minutes: request.duration_min,
            players: players_of(request.what.max_players, request.what.teams),
            mode,
        }),
        &key,
    )
    .await?;
    if challenging_suggestion {
        live::refresh_plan(pool, event_id).await;
    }
    Ok(response)
}

/// Remove your own proposal.
#[openapi(tag = "Live")]
#[delete("/events/<event_id>/live/lobbies/<lobby_id>")]
pub async fn remove_proposal(
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
        Command::RemoveProposal { lobby },
        &key,
    )
    .await
}

/// "Close now": end an empty lobby at the time the last person left.
#[openapi(tag = "Live")]
#[post("/events/<event_id>/live/lobbies/<lobby_id>/close")]
pub async fn close_lobby(
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
        Command::CloseNow { lobby },
        &key,
    )
    .await
}

#[derive(Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct VoteOpenRequest {
    /// `extend`, `delay`, `change` or `kickoff`.
    #[serde(rename = "type")]
    pub kind: String,
    pub lobby_id: String,
    /// extend / delay: by how much.
    #[serde(default)]
    pub minutes: Option<i32>,
    /// change: move the start by this much.
    #[serde(default)]
    pub start_delta: Option<i32>,
    /// change: change the length by this much.
    #[serde(default)]
    pub minutes_delta: Option<i32>,
    /// kickoff: the new start.
    #[serde(default)]
    pub new_start: Option<DateTime<Utc>>,
}

/// Call a vote about a lobby: keep playing, delay, change, kick off early.
#[openapi(tag = "Live")]
#[post("/events/<event_id>/live/votes", format = "json", data = "<request>")]
pub async fn open_vote(
    event_id: i32,
    request: Json<VoteOpenRequest>,
    key: IdempotencyKey,
    pool: &State<PgPool>,
    user: User,
) -> Result<Json<CommandResponse>, LiveError> {
    let lobby = match lobby_ref(pool, event_id, &request.lobby_id).await? {
        LobbyRef::Stored(id) => id,
        LobbyRef::Suggested(_) => {
            return Err(LiveError::Conflict(
                "Pre-join it first: suggestions can't be voted on yet".to_string(),
            ))
        }
    };
    let need =
        |v: Option<i32>, what: &str| v.ok_or_else(|| LiveError::BadRequest(format!("Say {what}")));
    let vote = match request.kind.as_str() {
        "extend" => VoteRequest::Extend {
            lobby,
            minutes: need(request.minutes, "how long")?,
        },
        "delay" => VoteRequest::Delay {
            lobby,
            minutes: need(request.minutes, "how long")?,
        },
        "change" => VoteRequest::Change {
            lobby,
            start_delta: request.start_delta.unwrap_or(0),
            minutes_delta: request.minutes_delta.unwrap_or(0),
        },
        "kickoff" => VoteRequest::Kickoff {
            lobby,
            new_start: request
                .new_start
                .ok_or_else(|| LiveError::BadRequest("Say when".to_string()))?,
        },
        other => return Err(LiveError::BadRequest(format!("Unknown vote type {other}"))),
    };
    run(pool, event_id, &user.email, Command::OpenVote(vote), &key).await
}

#[derive(Deserialize, JsonSchema, Default)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct BallotRequest {
    #[serde(default)]
    pub option_id: Option<String>,
    #[serde(default)]
    pub split_ok: Option<bool>,
}

/// Vote, change your vote, or tick "happy to split the party".
#[openapi(tag = "Live")]
#[put(
    "/events/<event_id>/live/votes/<vote>/ballot",
    format = "json",
    data = "<request>"
)]
pub async fn ballot(
    event_id: i32,
    vote: &str,
    request: Json<BallotRequest>,
    key: IdempotencyKey,
    pool: &State<PgPool>,
    user: User,
) -> Result<Json<CommandResponse>, LiveError> {
    let option = request.option_id.as_deref().map(vote_id).transpose()?;
    run(
        pool,
        event_id,
        &user.email,
        Command::Ballot {
            vote: vote_id(vote)?,
            option,
            split_ok: request.split_ok,
        },
        &key,
    )
    .await
}

#[derive(Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct AddOptionRequest {
    #[serde(flatten)]
    pub what: WhatRequest,
    pub duration_min: i32,
}

/// Add an option to a slot vote (its start comes from the vote).
#[openapi(tag = "Live")]
#[post(
    "/events/<event_id>/live/votes/<vote>/options",
    format = "json",
    data = "<request>"
)]
pub async fn add_option(
    event_id: i32,
    vote: &str,
    request: Json<AddOptionRequest>,
    key: IdempotencyKey,
    pool: &State<PgPool>,
    user: User,
) -> Result<Json<CommandResponse>, LiveError> {
    let request = request.into_inner();
    let what = option_spec(
        pool,
        &request.what.kind,
        request.what.game_id,
        request.what.food,
    )
    .await?;
    run(
        pool,
        event_id,
        &user.email,
        Command::AddOption {
            vote: vote_id(vote)?,
            what,
            minutes: request.duration_min,
            players: players_of(request.what.max_players, request.what.teams),
        },
        &key,
    )
    .await
}

#[derive(Deserialize, JsonSchema, Default)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct ResolveRequest {
    #[serde(default)]
    pub force: Option<String>,
    #[serde(default)]
    pub split: bool,
    #[serde(default)]
    pub veto: bool,
}

/// Admin: force an option, split the party, or veto.
#[openapi(tag = "Live")]
#[post(
    "/events/<event_id>/live/votes/<vote>/resolve",
    format = "json",
    data = "<request>"
)]
pub async fn resolve_vote(
    event_id: i32,
    vote: &str,
    request: Json<ResolveRequest>,
    key: IdempotencyKey,
    pool: &State<PgPool>,
    admin: AdminUser,
) -> Result<Json<CommandResponse>, LiveError> {
    let how = match (&request.force, request.split, request.veto) {
        (Some(option), false, false) => Resolve::Force(vote_id(option)?),
        (None, true, false) => Resolve::Split,
        (None, false, true) => Resolve::Veto,
        _ => {
            return Err(LiveError::BadRequest(
                "Say force, split or veto".to_string(),
            ))
        }
    };
    run(
        pool,
        event_id,
        &admin.email,
        Command::ResolveVote {
            vote: vote_id(vote)?,
            how,
        },
        &key,
    )
    .await
}

/// Admin, from the check-in queue: `rsvp-no` (they called to cancel),
/// `delay-arrival` (running late) or `nudge`.
#[openapi(tag = "Live")]
#[post("/events/<event_id>/live/people/<pid>/<action>")]
pub async fn person_action(
    event_id: i32,
    pid: &str,
    action: &str,
    key: IdempotencyKey,
    pool: &State<PgPool>,
    admin: AdminUser,
) -> Result<Json<CommandResponse>, LiveError> {
    let email = live::email_for_pid(pool, event_id, pid).await?;
    let command = match action {
        "rsvp-no" => Command::RsvpNo { email },
        "delay-arrival" => Command::DelayArrival { email },
        "nudge" => Command::Nudge { email },
        other => return Err(LiveError::NotFound(format!("No action {other}"))),
    };
    run(pool, event_id, &admin.email, command, &key).await
}

/// A game's saved players and teams and its typical length (§5.6), for
/// pre-filling the propose sheet.
#[openapi(tag = "Live")]
#[get("/games/<game_id>/lobby-defaults")]
pub async fn get_lobby_defaults(
    game_id: i64,
    pool: &State<PgPool>,
    _user: User,
) -> Result<Json<live::GameKnowledge>, LiveError> {
    Ok(Json(live::game_knowledge(pool, game_id).await?))
}

/// Search games for the propose sheet: the event's suggested games first,
/// then all of Steam.
#[openapi(tag = "Live")]
#[get("/events/<event_id>/live/games?<q>")]
pub async fn search_games(
    event_id: i32,
    q: Option<&str>,
    pool: &State<PgPool>,
    user: User,
) -> Result<Json<Vec<live::GameHit>>, LiveError> {
    live::viewer_for(pool, event_id, &user.email).await?;
    Ok(Json(
        live::search_games(pool, event_id, q.unwrap_or_default()).await?,
    ))
}

/// The event behind a wall-board link.
async fn wallboard_event(pool: &PgPool, token: &str) -> Result<i32, LiveError> {
    sqlx::query_scalar::<_, i32>("SELECT id FROM event WHERE wallboard_token = $1")
        .bind(token)
        .fetch_optional(pool)
        .await
        .map_err(|e| LiveError::InternalServerError(format!("Unable to read the event: {e}")))?
        .ok_or_else(|| LiveError::NotFound("This wall-board link is no longer valid".to_string()))
}

/// The wall-board's snapshot (no login; public rows only, no emails).
#[openapi(tag = "Live")]
#[get("/live/<token>", format = "json", rank = 2)]
pub async fn wallboard_snapshot(
    token: &str,
    pool: &State<PgPool>,
) -> Result<Json<live::Snapshot>, LiveError> {
    let event_id = wallboard_event(pool, token).await?;
    Ok(Json(
        live::snapshot(pool, event_id, &crate::live::log::Viewer::Wallboard).await?,
    ))
}

/// A stream token for the wall-board.
#[openapi(tag = "Live")]
#[post("/live/<token>/stream-token", rank = 2)]
pub async fn wallboard_stream_token(
    token: &str,
    pool: &State<PgPool>,
    key: &State<PasetoSymmetricKey<V4, Local>>,
    config: &State<LiveConfig>,
) -> Result<Json<StreamTokenResponse>, LiveError> {
    let event_id = wallboard_event(pool, token).await?;
    let token = token::mint(key, event_id, &crate::live::log::Viewer::Wallboard)
        .map_err(LiveError::InternalServerError)?;
    Ok(Json(StreamTokenResponse {
        token,
        stream_url: config.stream_url(event_id),
        expires_at: Utc::now() + Duration::hours(token::TTL_HOURS),
    }))
}

#[derive(Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct PushKeyResponse {
    /// The VAPID public key: the browser's `applicationServerKey`.
    pub public_key: String,
}

/// The Web Push key, if push is set up on this server.
#[openapi(tag = "Live")]
#[get("/live/push/key", rank = 1)]
pub fn push_key(_user: User) -> Result<Json<PushKeyResponse>, LiveError> {
    crate::live::notify::vapid()
        .map(|v| {
            Json(PushKeyResponse {
                public_key: v.public_base64(),
            })
        })
        .ok_or_else(|| LiveError::NotFound("Push isn't set up".to_string()))
}

#[derive(Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct PushKeys {
    pub p256dh: String,
    pub auth: String,
}

#[derive(Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct PushSubscriptionRequest {
    pub endpoint: String,
    pub keys: PushKeys,
}

/// Get Live's alerts as push notifications on this browser.
#[openapi(tag = "Live")]
#[post("/events/<event_id>/live/push", format = "json", data = "<request>")]
pub async fn push_subscribe(
    event_id: i32,
    request: Json<PushSubscriptionRequest>,
    pool: &State<PgPool>,
    user: User,
) -> Result<Json<SeqResponse>, LiveError> {
    live::viewer_for(pool, event_id, &user.email).await?;
    if !request.endpoint.starts_with("https://") || request.endpoint.len() > 1000 {
        return Err(LiveError::BadRequest("Bad push endpoint".to_string()));
    }
    sqlx::query(
        r"
        INSERT INTO live_push_subscription (event_id, email, endpoint, p256dh, auth)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (event_id, endpoint) DO UPDATE SET email = $2, p256dh = $4, auth = $5
        ",
    )
    .bind(event_id)
    .bind(&user.email)
    .bind(&request.endpoint)
    .bind(&request.keys.p256dh)
    .bind(&request.keys.auth)
    .execute(pool.inner())
    .await
    .map_err(|e| LiveError::InternalServerError(format!("Unable to save the subscription: {e}")))?;
    Ok(Json(SeqResponse { seq: 0 }))
}

#[derive(Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct PlacesResponse {
    pub places: Vec<crate::live::places::PlaceHit>,
}

/// Food near the venue (needs `GOOGLE_PLACES_API_KEY` and a venue).
#[openapi(tag = "Live")]
#[get("/events/<event_id>/live/places?<q>")]
pub async fn places(
    event_id: i32,
    q: &str,
    pool: &State<PgPool>,
    user: User,
) -> Result<Json<PlacesResponse>, LiveError> {
    live::viewer_for(pool, event_id, &user.email).await?;
    let mut conn = pool
        .acquire()
        .await
        .map_err(|e| LiveError::InternalServerError(format!("Unable to get a connection: {e}")))?;
    let event = crate::live::store::load_event(&mut conn, event_id)
        .await
        .map_err(|e| LiveError::InternalServerError(format!("Unable to read the event: {e}")))?
        .ok_or_else(|| LiveError::NotFound("No such event".to_string()))?;
    drop(conn);
    let venue = event
        .venue
        .and_then(|v| Some((v["lat"].as_f64()?, v["lng"].as_f64()?)))
        .ok_or_else(|| LiveError::NotFound("No venue set for this event".to_string()))?;
    let places = crate::live::places::search(q, venue.0, venue.1)
        .await
        .map_err(LiveError::InternalServerError)?;
    Ok(Json(PlacesResponse { places }))
}

/// A place photo: redirects to a short-lived Google URL.
#[get("/live/places/photo?<name>", rank = 1)]
pub async fn place_photo(name: &str, _user: User) -> Result<rocket::response::Redirect, LiveError> {
    let uri = crate::live::places::photo_uri(name)
        .await
        .map_err(LiveError::NotFound)?;
    Ok(rocket::response::Redirect::to(uri))
}
