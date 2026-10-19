//! Live controller: access checks and the write path for Live.
//!
//! Every mutation runs [`execute`]: take the event's advisory lock, load the
//! state, apply the engine, write the diff and the log rows, all in one
//! transaction (DESIGN.md §3.1).

use chrono::Utc;
use rocket::serde::{json::serde_json::Value as JsonValue, Deserialize, Serialize};
use rocket_okapi::okapi::schemars::{self, JsonSchema};
use sqlx::PgPool;

use crate::{
    auth::is_admin,
    controllers::{ensure_user_invited, Error},
    live::{
        engine::{self, Actor, Input, Reject},
        log::{self, Audience, NewLogRow, Viewer},
        model::LiveState,
        store,
        views::{LobbyView, PersonView},
    },
};

/// What a command returns: the new cursor and the entities it changed, for
/// the client to apply before the stream echo arrives.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct CommandResponse {
    pub seq: i64,
    pub lobbies: Vec<LobbyView>,
    pub deleted_lobbies: Vec<String>,
    pub people: Vec<PersonView>,
}

/// The result of [`execute`]: the response plus the state after the step.
pub struct Executed {
    pub response: CommandResponse,
    pub state: LiveState,
    /// Ids of lobbies the step created.
    pub created_lobbies: Vec<i32>,
    /// Whether anything at all changed.
    pub changed: bool,
}

impl From<Reject> for Error {
    fn from(r: Reject) -> Self {
        match r {
            Reject::BadInput(e) => Self::BadInput(e),
            Reject::Forbidden(e) => Self::NotPermitted(e),
            Reject::NotFound(e) => Self::NotFound(e),
            Reject::Conflict(e) => Self::Conflict(e),
        }
    }
}

fn db(context: &str) -> impl Fn(sqlx::Error) -> Error + '_ {
    move |e| Error::Controller(format!("{context}: {e}"))
}

/// Longest idempotency key accepted.
const MAX_KEY_LEN: usize = 100;

/// Run one input for an event in a transaction under the event's lock.
///
/// With an idempotency key, a repeat of a command already applied returns
/// the stored response instead of applying it again.
pub async fn execute(
    pool: &PgPool,
    event_id: i32,
    input: Input,
    idempotency_key: Option<&str>,
) -> Result<Executed, Error> {
    let key = idempotency_key
        .map(str::trim)
        .filter(|k| !k.is_empty() && k.len() <= MAX_KEY_LEN);
    let actor = match &input {
        Input::Command { actor, .. } => Some(actor.email.clone()),
        Input::Presence { .. } => Some("steam".to_string()),
        Input::Tick | Input::Materialise { .. } => None,
    };

    let mut tx = pool
        .begin()
        .await
        .map_err(db("Unable to start transaction"))?;
    store::lock(&mut tx, event_id)
        .await
        .map_err(db("Unable to lock the event"))?;

    if let Some(key) = key {
        let stored = sqlx::query_scalar::<_, JsonValue>(
            "SELECT response FROM live_command WHERE event_id = $1 AND idempotency_key = $2",
        )
        .bind(event_id)
        .bind(key)
        .fetch_optional(&mut *tx)
        .await
        .map_err(db("Unable to check the idempotency key"))?;
        if let Some(stored) = stored {
            let response = rocket::serde::json::serde_json::from_value(stored)
                .map_err(|e| Error::Controller(format!("Bad stored response: {e}")))?;
            let state = store::load(&mut tx, event_id)
                .await
                .map_err(db("Unable to load live state"))?
                .ok_or_else(|| Error::NotFound(format!("Event {event_id} not found")))?;
            return Ok(Executed {
                response,
                state,
                created_lobbies: Vec::new(),
                changed: false,
            });
        }
    }

    let before = store::load(&mut tx, event_id)
        .await
        .map_err(db("Unable to load live state"))?
        .ok_or_else(|| Error::NotFound(format!("Event {event_id} not found")))?;
    let mut after = before.clone();
    let now = Utc::now();
    let mut outcome = engine::apply(&mut after, input, now)?;

    let remap = store::persist(&mut tx, &before, &mut after, &mut outcome)
        .await
        .map_err(db("Unable to save live state"))?;
    let deltas = store::delta_rows(&before, &after, &outcome, actor.as_deref(), now);
    let changed = !deltas.rows.is_empty();
    let appended = log::append(&mut tx, event_id, deltas.rows)
        .await
        .map_err(db("Unable to write the live log"))?;
    let seq = match appended.last() {
        Some(row) => row.seq,
        None => log::latest_seq(&mut *tx, event_id)
            .await
            .map_err(db("Unable to read the live log"))?,
    };

    let response = CommandResponse {
        seq,
        lobbies: deltas.lobbies,
        deleted_lobbies: deltas.deleted_lobbies,
        people: deltas.people,
    };
    if let Some(key) = key {
        sqlx::query(
            r"
            INSERT INTO live_command (event_id, idempotency_key, response) VALUES ($1, $2, $3)
            ON CONFLICT DO NOTHING
            ",
        )
        .bind(event_id)
        .bind(key)
        .bind(rocket::serde::json::serde_json::to_value(&response).unwrap_or(JsonValue::Null))
        .execute(&mut *tx)
        .await
        .map_err(db("Unable to store the idempotency key"))?;
    }
    tx.commit().await.map_err(db("Unable to commit"))?;

    Ok(Executed {
        response,
        state: after,
        created_lobbies: remap.lobbies.values().copied().collect(),
        changed,
    })
}

/// Run the time-driven rules for an event now (idempotent). Skipped when a
/// command holds the lock: it ticks inline anyway.
pub async fn tick(pool: &PgPool, event_id: i32) -> Result<bool, Error> {
    let mut tx = pool
        .begin()
        .await
        .map_err(db("Unable to start transaction"))?;
    if !store::try_lock(&mut tx, event_id)
        .await
        .map_err(db("Unable to lock the event"))?
    {
        return Ok(false);
    }
    tx.rollback()
        .await
        .map_err(db("Unable to release the lock"))?;
    let executed = execute(pool, event_id, Input::Tick, None).await?;
    Ok(executed.changed)
}

/// The planner's suggestions for an event as virtual lobbies (§4.5).
pub async fn plan_views(pool: &PgPool, state: &LiveState) -> Vec<LobbyView> {
    let tz = state
        .event
        .timezone
        .parse()
        .unwrap_or(crate::scheduler::DEFAULT_TIMEZONE);
    match crate::controllers::game_schedule::schedule_suggested_games(pool, state.event.id, tz)
        .await
    {
        Ok(entries) => entries
            .iter()
            .map(|e| {
                crate::live::views::suggestion_view(
                    state,
                    e.game_id,
                    &e.game_name,
                    e.start_time,
                    e.duration_minutes,
                )
            })
            .collect(),
        Err(e) => {
            ::log::warn!("live: planner failed for event {}: {e}", state.event.id);
            Vec::new()
        }
    }
}

/// The planner suggestion for `game_id` at `start`, if it is still on the
/// plan (people can only pre-join what the planner actually suggests).
pub async fn find_suggestion(
    pool: &PgPool,
    event_id: i32,
    game_id: i64,
    start: chrono::DateTime<Utc>,
) -> Result<Option<crate::live::engine::Suggestion>, Error> {
    let mut conn = pool
        .acquire()
        .await
        .map_err(db("Unable to get a connection"))?;
    let Some(state) = store::load(&mut conn, event_id)
        .await
        .map_err(db("Unable to load live state"))?
    else {
        return Err(Error::NotFound(format!("Event {event_id} not found")));
    };
    drop(conn);
    Ok(plan_views(pool, &state)
        .await
        .into_iter()
        .find(|l| l.game_id == Some(game_id) && l.start == start)
        .map(|l| crate::live::engine::Suggestion {
            game_id,
            game_name: l.name,
            start: l.start,
            minutes: l.minutes,
        }))
}

/// Recompute the planner's suggestions and, if they changed since last
/// sent, append a `plan` row so every Live screen picks them up. Best effort.
pub async fn refresh_plan(pool: &PgPool, event_id: i32) {
    if let Err(e) = try_refresh_plan(pool, event_id).await {
        ::log::warn!("live: refreshing the plan of event {event_id} failed: {e}");
    }
}

async fn try_refresh_plan(pool: &PgPool, event_id: i32) -> Result<(), Error> {
    let mut conn = pool
        .acquire()
        .await
        .map_err(db("Unable to get a connection"))?;
    let Some(state) = store::load(&mut conn, event_id)
        .await
        .map_err(db("Unable to load live state"))?
    else {
        return Ok(());
    };
    drop(conn);
    let lobbies = plan_views(pool, &state).await;
    let payload = rocket::serde::json::json!({ "lobbies": lobbies });
    let hash = format!("{:x}", md5::compute(payload.to_string().as_bytes()));

    let mut tx = pool
        .begin()
        .await
        .map_err(db("Unable to start transaction"))?;
    let changed = sqlx::query(
        r"
        INSERT INTO live_runtime (event_id, plan_hash, plan_checked_at) VALUES ($1, $2, NOW())
        ON CONFLICT (event_id) DO UPDATE SET plan_hash = $2, plan_checked_at = NOW()
        WHERE live_runtime.plan_hash IS DISTINCT FROM $2
        ",
    )
    .bind(event_id)
    .bind(&hash)
    .execute(&mut *tx)
    .await
    .map_err(db("Unable to record the plan"))?
    .rows_affected()
        > 0;
    if changed {
        log::append(
            &mut tx,
            event_id,
            vec![NewLogRow::new("plan", payload).actor("system")],
        )
        .await
        .map_err(db("Unable to write the plan"))?;
    }
    tx.commit().await.map_err(db("Unable to commit the plan"))?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct FloorRoom {
    pub id: i32,
    pub name: String,
    pub sort_order: i32,
    pub grid_rows: Option<i32>,
    pub features: JsonValue,
}

#[derive(Debug, Clone, Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct FloorSeat {
    pub id: i32,
    pub room_id: i32,
    pub label: String,
    pub name: Option<String>,
    pub x: f64,
    pub y: f64,
    pub grid_col: Option<i32>,
    pub grid_row: Option<i32>,
    /// Who sits here (by pid), if reserved.
    pub pid: Option<String>,
}

#[derive(Debug, Clone, Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct Floor {
    pub rooms: Vec<FloorRoom>,
    pub seats: Vec<FloorSeat>,
}

/// Rooms and seats with who sits where.
pub async fn floor(pool: &PgPool, state: &LiveState) -> Floor {
    let event_id = state.event.id;
    let rooms = crate::repositories::room::get_all(pool, event_id)
        .await
        .unwrap_or_default();
    let seats = crate::repositories::seat::get_all_by_event(pool, event_id)
        .await
        .unwrap_or_default();
    let sitter = |seat_id: i32| {
        state
            .people
            .values()
            .find(|p| p.seat.as_ref().is_some_and(|s| s.seat_id == seat_id))
            .map(|p| crate::live::model::pid(&p.email))
    };
    Floor {
        rooms: rooms
            .into_iter()
            .map(|r| FloorRoom {
                id: r.id,
                name: r.name,
                sort_order: r.sort_order,
                grid_rows: r.grid_rows,
                features: r.features,
            })
            .collect(),
        seats: seats
            .into_iter()
            .map(|s| FloorSeat {
                pid: sitter(s.id),
                id: s.id,
                room_id: s.room_id,
                label: s.label,
                name: s.name,
                x: s.x,
                y: s.y,
                grid_col: s.grid_col,
                grid_row: s.grid_row,
            })
            .collect(),
    }
}

/// Everything a client needs to render Live, plus the stream cursor.
#[derive(Debug, Clone, Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct Snapshot {
    /// Resume the stream after this seq.
    pub seq: i64,
    pub server_time: chrono::DateTime<Utc>,
    pub is_admin: bool,
    /// Local-only simulators (presence, clock) are enabled on this server.
    pub dev_tools: bool,
    pub event: EventView,
    pub me: Option<MeView>,
    pub people: Vec<PersonView>,
    /// Stored lobbies plus the planner's suggestions (`virtual: true`).
    pub lobbies: Vec<LobbyView>,
    pub votes: Vec<JsonValue>,
    /// Recent feed entries and admin posts, oldest first.
    pub feed: Vec<JsonValue>,
    pub floor: Floor,
    /// Admins only: people Steam shows playing who haven't checked in.
    pub admin_queue: Vec<crate::live::views::AdminQueueItem>,
}

#[derive(Debug, Clone, Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct MeView {
    pub pid: String,
}

#[derive(Debug, Clone, Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct EventView {
    pub id: i32,
    pub title: String,
    pub time_begin: chrono::DateTime<Utc>,
    pub time_end: chrono::DateTime<Utc>,
    pub discord_invite_url: Option<String>,
    pub timezone: String,
    /// Admins only: the wall-board link token.
    pub wallboard_token: Option<String>,
}

/// Whether local-only developer tools are on (`LIVE_DEV_TOOLS=1`).
pub fn dev_tools() -> bool {
    std::env::var("LIVE_DEV_TOOLS").is_ok_and(|v| v == "1" || v == "true")
}

/// The snapshot for a viewer. Ticks first, so it is never stale.
pub async fn snapshot(pool: &PgPool, event_id: i32, viewer: &Viewer) -> Result<Snapshot, Error> {
    // Inline tick (§3.6). A failure here must not block reading.
    if let Err(e) = tick(pool, event_id).await {
        ::log::warn!("live: inline tick for event {event_id} failed: {e}");
    }
    // Read the cursor before the state: anything newer is replayed, and
    // replays are idempotent upserts.
    let seq = log::latest_seq(pool, event_id)
        .await
        .map_err(db("Unable to read the live log"))?;
    let mut conn = pool
        .acquire()
        .await
        .map_err(db("Unable to get a connection"))?;
    let state = store::load(&mut conn, event_id)
        .await
        .map_err(db("Unable to load live state"))?
        .ok_or_else(|| Error::NotFound(format!("Event {event_id} not found")))?;
    let feed = log::feed(&mut *conn, event_id, 200)
        .await
        .map_err(db("Unable to read the feed"))?;
    drop(conn);

    let mut lobbies: Vec<LobbyView> = crate::live::views::lobby_views(&state)
        .into_values()
        .collect();
    lobbies.extend(plan_views(pool, &state).await);

    Ok(Snapshot {
        seq,
        server_time: Utc::now(),
        is_admin: viewer.is_admin(),
        dev_tools: dev_tools(),
        event: EventView {
            id: state.event.id,
            title: state.event.title.clone(),
            time_begin: state.event.time_begin,
            time_end: state.event.time_end,
            discord_invite_url: state.event.discord_invite_url.clone(),
            timezone: state.event.timezone.clone(),
            wallboard_token: if viewer.is_admin() {
                state.event.wallboard_token.clone()
            } else {
                None
            },
        },
        me: viewer.email().map(|e| MeView {
            pid: crate::live::model::pid(e),
        }),
        people: crate::live::views::people_views(&state, Utc::now())
            .into_values()
            .collect(),
        lobbies,
        votes: Vec::new(),
        feed: feed
            .iter()
            .filter(|row| viewer.can_see(row.audience.as_deref()))
            .map(crate::live::stream::row_json)
            .collect(),
        floor: floor(pool, &state).await,
        admin_queue: if viewer.is_admin() {
            crate::live::views::admin_queue(&state)
        } else {
            Vec::new()
        },
    })
}

/// Admin settings for Live on an event.
pub struct Settings {
    pub discord_invite_url: Option<String>,
    pub timezone: Option<String>,
    /// Make a new wall-board link (the old one stops working).
    pub rotate_wallboard: bool,
}

/// Update an event's Live settings and tell every screen.
pub async fn update_settings(
    pool: &PgPool,
    event_id: i32,
    admin_email: &str,
    settings: Settings,
) -> Result<EventView, Error> {
    if let Some(tz) = &settings.timezone {
        tz.parse::<chrono_tz::Tz>()
            .map_err(|_| Error::BadInput(format!("Unknown time zone \"{tz}\"")))?;
    }
    let discord = settings
        .discord_invite_url
        .as_deref()
        .map(str::trim)
        .map(ToString::to_string);
    if let Some(url) = discord.as_deref().filter(|u| !u.is_empty()) {
        if !url.starts_with("https://") {
            return Err(Error::BadInput(
                "The Discord invite must be an https:// link".to_string(),
            ));
        }
    }
    let token = settings
        .rotate_wallboard
        .then(crate::live::token::random_token);

    let mut tx = pool
        .begin()
        .await
        .map_err(db("Unable to start transaction"))?;
    let row = sqlx::query_as::<
        _,
        (
            i32,
            String,
            chrono::DateTime<Utc>,
            chrono::DateTime<Utc>,
            Option<String>,
            String,
            Option<String>,
        ),
    >(
        r"
        UPDATE event SET
            discord_invite_url = CASE WHEN $2 THEN NULLIF($3, '') ELSE discord_invite_url END,
            timezone = COALESCE($4, timezone),
            wallboard_token = COALESCE($5, wallboard_token),
            last_modified = NOW()
        WHERE id = $1
        RETURNING id, title, time_begin, time_end, discord_invite_url, timezone, wallboard_token
        ",
    )
    .bind(event_id)
    .bind(discord.is_some())
    .bind(discord.clone().unwrap_or_default())
    .bind(&settings.timezone)
    .bind(&token)
    .fetch_optional(&mut *tx)
    .await
    .map_err(db("Unable to save the settings"))?
    .ok_or_else(|| Error::NotFound(format!("Event {event_id} not found")))?;
    let view = EventView {
        id: row.0,
        title: row.1,
        time_begin: row.2,
        time_end: row.3,
        discord_invite_url: row.4,
        timezone: row.5,
        wallboard_token: row.6,
    };
    let mut public = view.clone();
    public.wallboard_token = None;
    log::append(
        &mut tx,
        event_id,
        vec![NewLogRow::new("event", &public).actor(format!("admin:{admin_email}"))],
    )
    .await
    .map_err(db("Unable to write the live log"))?;
    tx.commit().await.map_err(db("Unable to commit"))?;
    Ok(view)
}

/// The email of the invitee with this pid.
pub async fn email_for_pid(pool: &PgPool, event_id: i32, pid_value: &str) -> Result<String, Error> {
    let emails =
        sqlx::query_scalar::<_, String>("SELECT email FROM invitation WHERE event_id = $1")
            .bind(event_id)
            .fetch_all(pool)
            .await
            .map_err(db("Unable to read invitations"))?;
    emails
        .into_iter()
        .map(|e| crate::util::normalise_email(&e))
        .find(|e| crate::live::model::pid(e) == pid_value)
        .ok_or_else(|| Error::NotFound("No such person at this event".to_string()))
}

/// Claim a background job for an event if it hasn't run in `every`, so only
/// one instance does it (DESIGN.md §3.6, §3.7).
async fn claim(pool: &PgPool, event_id: i32, column: &str, every: std::time::Duration) -> bool {
    let sql = format!(
        r"
        INSERT INTO live_runtime (event_id, {column}) VALUES ($1, NOW())
        ON CONFLICT (event_id) DO UPDATE SET {column} = NOW()
        WHERE live_runtime.{column} < NOW() - make_interval(secs => $2)
        "
    );
    sqlx::query(&sql)
        .bind(event_id)
        .bind(every.as_secs_f64())
        .execute(pool)
        .await
        .is_ok_and(|r| r.rows_affected() > 0)
}

/// Is this a real Steam key (not the local placeholder)?
pub fn steam_enabled(steam_api_key: &str) -> bool {
    !steam_api_key.is_empty() && steam_api_key != "test_steam_key"
}

/// Poll Steam for the presence of everyone attending with a Steam id
/// (DESIGN.md §3.7): one call per 100 people.
pub async fn poll_steam(pool: &PgPool, steam_api_key: &str, event_id: i32) -> Result<(), Error> {
    let people = sqlx::query_as::<_, (String, i64)>(
        r"
        SELECT i.email, p.steam_id
        FROM invitation i
        JOIN profiles p ON LOWER(p.email) = LOWER(i.email)
        WHERE i.event_id = $1 AND i.response IN ('yes', 'maybe') AND p.steam_id <> 0
        ",
    )
    .bind(event_id)
    .fetch_all(pool)
    .await
    .map_err(db("Unable to read Steam ids"))?;
    if people.is_empty() {
        return Ok(());
    }
    let ids: Vec<i64> = people.iter().map(|(_, id)| *id).collect();
    let mut samples = Vec::new();
    for chunk in ids.chunks(crate::repositories::steam_api::MAX_SUMMARY_IDS) {
        let found = crate::repositories::steam_api::get_player_summaries(steam_api_key, chunk)
            .await
            .map_err(|e| Error::Upstream(format!("Steam presence failed: {e}")))?;
        for p in found {
            for (email, _) in people.iter().filter(|(_, id)| *id == p.steam_id) {
                samples.push(crate::live::engine::PresenceSample {
                    email: crate::util::normalise_email(email),
                    game_id: p.game_id,
                    game_name: p.game_name.clone(),
                    persona_state: p.persona_state,
                    visibility: p.visibility,
                });
            }
        }
    }
    execute(
        pool,
        event_id,
        Input::Presence {
            samples,
            immediate: false,
        },
        None,
    )
    .await
    .map(|_| ())
}

/// Store the planner's suggestions that are starting now, then send the new
/// plan if it changed.
pub async fn check_plan(pool: &PgPool, event_id: i32) -> Result<(), Error> {
    let mut conn = pool
        .acquire()
        .await
        .map_err(db("Unable to get a connection"))?;
    let Some(state) = store::load(&mut conn, event_id)
        .await
        .map_err(db("Unable to load live state"))?
    else {
        return Ok(());
    };
    drop(conn);
    let now = Utc::now();
    if now >= state.event.time_begin {
        let due: Vec<crate::live::engine::Suggestion> = plan_views(pool, &state)
            .await
            .into_iter()
            .filter(|l| {
                l.start <= now + chrono::Duration::minutes(2)
                    && l.start + chrono::Duration::minutes(i64::from(l.minutes)) > now
            })
            .filter_map(|l| {
                Some(crate::live::engine::Suggestion {
                    game_id: l.game_id?,
                    game_name: l.name,
                    start: l.start,
                    minutes: l.minutes,
                })
            })
            .collect();
        if !due.is_empty() {
            execute(
                pool,
                event_id,
                Input::Materialise { suggestions: due },
                None,
            )
            .await?;
        }
    }
    refresh_plan(pool, event_id).await;
    Ok(())
}

/// One round of background work for an event: tick now, poll Steam every
/// 30s and check the plan every minute (each claimed, so instances share).
pub async fn background(pool: &PgPool, steam_api_key: &str, event_id: i32) {
    if let Err(e) = tick(pool, event_id).await {
        ::log::warn!("live: tick of event {event_id} failed: {e}");
    }
    if steam_enabled(steam_api_key)
        && claim(
            pool,
            event_id,
            "steam_polled_at",
            std::time::Duration::from_secs(28),
        )
        .await
    {
        if let Err(e) = poll_steam(pool, steam_api_key, event_id).await {
            ::log::warn!("live: Steam poll of event {event_id} failed: {e}");
        }
    }
    if claim(
        pool,
        event_id,
        "plan_checked_at",
        std::time::Duration::from_secs(55),
    )
    .await
    {
        if let Err(e) = check_plan(pool, event_id).await {
            ::log::warn!("live: plan check of event {event_id} failed: {e}");
        }
    }
}

/// Events in their live window now (for the Cloud Scheduler backstop).
pub async fn live_events(pool: &PgPool) -> Result<Vec<i32>, Error> {
    sqlx::query_scalar::<_, i32>(
        r"
        SELECT id FROM event
        WHERE time_begin - INTERVAL '2 hours' <= NOW() AND time_end + INTERVAL '1 hour' >= NOW()
        ",
    )
    .fetch_all(pool)
    .await
    .map_err(db("Unable to list live events"))
}

/// The actor for a signed-in user.
pub fn actor(email: &str) -> Actor {
    Actor {
        email: email.to_string(),
        admin: is_admin(email),
    }
}

/// Longest admin post.
pub const MAX_POST_LEN: usize = 280;

/// The viewer for a signed-in user: invited gamers and admins only.
pub async fn viewer_for(pool: &PgPool, event_id: i32, email: &str) -> Result<Viewer, Error> {
    let admin = is_admin(email);
    if !admin {
        ensure_user_invited(pool, event_id, email).await?;
    }
    Ok(Viewer::Gamer {
        email: email.to_string(),
        admin,
    })
}

/// How long an admin post stays on screen.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PostTtl {
    TenMinutes,
    UntilDismissed,
}

impl PostTtl {
    pub fn parse(value: &str) -> Result<Self, Error> {
        match value {
            "10m" => Ok(Self::TenMinutes),
            "dismiss" => Ok(Self::UntilDismissed),
            other => Err(Error::BadInput(format!(
                "Unknown ttl \"{other}\", expected 10m or dismiss"
            ))),
        }
    }

    const fn as_str(self) -> &'static str {
        match self {
            Self::TenMinutes => "10m",
            Self::UntilDismissed => "dismiss",
        }
    }
}

/// Post a message to everyone at the event (an amber admin toast).
pub async fn post_to_everyone(
    pool: &PgPool,
    event_id: i32,
    admin_email: &str,
    text: &str,
    ttl: PostTtl,
    tv: bool,
) -> Result<i64, Error> {
    let text = text.trim();
    if text.is_empty() {
        return Err(Error::BadInput("A post needs some text".to_string()));
    }
    if text.chars().count() > MAX_POST_LEN {
        return Err(Error::BadInput(format!(
            "A post can be at most {MAX_POST_LEN} characters"
        )));
    }

    let mut tx = pool
        .begin()
        .await
        .map_err(|e| Error::Controller(format!("Unable to start transaction: {e}")))?;
    let rows = log::append(
        &mut tx,
        event_id,
        vec![NewLogRow::new(
            "toast.admin",
            rocket::serde::json::json!({
                "text": text,
                "ttl": ttl.as_str(),
                "tv": tv,
            }),
        )
        .actor(format!("admin:{admin_email}"))
        .audience(Audience::Everyone)],
    )
    .await
    .map_err(|e| Error::Controller(format!("Unable to write the post: {e}")))?;
    tx.commit()
        .await
        .map_err(|e| Error::Controller(format!("Unable to commit the post: {e}")))?;

    crate::util::log_audit(
        pool,
        Some(admin_email.to_string()),
        "live.post".to_string(),
        "event".to_string(),
        Some(event_id.to_string()),
        Some(rocket::serde::json::json!({ "text": text })),
    )
    .await;

    Ok(rows.last().map_or(0, |r| r.seq))
}
