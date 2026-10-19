//! The live rules engine (DESIGN.md §3.1, §5): pure, no I/O and no clock.
//!
//! [`apply`] changes a [`LiveState`] in place for one [`Input`] at `now` and
//! returns what else happened (feed entries, personal toasts). The store
//! diffs the state before and after to write rows and stream deltas, so
//! every rule lives here and nowhere else.
//!
//! - [`checkin`]: check-in at the venue;
//! - [`schedule`]: admin edits (the schedule page) and game defaults;
//! - [`membership`]: joining, leaving and pre-joining lobbies;
//! - [`presence`]: Steam presence and the rules of §5.1;
//! - [`tick`]: everything driven by time.

use chrono::{DateTime, Utc};
use rocket::serde::json::{serde_json::Value as JsonValue, Value};

use super::model::{Email, LiveState, Lobby, Team};

mod checkin;
mod membership;
mod presence;
mod schedule;
mod tick;

pub use presence::playing_not_checked_in;

#[cfg(test)]
pub mod tests;

/// Who is acting.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Actor {
    pub email: Email,
    pub admin: bool,
}

/// An admin's edit of a lobby (the schedule page's drag, resize and pin).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LobbyEdit {
    pub game_id: i64,
    pub game_name: String,
    pub start: DateTime<Utc>,
    pub minutes: i32,
}

/// A planner suggestion someone acted on (pre-joined), to be stored.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Suggestion {
    pub game_id: i64,
    pub game_name: String,
    pub start: DateTime<Utc>,
    pub minutes: i32,
}

/// Which lobby a command is about: a stored one, or a planner suggestion.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LobbyRef {
    Stored(i32),
    Suggested(Suggestion),
}

/// Players and teams for a game.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlayersAndTeams {
    pub max_players: Option<i32>,
    pub teams: Option<Vec<Team>>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Command {
    /// Check in yourself, or (admins) someone else.
    CheckIn { email: Email },
    /// Admin: add a lobby to the schedule.
    CreateLobby(LobbyEdit),
    /// Admin: move or resize a lobby (or change its game).
    UpdateLobby { id: i32, edit: LobbyEdit },
    /// Admin: take a lobby off the schedule.
    RemoveLobby { id: i32 },
    /// Admin: end a running lobby now.
    EndLobby { id: i32 },
    /// I'm playing this now (a manual join).
    Join { lobby: i32 },
    /// I'm not playing (leave my current lobby).
    Leave,
    /// Answer "Still playing X?": keep a manual join going.
    StillPlaying { lobby: i32 },
    /// I'm in for this one. `team: None` with `random` takes any team.
    Prejoin {
        lobby: LobbyRef,
        team: Option<String>,
        random: bool,
    },
    /// Not coming after all.
    Unprejoin { lobby: i32 },
    /// Save players and teams for a game (for everyone, every event), and
    /// apply them to a lobby of it.
    SetPlayers {
        game_id: i64,
        lobby: Option<i32>,
        players: PlayersAndTeams,
    },
}

/// What Steam (or a simulator) says about one person.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PresenceSample {
    pub email: Email,
    pub game_id: Option<i64>,
    pub game_name: Option<String>,
    pub persona_state: i32,
    pub visibility: i32,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Input {
    Command {
        actor: Actor,
        command: Command,
    },
    /// Process every deadline at or before `now`. Idempotent.
    Tick,
    /// A poll of Steam presence. `immediate` skips the two-poll debounce
    /// (the local simulator).
    Presence {
        samples: Vec<PresenceSample>,
        immediate: bool,
    },
    /// Planner suggestions whose start has come: store them, so they stop
    /// moving and the start-time rules apply (DESIGN.md §4.5).
    Materialise {
        suggestions: Vec<Suggestion>,
    },
}

/// Why a command was refused.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Reject {
    BadInput(String),
    Forbidden(String),
    NotFound(String),
    /// The command makes no sense in the current state ("lobby full").
    Conflict(String),
}

/// A history entry for the feed (DESIGN.md tiers T1-T4).
#[derive(Debug, Clone, PartialEq)]
pub struct FeedEntry {
    /// 1 result, 2 lobby event, 3 action, 4 presence.
    pub tier: i16,
    /// e.g. `checkin`, `lobby.moved`.
    pub kind: &'static str,
    pub actor: Option<Email>,
    pub lobby_id: Option<i32>,
    pub vote_id: Option<i64>,
    /// Other people the entry is about.
    pub people: Vec<Email>,
    /// What happened, e.g. "checked in". The UI builds the sentence.
    pub text: String,
    /// Extra, id-free details (times, names).
    pub data: JsonValue,
    /// When set, the entry's key is `<key_kind>:<lobby id>` so that a later
    /// [`Outcome::feed_deletes`] can remove it (proposals that lapse).
    pub key_kind: Option<&'static str>,
}

impl FeedEntry {
    pub(crate) fn new(tier: i16, kind: &'static str, text: impl Into<String>) -> Self {
        Self {
            tier,
            kind,
            actor: None,
            lobby_id: None,
            vote_id: None,
            people: Vec::new(),
            text: text.into(),
            data: Value::Null,
            key_kind: None,
        }
    }

    pub(crate) fn actor(mut self, email: &str) -> Self {
        self.actor = Some(email.to_string());
        self
    }

    pub(crate) const fn lobby(mut self, id: i32) -> Self {
        self.lobby_id = Some(id);
        self
    }

    pub(crate) fn people(mut self, people: Vec<Email>) -> Self {
        self.people = people;
        self
    }

    pub(crate) fn data(mut self, data: JsonValue) -> Self {
        self.data = data;
        self
    }
}

/// A toast for one person (a nudge, a Steam privacy hint...).
#[derive(Debug, Clone, PartialEq)]
pub struct PersonalToast {
    pub to: Email,
    pub kind: &'static str,
    pub data: JsonValue,
}

/// What a step produced besides the state change.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Outcome {
    pub feed: Vec<FeedEntry>,
    /// Feed entries to delete: `(key_kind, lobby id)`.
    pub feed_deletes: Vec<(&'static str, i32)>,
    pub personal: Vec<PersonalToast>,
}

/// Apply one input at `now`.
pub fn apply(state: &mut LiveState, input: Input, now: DateTime<Utc>) -> Result<Outcome, Reject> {
    let mut out = Outcome::default();
    // Deadlines first, so nothing ever acts on stale state.
    tick::run(state, now, &mut out);
    match input {
        Input::Tick => {}
        Input::Presence { samples, immediate } => {
            presence::apply_samples(state, &samples, immediate, now, &mut out);
        }
        Input::Materialise { suggestions } => {
            for s in &suggestions {
                membership::materialise(state, s, now);
            }
        }
        Input::Command { actor, command } => command_step(state, &actor, command, now, &mut out)?,
    }
    Ok(out)
}

fn command_step(
    state: &mut LiveState,
    actor: &Actor,
    command: Command,
    now: DateTime<Utc>,
    out: &mut Outcome,
) -> Result<(), Reject> {
    match command {
        Command::CheckIn { email } => checkin::check_in(state, actor, &email, now, out),
        Command::CreateLobby(edit) => {
            require_admin(actor)?;
            schedule::create_lobby(state, actor, edit, now, out)
        }
        Command::UpdateLobby { id, edit } => {
            require_admin(actor)?;
            schedule::update_lobby(state, actor, id, edit, now, out)
        }
        Command::RemoveLobby { id } => {
            require_admin(actor)?;
            schedule::remove_lobby(state, actor, id, now, out)
        }
        Command::EndLobby { id } => {
            require_admin(actor)?;
            schedule::end_lobby(state, actor, id, now, out)
        }
        Command::Join { lobby } => membership::join_command(state, actor, lobby, now, out),
        Command::Leave => membership::leave_command(state, actor, now, out),
        Command::StillPlaying { lobby } => membership::still_playing(state, actor, lobby, now),
        Command::Prejoin {
            lobby,
            team,
            random,
        } => membership::prejoin(state, actor, lobby, team, random, now, out).map(|_| ()),
        Command::Unprejoin { lobby } => membership::unprejoin(state, actor, lobby, now, out),
        Command::SetPlayers {
            game_id,
            lobby,
            players,
        } => schedule::set_players(state, actor, game_id, lobby, players, now),
    }
}

pub(crate) fn require_admin(actor: &Actor) -> Result<(), Reject> {
    if actor.admin {
        Ok(())
    } else {
        Err(Reject::Forbidden("Only admins can do that".to_string()))
    }
}

/// A stored lobby that is still on the schedule.
pub(crate) fn lobby_mut(state: &mut LiveState, id: i32) -> Result<&mut Lobby, Reject> {
    state
        .lobbies
        .get_mut(&id)
        .filter(|l| l.status != super::model::LobbyStatus::Removed)
        .ok_or_else(|| Reject::NotFound("That lobby no longer exists".to_string()))
}
