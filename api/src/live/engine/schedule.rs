//! Admin edits of the schedule (the schedule page and Live's admin strip)
//! and saved players and teams per game (DESIGN.md §4.5, §5.6).

use chrono::{DateTime, Utc};
use rocket::serde::json::json;

use super::{lobby_mut, membership, Actor, FeedEntry, LobbyEdit, Outcome, PlayersAndTeams, Reject};
use crate::live::model::{GameDefaults, LiveState, Lobby, LobbyKind, LobbySource, LobbyStatus};

fn validate_edit(edit: &LobbyEdit) -> Result<(), Reject> {
    if edit.minutes < 5 || edit.minutes > 24 * 60 {
        return Err(Reject::BadInput(
            "A lobby lasts between 5 minutes and 24 hours".to_string(),
        ));
    }
    Ok(())
}

/// A new lobby with the game's saved players and teams.
pub fn new_lobby(
    state: &mut LiveState,
    game_id: i64,
    name: String,
    source: LobbySource,
    status: LobbyStatus,
    start: DateTime<Utc>,
    minutes: i32,
    now: DateTime<Utc>,
) -> i32 {
    let id = state.temp_lobby_id();
    let defaults = state.defaults.get(&game_id).cloned().unwrap_or_default();
    state.lobbies.insert(
        id,
        Lobby {
            id,
            kind: LobbyKind::Game,
            game_id: Some(game_id),
            name,
            food: None,
            status,
            source,
            start,
            minutes,
            planned_start: None,
            planned_minutes: None,
            actual_start: None,
            actual_end: None,
            max_players: defaults.max_players,
            teams: defaults.teams,
            proposed_by: None,
            created_by_vote: None,
            grace_until: None,
            grace_locked: false,
            hold_remaining_s: None,
            empty_since: None,
            is_pinned: true,
            created_at: now,
            version: 0,
        },
    );
    id
}

pub fn create_lobby(
    state: &mut LiveState,
    actor: &Actor,
    edit: LobbyEdit,
    now: DateTime<Utc>,
    out: &mut Outcome,
) -> Result<(), Reject> {
    validate_edit(&edit)?;
    let start = edit.start;
    let id = new_lobby(
        state,
        edit.game_id,
        edit.game_name,
        LobbySource::Plan,
        LobbyStatus::Planned,
        start,
        edit.minutes,
        now,
    );
    if state.event.time_begin <= now {
        // Added during the event: say so in the feed.
        out.feed.push(
            FeedEntry::new(3, "lobby.added", "added")
                .actor(&actor.email)
                .lobby(id)
                .data(json!({ "admin": true, "start": start })),
        );
    }
    Ok(())
}

pub fn update_lobby(
    state: &mut LiveState,
    actor: &Actor,
    id: i32,
    edit: LobbyEdit,
    now: DateTime<Utc>,
    out: &mut Outcome,
) -> Result<(), Reject> {
    validate_edit(&edit)?;
    let event_started = state.event.time_begin <= now;
    let backed = state
        .prejoins
        .values()
        .any(|p| p.lobby_id == id && p.is_active());
    let lobby = lobby_mut(state, id)?;
    let moved = lobby.start != edit.start;
    let resized = lobby.minutes != edit.minutes;
    if event_started && (moved || resized) {
        lobby.freeze_plan();
    }
    if moved && matches!(lobby.status, LobbyStatus::Waiting | LobbyStatus::Delayed) {
        // Its start deadline belongs to the old time: it starts again at the
        // new one (as a delay vote does). A new time already past starts the
        // wait over on the next tick.
        lobby.status = if lobby.source == LobbySource::Proposal || backed {
            LobbyStatus::Confirmed
        } else {
            LobbyStatus::Planned
        };
        lobby.grace_until = None;
        lobby.grace_locked = false;
        lobby.hold_remaining_s = None;
    }
    lobby.start = edit.start;
    lobby.minutes = edit.minutes;
    if lobby.game_id != Some(edit.game_id) {
        lobby.game_id = Some(edit.game_id);
        lobby.name = edit.game_name;
    }
    if lobby.status == LobbyStatus::Done {
        // Correcting history: the edit is the actual time.
        lobby.actual_start = Some(edit.start);
        lobby.actual_end = Some(lobby.end());
    }
    lobby.version += 1;
    if event_started && (moved || resized) {
        out.feed.push(
            FeedEntry::new(3, "lobby.moved", if moved { "moved" } else { "resized" })
                .actor(&actor.email)
                .lobby(id)
                .data(json!({
                    "admin": true,
                    "start": edit.start,
                    "minutes": edit.minutes,
                })),
        );
    }
    Ok(())
}

pub fn remove_lobby(
    state: &mut LiveState,
    actor: &Actor,
    id: i32,
    now: DateTime<Utc>,
    out: &mut Outcome,
) -> Result<(), Reject> {
    let event_started = state.event.time_begin <= now;
    let lobby = lobby_mut(state, id)?;
    let name = lobby.name.clone();
    let has_history = lobby.status.is_running()
        || lobby.status == LobbyStatus::Done
        || state.members.values().any(|m| m.lobby_id == id);
    if has_history {
        // Keep what happened in the record; hide it from the views.
        for member in state.members.values_mut() {
            if member.lobby_id == id && member.is_open() {
                member.left_at = Some(now);
                member.left_reason = Some("ended".to_string());
            }
        }
        if let Some(lobby) = state.lobbies.get_mut(&id) {
            lobby.status = LobbyStatus::Removed;
            lobby.version += 1;
        }
    } else {
        membership::forget_lobby(state, id);
        state.lobbies.remove(&id);
    }
    if event_started {
        out.feed.push(
            FeedEntry::new(3, "lobby.removed", "removed")
                .actor(&actor.email)
                .data(json!({ "admin": true, "name": name })),
        );
    }
    Ok(())
}

/// End a running lobby now (admin "End lobby").
pub fn end_lobby(
    state: &mut LiveState,
    actor: &Actor,
    id: i32,
    now: DateTime<Utc>,
    out: &mut Outcome,
) -> Result<(), Reject> {
    let lobby = lobby_mut(state, id)?;
    if !lobby.status.is_running() {
        return Err(Reject::Conflict("That lobby isn't running".to_string()));
    }
    membership::finish_lobby(state, id, now, "ended", out);
    out.feed.push(
        FeedEntry::new(3, "lobby.ended", "ended")
            .actor(&actor.email)
            .lobby(id)
            .data(json!({ "admin": true })),
    );
    Ok(())
}

/// Save players and teams for a game, for everyone and every event (§5.6).
pub fn set_players(
    state: &mut LiveState,
    actor: &Actor,
    game_id: i64,
    lobby: Option<i32>,
    players: PlayersAndTeams,
    _now: DateTime<Utc>,
) -> Result<(), Reject> {
    if let Some(teams) = &players.teams {
        if teams.is_empty() || teams.len() > 12 {
            return Err(Reject::BadInput("Between 1 and 12 teams".to_string()));
        }
        if teams
            .iter()
            .any(|t| t.size < 1 || t.size > 64 || t.name.trim().is_empty())
        {
            return Err(Reject::BadInput(
                "Every team needs a name and 1-64 players".to_string(),
            ));
        }
    }
    if let Some(max) = players.max_players {
        if !(1..=128).contains(&max) {
            return Err(Reject::BadInput("Between 1 and 128 players".to_string()));
        }
    }
    let previous = state.defaults.get(&game_id).cloned().unwrap_or_default();
    state.defaults.insert(
        game_id,
        GameDefaults {
            max_players: players.max_players,
            teams: players.teams.clone(),
            duration_minutes: previous.duration_minutes,
            set_by: Some(actor.email.clone()),
        },
    );
    if let Some(id) = lobby {
        let lobby = lobby_mut(state, id)?;
        if lobby.game_id != Some(game_id) {
            return Err(Reject::BadInput("That lobby is another game".to_string()));
        }
        lobby.max_players = players.max_players;
        lobby.teams = players.teams;
        lobby.version += 1;
    }
    Ok(())
}
