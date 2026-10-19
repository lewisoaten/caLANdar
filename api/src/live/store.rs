//! Loading a [`LiveState`] and writing back what the engine changed.
//!
//! The engine works on a copy; [`persist`] diffs it against the state as
//! loaded and writes only what changed. New rows carry negative temporary
//! ids until they are inserted; [`persist`] swaps them for the real ones
//! everywhere. [`delta_rows`] then compares the client views before and
//! after to produce the stream rows.

use std::collections::{BTreeMap, HashMap};

use chrono::{DateTime, Utc};
use rocket::serde::json::serde_json::{self, json, Value as JsonValue};
use sqlx::PgConnection;

use super::{
    engine::{FeedEntry, Outcome},
    log::{Audience, NewLogRow},
    model::{
        pid, CheckIn, EventInfo, Food, GameDefaults, LiveState, Lobby, LobbyKind, LobbySource,
        LobbyStatus, Member, Person, Prejoin, Presence, Rsvp, SeatRef, Team, Typical, Via,
    },
    views::{self, LobbyView, PersonView},
};

/// Advisory lock class for per-event live mutations (`pg_advisory_xact_lock(class, event)`).
const LOCK_CLASS: i32 = 4242;

/// Serialise every mutation of an event for the rest of the transaction.
pub async fn lock(conn: &mut PgConnection, event_id: i32) -> Result<(), sqlx::Error> {
    sqlx::query("SELECT pg_advisory_xact_lock($1, $2)")
        .bind(LOCK_CLASS)
        .bind(event_id)
        .execute(conn)
        .await
        .map(|_| ())
}

/// Like [`lock`], but give up at once if someone else holds it.
pub async fn try_lock(conn: &mut PgConnection, event_id: i32) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar::<_, bool>("SELECT pg_try_advisory_xact_lock($1, $2)")
        .bind(LOCK_CLASS)
        .bind(event_id)
        .fetch_one(conn)
        .await
}

#[derive(sqlx::FromRow)]
struct EventRow {
    id: i32,
    title: String,
    time_begin: DateTime<Utc>,
    time_end: DateTime<Utc>,
    discord_invite_url: Option<String>,
    timezone: String,
    wallboard_token: Option<String>,
}

#[derive(sqlx::FromRow)]
struct PersonRow {
    email: String,
    handle: Option<String>,
    rsvp: Option<String>,
    attendance: Option<Vec<u8>>,
    steam_id: Option<i64>,
    seat_id: Option<i32>,
    seat_label: Option<String>,
    room_id: Option<i32>,
}

#[derive(sqlx::FromRow)]
struct LobbyRow {
    id: i32,
    kind: String,
    game_id: Option<i64>,
    game_name: Option<String>,
    food: Option<JsonValue>,
    status: String,
    source: String,
    start_time: DateTime<Utc>,
    duration_minutes: i32,
    planned_start: Option<DateTime<Utc>>,
    planned_minutes: Option<i32>,
    actual_start: Option<DateTime<Utc>>,
    actual_end: Option<DateTime<Utc>>,
    max_players: Option<i32>,
    teams: Option<JsonValue>,
    proposed_by: Option<String>,
    created_by_vote: Option<i64>,
    grace_until: Option<DateTime<Utc>>,
    grace_locked: bool,
    hold_remaining_s: Option<i32>,
    empty_since: Option<DateTime<Utc>>,
    is_pinned: bool,
    created_at: DateTime<Utc>,
    version: i32,
}

#[derive(sqlx::FromRow)]
struct DefaultsRow {
    game_id: i64,
    max_players: Option<i32>,
    teams: Option<JsonValue>,
    duration_minutes: Option<i32>,
    set_by: Option<String>,
}

#[derive(sqlx::FromRow)]
struct MemberRow {
    id: i64,
    lobby_id: i32,
    email: String,
    team: Option<String>,
    via: String,
    joined_at: DateTime<Utc>,
    left_at: Option<DateTime<Utc>>,
    left_reason: Option<String>,
    manual_expires_at: Option<DateTime<Utc>>,
}

#[derive(sqlx::FromRow)]
struct PrejoinRow {
    lobby_id: i32,
    email: String,
    team: Option<String>,
    random_team: bool,
    created_at: DateTime<Utc>,
    dropped_at: Option<DateTime<Utc>>,
    drop_reason: Option<String>,
}

#[derive(sqlx::FromRow)]
struct PresenceRow {
    email: String,
    game_id: Option<i64>,
    game_name: Option<String>,
    persona_state: i32,
    visibility: i32,
    observed_at: Option<DateTime<Utc>>,
    pending_game_id: Option<i64>,
    pending_game_name: Option<String>,
    pending_since: Option<DateTime<Utc>>,
    afk_since: Option<DateTime<Utc>>,
    afk_noted: bool,
    ignore_game_id: Option<i64>,
    switch_lobby_id: Option<i32>,
    switch_grace_until: Option<DateTime<Utc>>,
    private_hint_sent: bool,
}

#[derive(sqlx::FromRow)]
struct TypicalRow {
    game_id: i64,
    minutes: f64,
    sessions: i64,
}

fn parse_teams(value: Option<JsonValue>) -> Option<Vec<Team>> {
    value.and_then(|v| serde_json::from_value(v).ok())
}

fn lobby_from_row(row: LobbyRow) -> Lobby {
    let food: Option<Food> = row.food.and_then(|v| serde_json::from_value(v).ok());
    let name = row
        .game_name
        .clone()
        .or_else(|| food.as_ref().map(|f| f.name.clone()))
        .unwrap_or_default();
    Lobby {
        id: row.id,
        kind: LobbyKind::parse(&row.kind).unwrap_or(LobbyKind::Game),
        game_id: row.game_id,
        name,
        food,
        status: LobbyStatus::parse(&row.status).unwrap_or(LobbyStatus::Planned),
        source: LobbySource::parse(&row.source).unwrap_or(LobbySource::Plan),
        start: row.start_time,
        minutes: row.duration_minutes,
        planned_start: row.planned_start,
        planned_minutes: row.planned_minutes,
        actual_start: row.actual_start,
        actual_end: row.actual_end,
        max_players: row.max_players,
        teams: parse_teams(row.teams),
        proposed_by: row.proposed_by,
        created_by_vote: row.created_by_vote,
        grace_until: row.grace_until,
        grace_locked: row.grace_locked,
        hold_remaining_s: row.hold_remaining_s,
        empty_since: row.empty_since,
        is_pinned: row.is_pinned,
        created_at: row.created_at,
        version: row.version,
    }
}

/// Load the event's live state. `None` if the event doesn't exist.
pub async fn load(
    conn: &mut PgConnection,
    event_id: i32,
) -> Result<Option<LiveState>, sqlx::Error> {
    let Some(event) = sqlx::query_as::<_, EventRow>(
        r"
        SELECT id, title, time_begin, time_end, discord_invite_url, timezone, wallboard_token
        FROM event WHERE id = $1
        ",
    )
    .bind(event_id)
    .fetch_optional(&mut *conn)
    .await?
    else {
        return Ok(None);
    };

    let mut state = LiveState::new(EventInfo {
        id: event.id,
        title: event.title,
        time_begin: event.time_begin,
        time_end: event.time_end,
        discord_invite_url: event.discord_invite_url,
        timezone: event.timezone,
        wallboard_token: event.wallboard_token,
    });

    let people = sqlx::query_as::<_, PersonRow>(
        r"
        SELECT
            i.email,
            i.handle,
            i.response::text AS rsvp,
            i.attendance,
            NULLIF(p.steam_id, 0) AS steam_id,
            s.id AS seat_id,
            s.label AS seat_label,
            s.room_id
        FROM invitation i
        LEFT JOIN profiles p ON LOWER(p.email) = LOWER(i.email)
        LEFT JOIN seat_reservation sr
            ON sr.event_id = i.event_id AND LOWER(sr.invitation_email) = LOWER(i.email)
        LEFT JOIN seat s ON s.id = sr.seat_id
        WHERE i.event_id = $1
        ",
    )
    .bind(event_id)
    .fetch_all(&mut *conn)
    .await?;
    for row in people {
        let email = crate::util::normalise_email(&row.email);
        let rsvp = match row.rsvp.as_deref() {
            Some("yes") => Some(Rsvp::Yes),
            Some("maybe") => Some(Rsvp::Maybe),
            Some("no") => Some(Rsvp::No),
            _ => None,
        };
        let seat = match (row.seat_id, row.seat_label, row.room_id) {
            (Some(seat_id), Some(label), Some(room_id)) => Some(SeatRef {
                seat_id,
                label,
                room_id,
            }),
            _ => None,
        };
        state.people.insert(
            email.clone(),
            Person {
                email,
                handle: row.handle,
                rsvp,
                attendance: row.attendance.unwrap_or_default(),
                steam_id: row.steam_id,
                seat,
            },
        );
    }

    let checkins = sqlx::query_as::<_, (String, DateTime<Utc>, String)>(
        "SELECT email, checked_in_at, by_email FROM live_checkin WHERE event_id = $1",
    )
    .bind(event_id)
    .fetch_all(&mut *conn)
    .await?;
    for (email, at, by) in checkins {
        state
            .checkins
            .insert(email.clone(), CheckIn { email, at, by });
    }

    let lobbies = sqlx::query_as::<_, LobbyRow>(
        r"
        SELECT
            egs.id, egs.kind, egs.game_id, sg.name AS game_name, egs.food, egs.status,
            egs.source, egs.start_time, egs.duration_minutes, egs.planned_start,
            egs.planned_minutes, egs.actual_start, egs.actual_end, egs.max_players, egs.teams,
            egs.proposed_by, egs.created_by_vote, egs.grace_until, egs.grace_locked,
            egs.hold_remaining_s, egs.empty_since, egs.is_pinned, egs.created_at, egs.version
        FROM event_game_schedule egs
        LEFT JOIN steam_game sg ON sg.appid = egs.game_id
        WHERE egs.event_id = $1 AND egs.status <> 'removed'
        ",
    )
    .bind(event_id)
    .fetch_all(&mut *conn)
    .await?;
    for row in lobbies {
        let lobby = lobby_from_row(row);
        state.lobbies.insert(lobby.id, lobby);
    }
    load_presence(&mut *conn, &mut state).await?;

    // Defaults and learned lengths for the games on this event's schedule
    // and suggestion list.
    let game_ids: Vec<i64> = sqlx::query_scalar::<_, i64>(
        r"
        SELECT game_id FROM event_game_schedule WHERE event_id = $1 AND game_id IS NOT NULL
        UNION
        SELECT game_id FROM event_game WHERE event_id = $1
        ",
    )
    .bind(event_id)
    .fetch_all(&mut *conn)
    .await?;
    load_game_knowledge(
        &mut *conn,
        &game_ids,
        &mut state.defaults,
        &mut state.typical,
    )
    .await?;

    Ok(Some(state))
}

/// Members, pre-joins and presence of an event's lobbies.
async fn load_presence(conn: &mut PgConnection, state: &mut LiveState) -> Result<(), sqlx::Error> {
    let event_id = state.event.id;
    let members = sqlx::query_as::<_, MemberRow>(
        r"
        SELECT m.id, m.lobby_id, m.email, m.team, m.via, m.joined_at, m.left_at,
            m.left_reason, m.manual_expires_at
        FROM lobby_member m
        JOIN event_game_schedule egs ON egs.id = m.lobby_id
        WHERE egs.event_id = $1 AND egs.status <> 'removed'
        ",
    )
    .bind(event_id)
    .fetch_all(&mut *conn)
    .await?;
    for row in members {
        state.members.insert(
            row.id,
            Member {
                id: row.id,
                lobby_id: row.lobby_id,
                email: row.email,
                team: row.team,
                via: Via::parse(&row.via).unwrap_or(Via::Manual),
                joined_at: row.joined_at,
                left_at: row.left_at,
                left_reason: row.left_reason,
                manual_expires_at: row.manual_expires_at,
            },
        );
    }

    let prejoins = sqlx::query_as::<_, PrejoinRow>(
        r"
        SELECT p.lobby_id, p.email, p.team, p.random_team, p.created_at, p.dropped_at,
            p.drop_reason
        FROM lobby_prejoin p
        JOIN event_game_schedule egs ON egs.id = p.lobby_id
        WHERE egs.event_id = $1 AND egs.status <> 'removed'
        ",
    )
    .bind(event_id)
    .fetch_all(&mut *conn)
    .await?;
    for row in prejoins {
        state.prejoins.insert(
            (row.lobby_id, row.email.clone()),
            Prejoin {
                lobby_id: row.lobby_id,
                email: row.email,
                team: row.team,
                random_team: row.random_team,
                created_at: row.created_at,
                dropped_at: row.dropped_at,
                drop_reason: row.drop_reason,
            },
        );
    }

    let presence = sqlx::query_as::<_, PresenceRow>(
        r"
        SELECT email, game_id, game_name, persona_state, visibility, observed_at,
            pending_game_id, pending_game_name, pending_since, afk_since, afk_noted,
            ignore_game_id, switch_lobby_id, switch_grace_until, private_hint_sent
        FROM live_presence WHERE event_id = $1
        ",
    )
    .bind(event_id)
    .fetch_all(&mut *conn)
    .await?;
    for row in presence {
        state.presence.insert(
            row.email.clone(),
            Presence {
                email: row.email,
                game_id: row.game_id,
                game_name: row.game_name,
                persona_state: row.persona_state,
                visibility: row.visibility,
                observed_at: row.observed_at,
                pending_game_id: row.pending_game_id,
                pending_game_name: row.pending_game_name,
                pending_since: row.pending_since,
                afk_since: row.afk_since,
                afk_noted: row.afk_noted,
                ignore_game_id: row.ignore_game_id,
                switch_lobby_id: row.switch_lobby_id,
                switch_grace_until: row.switch_grace_until,
                private_hint_sent: row.private_hint_sent,
            },
        );
    }
    Ok(())
}

/// Saved defaults and learned typical lengths for some games (§5.6).
pub async fn load_game_knowledge(
    conn: &mut PgConnection,
    game_ids: &[i64],
    defaults: &mut BTreeMap<i64, GameDefaults>,
    typical: &mut BTreeMap<i64, Typical>,
) -> Result<(), sqlx::Error> {
    if game_ids.is_empty() {
        return Ok(());
    }
    let rows = sqlx::query_as::<_, DefaultsRow>(
        "SELECT game_id, max_players, teams, duration_minutes, set_by FROM game_lobby_defaults WHERE game_id = ANY($1)",
    )
    .bind(game_ids)
    .fetch_all(&mut *conn)
    .await?;
    for row in rows {
        defaults.insert(
            row.game_id,
            GameDefaults {
                max_players: row.max_players,
                teams: parse_teams(row.teams),
                duration_minutes: row.duration_minutes,
                set_by: row.set_by,
            },
        );
    }

    // Learned from played sessions of at least 15 minutes, across events.
    let played = sqlx::query_as::<_, TypicalRow>(
        r"
        SELECT
            game_id AS game_id,
            (percentile_cont(0.5) WITHIN GROUP (
                ORDER BY EXTRACT(EPOCH FROM actual_end - actual_start) / 60
            ))::float8 AS minutes,
            COUNT(*) AS sessions
        FROM event_game_schedule
        WHERE game_id = ANY($1)
            AND status = 'done'
            AND actual_start IS NOT NULL AND actual_end IS NOT NULL
            AND actual_end - actual_start >= INTERVAL '15 minutes'
        GROUP BY game_id
        HAVING COUNT(*) >= 2
        ",
    )
    .bind(game_ids)
    .fetch_all(&mut *conn)
    .await?;
    for row in played {
        typical.insert(
            row.game_id,
            Typical {
                minutes: super::model::round_typical(row.minutes),
                sessions: row.sessions,
            },
        );
    }

    // Fallback: the median of what admins planned for the game before.
    let planned = sqlx::query_as::<_, TypicalRow>(
        r"
        SELECT
            game_id AS game_id,
            (percentile_cont(0.5) WITHIN GROUP (
                ORDER BY COALESCE(planned_minutes, duration_minutes)
            ))::float8 AS minutes,
            0::bigint AS sessions
        FROM event_game_schedule
        WHERE game_id = ANY($1) AND source = 'plan' AND status <> 'removed'
        GROUP BY game_id
        ",
    )
    .bind(game_ids)
    .fetch_all(&mut *conn)
    .await?;
    for row in planned {
        let has_explicit = defaults
            .get(&row.game_id)
            .is_some_and(|d| d.duration_minutes.is_some());
        if !has_explicit {
            typical.entry(row.game_id).or_insert_with(|| Typical {
                minutes: super::model::round_typical(row.minutes),
                sessions: 0,
            });
        }
    }
    Ok(())
}

/// Temporary id → real id, for everything the step inserted.
#[derive(Debug, Default, Clone)]
pub struct Remap {
    pub lobbies: HashMap<i32, i32>,
}

impl Remap {
    pub fn lobby(&self, id: i32) -> i32 {
        self.lobbies.get(&id).copied().unwrap_or(id)
    }
}

fn teams_json(teams: Option<&Vec<Team>>) -> Option<JsonValue> {
    teams.map(|t| serde_json::to_value(t).unwrap_or(JsonValue::Null))
}

async fn insert_lobby(
    conn: &mut PgConnection,
    event_id: i32,
    l: &Lobby,
) -> Result<i32, sqlx::Error> {
    sqlx::query_scalar::<_, i32>(
        r"
        INSERT INTO event_game_schedule (
            event_id, game_id, start_time, duration_minutes, is_pinned, kind, food, status,
            source, planned_start, planned_minutes, actual_start, actual_end, max_players,
            teams, proposed_by, created_by_vote, grace_until, grace_locked, hold_remaining_s,
            empty_since, version, created_at, last_modified
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
            $18, $19, $20, $21, $22, $23, NOW())
        RETURNING id
        ",
    )
    .bind(event_id)
    .bind(l.game_id)
    .bind(l.start)
    .bind(l.minutes)
    .bind(l.is_pinned)
    .bind(l.kind.as_str())
    .bind(
        l.food
            .as_ref()
            .map(|f| serde_json::to_value(f).unwrap_or(JsonValue::Null)),
    )
    .bind(l.status.as_str())
    .bind(l.source.as_str())
    .bind(l.planned_start)
    .bind(l.planned_minutes)
    .bind(l.actual_start)
    .bind(l.actual_end)
    .bind(l.max_players)
    .bind(teams_json(l.teams.as_ref()))
    .bind(&l.proposed_by)
    .bind(l.created_by_vote)
    .bind(l.grace_until)
    .bind(l.grace_locked)
    .bind(l.hold_remaining_s)
    .bind(l.empty_since)
    .bind(l.version)
    .bind(l.created_at)
    .fetch_one(conn)
    .await
}

async fn update_lobby(conn: &mut PgConnection, l: &Lobby) -> Result<(), sqlx::Error> {
    sqlx::query(
        r"
        UPDATE event_game_schedule SET
            game_id = $2, start_time = $3, duration_minutes = $4, is_pinned = $5, kind = $6,
            food = $7, status = $8, source = $9, planned_start = $10, planned_minutes = $11,
            actual_start = $12, actual_end = $13, max_players = $14, teams = $15,
            proposed_by = $16, created_by_vote = $17, grace_until = $18, grace_locked = $19,
            hold_remaining_s = $20, empty_since = $21, version = $22, last_modified = NOW()
        WHERE id = $1
        ",
    )
    .bind(l.id)
    .bind(l.game_id)
    .bind(l.start)
    .bind(l.minutes)
    .bind(l.is_pinned)
    .bind(l.kind.as_str())
    .bind(
        l.food
            .as_ref()
            .map(|f| serde_json::to_value(f).unwrap_or(JsonValue::Null)),
    )
    .bind(l.status.as_str())
    .bind(l.source.as_str())
    .bind(l.planned_start)
    .bind(l.planned_minutes)
    .bind(l.actual_start)
    .bind(l.actual_end)
    .bind(l.max_players)
    .bind(teams_json(l.teams.as_ref()))
    .bind(&l.proposed_by)
    .bind(l.created_by_vote)
    .bind(l.grace_until)
    .bind(l.grace_locked)
    .bind(l.hold_remaining_s)
    .bind(l.empty_since)
    .bind(l.version)
    .execute(conn)
    .await
    .map(|_| ())
}

/// Write what changed between `before` and `after`, then rewrite `after`
/// (and the outcome) with the real ids of inserted rows.
pub async fn persist(
    conn: &mut PgConnection,
    before: &LiveState,
    after: &mut LiveState,
    outcome: &mut Outcome,
) -> Result<Remap, sqlx::Error> {
    let event_id = after.event.id;
    let mut remap = Remap::default();

    // Lobbies first: deleted ones (their members and pre-joins cascade),
    // then new ones, whose real ids everything else needs.
    for id in before.lobbies.keys() {
        if !after.lobbies.contains_key(id) {
            sqlx::query("DELETE FROM event_game_schedule WHERE id = $1")
                .bind(id)
                .execute(&mut *conn)
                .await?;
        }
    }
    for (id, lobby) in &after.lobbies {
        if *id < 0 {
            let real = insert_lobby(&mut *conn, event_id, lobby).await?;
            remap.lobbies.insert(*id, real);
        }
    }
    apply_remap(after, outcome, &remap);
    for (id, lobby) in &after.lobbies {
        if before.lobbies.get(id).is_some_and(|b| b != lobby) {
            update_lobby(&mut *conn, lobby).await?;
        }
    }

    persist_members(conn, before, after).await?;
    persist_prejoins(conn, before, after).await?;
    persist_presence(conn, before, after).await?;
    persist_defaults(conn, before, after).await?;

    // Check-ins only ever get added.
    for (email, checkin) in &after.checkins {
        if !before.checkins.contains_key(email) {
            sqlx::query(
                r"
                INSERT INTO live_checkin (event_id, email, checked_in_at, by_email)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (event_id, email) DO NOTHING
                ",
            )
            .bind(event_id)
            .bind(email)
            .bind(checkin.at)
            .bind(&checkin.by)
            .execute(&mut *conn)
            .await?;
        }
    }
    Ok(remap)
}

async fn persist_members(
    conn: &mut PgConnection,
    before: &LiveState,
    after: &mut LiveState,
) -> Result<(), sqlx::Error> {
    for id in before.members.keys() {
        if !after.members.contains_key(id)
            && after.lobbies.contains_key(&before.members[id].lobby_id)
        {
            sqlx::query("DELETE FROM lobby_member WHERE id = $1")
                .bind(id)
                .execute(&mut *conn)
                .await?;
        }
    }
    let mut inserted = Vec::new();
    for (id, m) in &after.members {
        if *id < 0 {
            let real: i64 = sqlx::query_scalar(
                r"
                INSERT INTO lobby_member (lobby_id, email, team, via, joined_at, left_at,
                    left_reason, manual_expires_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id
                ",
            )
            .bind(m.lobby_id)
            .bind(&m.email)
            .bind(&m.team)
            .bind(m.via.as_str())
            .bind(m.joined_at)
            .bind(m.left_at)
            .bind(&m.left_reason)
            .bind(m.manual_expires_at)
            .fetch_one(&mut *conn)
            .await?;
            inserted.push((*id, real));
        } else if before.members.get(id).is_some_and(|b| b != m) {
            sqlx::query(
                r"
                UPDATE lobby_member SET team = $2, via = $3, left_at = $4, left_reason = $5,
                    manual_expires_at = $6
                WHERE id = $1
                ",
            )
            .bind(id)
            .bind(&m.team)
            .bind(m.via.as_str())
            .bind(m.left_at)
            .bind(&m.left_reason)
            .bind(m.manual_expires_at)
            .execute(&mut *conn)
            .await?;
        }
    }
    for (temp, real) in inserted {
        if let Some(mut m) = after.members.remove(&temp) {
            m.id = real;
            after.members.insert(real, m);
        }
    }
    Ok(())
}

async fn persist_prejoins(
    conn: &mut PgConnection,
    before: &LiveState,
    after: &LiveState,
) -> Result<(), sqlx::Error> {
    for key in before.prejoins.keys() {
        if !after.prejoins.contains_key(key) && after.lobbies.contains_key(&key.0) {
            sqlx::query("DELETE FROM lobby_prejoin WHERE lobby_id = $1 AND email = $2")
                .bind(key.0)
                .bind(&key.1)
                .execute(&mut *conn)
                .await?;
        }
    }
    for (key, p) in &after.prejoins {
        if before.prejoins.get(key) != Some(p) {
            sqlx::query(
                r"
                INSERT INTO lobby_prejoin (lobby_id, email, team, random_team, created_at,
                    dropped_at, drop_reason)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (lobby_id, email) DO UPDATE SET team = $3, random_team = $4,
                    created_at = $5, dropped_at = $6, drop_reason = $7
                ",
            )
            .bind(p.lobby_id)
            .bind(&p.email)
            .bind(&p.team)
            .bind(p.random_team)
            .bind(p.created_at)
            .bind(p.dropped_at)
            .bind(&p.drop_reason)
            .execute(&mut *conn)
            .await?;
        }
    }
    Ok(())
}

async fn persist_presence(
    conn: &mut PgConnection,
    before: &LiveState,
    after: &LiveState,
) -> Result<(), sqlx::Error> {
    let event_id = after.event.id;
    for email in before.presence.keys() {
        if !after.presence.contains_key(email) {
            sqlx::query("DELETE FROM live_presence WHERE event_id = $1 AND email = $2")
                .bind(event_id)
                .bind(email)
                .execute(&mut *conn)
                .await?;
        }
    }
    for (email, p) in &after.presence {
        if before.presence.get(email) == Some(p) {
            continue;
        }
        sqlx::query(
            r"
            INSERT INTO live_presence (event_id, email, game_id, game_name, persona_state,
                visibility, observed_at, pending_game_id, pending_game_name, pending_since,
                afk_since, afk_noted, ignore_game_id, switch_lobby_id, switch_grace_until,
                private_hint_sent)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            ON CONFLICT (event_id, email) DO UPDATE SET game_id = $3, game_name = $4,
                persona_state = $5, visibility = $6, observed_at = $7, pending_game_id = $8,
                pending_game_name = $9, pending_since = $10, afk_since = $11, afk_noted = $12,
                ignore_game_id = $13, switch_lobby_id = $14, switch_grace_until = $15,
                private_hint_sent = $16
            ",
        )
        .bind(event_id)
        .bind(email)
        .bind(p.game_id)
        .bind(&p.game_name)
        .bind(p.persona_state)
        .bind(p.visibility)
        .bind(p.observed_at)
        .bind(p.pending_game_id)
        .bind(&p.pending_game_name)
        .bind(p.pending_since)
        .bind(p.afk_since)
        .bind(p.afk_noted)
        .bind(p.ignore_game_id)
        .bind(p.switch_lobby_id)
        .bind(p.switch_grace_until)
        .bind(p.private_hint_sent)
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}

async fn persist_defaults(
    conn: &mut PgConnection,
    before: &LiveState,
    after: &LiveState,
) -> Result<(), sqlx::Error> {
    for (game_id, d) in &after.defaults {
        if before.defaults.get(game_id) == Some(d) {
            continue;
        }
        sqlx::query(
            r"
            INSERT INTO game_lobby_defaults (game_id, max_players, teams, duration_minutes,
                set_by, set_at)
            VALUES ($1, $2, $3, $4, $5, NOW())
            ON CONFLICT (game_id) DO UPDATE SET max_players = $2, teams = $3,
                duration_minutes = $4, set_by = $5, set_at = NOW()
            ",
        )
        .bind(game_id)
        .bind(d.max_players)
        .bind(teams_json(d.teams.as_ref()))
        .bind(d.duration_minutes)
        .bind(&d.set_by)
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}

/// Swap temporary lobby ids for real ones in the state and the outcome.
fn apply_remap(state: &mut LiveState, outcome: &mut Outcome, remap: &Remap) {
    if remap.lobbies.is_empty() {
        return;
    }
    let lobbies = std::mem::take(&mut state.lobbies);
    state.lobbies = lobbies
        .into_iter()
        .map(|(id, mut lobby)| {
            let real = remap.lobby(id);
            lobby.id = real;
            (real, lobby)
        })
        .collect();
    for member in state.members.values_mut() {
        member.lobby_id = remap.lobby(member.lobby_id);
    }
    let prejoins = std::mem::take(&mut state.prejoins);
    state.prejoins = prejoins
        .into_iter()
        .map(|((lobby, email), mut p)| {
            let real = remap.lobby(lobby);
            p.lobby_id = real;
            ((real, email), p)
        })
        .collect();
    for p in state.presence.values_mut() {
        if let Some(id) = p.switch_lobby_id {
            p.switch_lobby_id = Some(remap.lobby(id));
        }
    }
    for entry in &mut outcome.feed {
        if let Some(id) = entry.lobby_id {
            entry.lobby_id = Some(remap.lobby(id));
        }
    }
    for (_, id) in &mut outcome.feed_deletes {
        *id = remap.lobby(*id);
    }
}

/// The client-visible changes of a step.
#[derive(Debug, Default, Clone)]
pub struct Deltas {
    pub rows: Vec<NewLogRow>,
    pub lobbies: Vec<LobbyView>,
    pub deleted_lobbies: Vec<String>,
    pub people: Vec<PersonView>,
}

/// The JSON payload of a feed entry: ids as client ids, people as pids.
pub fn feed_payload(state: &LiveState, entry: &FeedEntry, key: &str) -> JsonValue {
    let lobby = entry.lobby_id.and_then(|id| state.lobbies.get(&id));
    let mut payload = json!({
        "key": key,
        "type": entry.kind,
        "text": entry.text,
        "actor": entry.actor.as_deref().map(pid),
        "actorName": entry
            .actor
            .as_deref()
            .and_then(|e| state.people.get(e))
            .map(Person::display_name),
        "lobbyId": entry.lobby_id.map(|id| id.to_string()),
        "voteId": entry.vote_id.map(|id| id.to_string()),
        "people": entry.people.iter().map(|e| pid(e)).collect::<Vec<_>>(),
        "gameId": lobby.and_then(|l| l.game_id),
        "name": lobby.map(|l| l.name.clone()),
        "lobbyKind": lobby.map(|l| l.kind.as_str()),
    });
    if let (Some(obj), JsonValue::Object(extra)) = (payload.as_object_mut(), &entry.data) {
        for (k, v) in extra {
            obj.insert(k.clone(), v.clone());
        }
    }
    payload
}

/// Stream rows for a step: changed views, then the feed.
pub fn delta_rows(
    before: &LiveState,
    after: &LiveState,
    outcome: &Outcome,
    actor: Option<&str>,
    now: DateTime<Utc>,
) -> Deltas {
    let mut deltas = Deltas::default();
    let actor = actor.map(ToString::to_string);
    let with_actor = |row: NewLogRow| match &actor {
        Some(a) => row.actor(a.clone()),
        None => row.actor("system"),
    };

    let before_lobbies = views::lobby_views(before);
    let after_lobbies = views::lobby_views(after);
    for (id, view) in &after_lobbies {
        if before_lobbies.get(id) != Some(view) {
            deltas.rows.push(with_actor(NewLogRow::new("lobby", view)));
            deltas.lobbies.push(view.clone());
        }
    }
    for id in before_lobbies.keys() {
        if !after_lobbies.contains_key(id) {
            deltas.rows.push(with_actor(NewLogRow::new(
                "lobby.delete",
                json!({ "id": id.to_string() }),
            )));
            deltas.deleted_lobbies.push(id.to_string());
        }
    }

    let before_people = views::people_views(before, now);
    let after_people = views::people_views(after, now);
    for (email, view) in &after_people {
        if before_people.get(email) != Some(view) {
            deltas.rows.push(with_actor(NewLogRow::new("person", view)));
            deltas.people.push(view.clone());
        }
    }

    for (n, entry) in outcome.feed.iter().enumerate() {
        let key = entry.key_kind.map_or_else(
            || format!("{}:{}:{n}", entry.kind, now.timestamp_millis()),
            |k| format!("{k}:{}", entry.lobby_id.unwrap_or_default()),
        );
        deltas.rows.push(with_actor(
            NewLogRow::new("feed", feed_payload(after, entry, &key)).tier(entry.tier),
        ));
    }
    let before_queue = views::admin_queue(before);
    let after_queue = views::admin_queue(after);
    if before_queue != after_queue {
        deltas.rows.push(with_actor(
            NewLogRow::new("admin.queue", json!({ "items": after_queue }))
                .audience(Audience::Admins),
        ));
    }
    for toast in &outcome.personal {
        deltas.rows.push(with_actor(
            NewLogRow::new(
                "toast.personal",
                json!({ "kind": toast.kind, "data": toast.data, "key": format!("{}:{}", toast.kind, now.timestamp_millis()) }),
            )
            .audience(Audience::Person(toast.to.clone())),
        ));
    }
    for (kind, lobby_id) in &outcome.feed_deletes {
        deltas.rows.push(with_actor(NewLogRow::new(
            "feed.delete",
            json!({ "key": format!("{kind}:{lobby_id}") }),
        )));
    }
    deltas
}
