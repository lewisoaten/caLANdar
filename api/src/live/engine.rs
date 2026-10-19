//! The live rules engine (DESIGN.md §3.1, §5): pure, no I/O and no clock.
//!
//! [`apply`] changes a [`LiveState`] in place for one [`Input`] at `now` and
//! returns the feed entries it produced. The store diffs the state before and
//! after to write rows and stream deltas, so every rule lives here and
//! nowhere else.

use chrono::{DateTime, Utc};
use rocket::serde::json::{serde_json::Value as JsonValue, Value};

use super::model::{Email, LiveState, Lobby, LobbyKind, LobbySource, LobbyStatus};

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

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Command {
    /// Check in yourself, or (admins) someone else.
    CheckIn { email: Email },
    /// Admin: add a lobby to the schedule.
    CreateLobby(LobbyEdit),
    /// Admin: move or resize a lobby (or change its game).
    UpdateLobby { id: i32, edit: LobbyEdit },
    /// Admin: take a lobby off the schedule.
    RemoveLobby { id: i32 },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Input {
    Command {
        actor: Actor,
        command: Command,
    },
    /// Process every deadline at or before `now`. Idempotent.
    Tick,
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
#[derive(Debug, Clone, PartialEq, Eq)]
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
    fn new(tier: i16, kind: &'static str, text: impl Into<String>) -> Self {
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

    fn actor(mut self, email: &str) -> Self {
        self.actor = Some(email.to_string());
        self
    }

    const fn lobby(mut self, id: i32) -> Self {
        self.lobby_id = Some(id);
        self
    }

    fn data(mut self, data: JsonValue) -> Self {
        self.data = data;
        self
    }
}

/// What a step produced besides the state change.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Outcome {
    pub feed: Vec<FeedEntry>,
    /// Feed entries to delete: `(key_kind, lobby id)`.
    pub feed_deletes: Vec<(&'static str, i32)>,
}

/// Apply one input at `now`.
pub fn apply(state: &mut LiveState, input: Input, now: DateTime<Utc>) -> Result<Outcome, Reject> {
    let mut out = Outcome::default();
    match input {
        Input::Tick => tick(state, now, &mut out),
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
    // Deadlines first, so a command never acts on stale state.
    tick(state, now, out);
    match command {
        Command::CheckIn { email } => check_in(state, actor, &email, now, out),
        Command::CreateLobby(edit) => {
            require_admin(actor)?;
            validate_edit(&edit)?;
            create_lobby(state, actor, edit, now, out);
            Ok(())
        }
        Command::UpdateLobby { id, edit } => {
            require_admin(actor)?;
            update_lobby(state, actor, id, edit, now, out)
        }
        Command::RemoveLobby { id } => {
            require_admin(actor)?;
            remove_lobby(state, actor, id, now, out)
        }
    }
}

fn require_admin(actor: &Actor) -> Result<(), Reject> {
    if actor.admin {
        Ok(())
    } else {
        Err(Reject::Forbidden("Only admins can do that".to_string()))
    }
}

/// Check-in opens at doors (`time_begin`) and closes at the end.
fn check_in(
    state: &mut LiveState,
    actor: &Actor,
    email: &str,
    now: DateTime<Utc>,
    out: &mut Outcome,
) -> Result<(), Reject> {
    if email != actor.email && !actor.admin {
        return Err(Reject::Forbidden(
            "You can only check yourself in".to_string(),
        ));
    }
    let Some(person) = state.people.get(email) else {
        return Err(Reject::NotFound(
            "They aren't invited to this event".to_string(),
        ));
    };
    if !actor.admin && !person.attending() {
        return Err(Reject::Conflict(
            "RSVP yes or maybe before checking in".to_string(),
        ));
    }
    if now < state.event.time_begin {
        return Err(Reject::Conflict(
            "Check-in opens when the doors open".to_string(),
        ));
    }
    if now > state.event.time_end {
        return Err(Reject::Conflict("This event has ended".to_string()));
    }
    if state.is_checked_in(email) {
        return Ok(());
    }
    state.checkins.insert(
        email.to_string(),
        super::model::CheckIn {
            email: email.to_string(),
            at: now,
            by: actor.email.clone(),
        },
    );
    let mut entry = FeedEntry::new(4, "checkin", "checked in").actor(email);
    if email != actor.email {
        entry.data = rocket::serde::json::json!({ "byAdmin": true });
    }
    out.feed.push(entry);
    Ok(())
}

fn validate_edit(edit: &LobbyEdit) -> Result<(), Reject> {
    if edit.minutes < 5 || edit.minutes > 24 * 60 {
        return Err(Reject::BadInput(
            "A lobby lasts between 5 minutes and 24 hours".to_string(),
        ));
    }
    Ok(())
}

fn create_lobby(
    state: &mut LiveState,
    actor: &Actor,
    edit: LobbyEdit,
    now: DateTime<Utc>,
    out: &mut Outcome,
) {
    let id = state.temp_lobby_id();
    let defaults = state
        .defaults
        .get(&edit.game_id)
        .cloned()
        .unwrap_or_default();
    let lobby = Lobby {
        id,
        kind: LobbyKind::Game,
        game_id: Some(edit.game_id),
        name: edit.game_name,
        food: None,
        status: LobbyStatus::Planned,
        source: LobbySource::Plan,
        start: edit.start,
        minutes: edit.minutes,
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
    };
    if state.event.time_begin <= now {
        // Added during the event: say so in the feed.
        out.feed.push(
            FeedEntry::new(3, "lobby.added", "added")
                .actor(&actor.email)
                .lobby(id)
                .data(rocket::serde::json::json!({ "admin": true, "start": lobby.start })),
        );
    }
    state.lobbies.insert(id, lobby);
}

fn update_lobby(
    state: &mut LiveState,
    actor: &Actor,
    id: i32,
    edit: LobbyEdit,
    now: DateTime<Utc>,
    out: &mut Outcome,
) -> Result<(), Reject> {
    validate_edit(&edit)?;
    let event_started = state.event.time_begin <= now;
    let lobby = state
        .lobbies
        .get_mut(&id)
        .filter(|l| l.status != LobbyStatus::Removed)
        .ok_or_else(|| Reject::NotFound("That lobby no longer exists".to_string()))?;
    let moved = lobby.start != edit.start;
    let resized = lobby.minutes != edit.minutes;
    if event_started && (moved || resized) {
        lobby.freeze_plan();
    }
    lobby.start = edit.start;
    lobby.minutes = edit.minutes;
    if lobby.game_id != Some(edit.game_id) {
        lobby.game_id = Some(edit.game_id);
        lobby.name = edit.game_name;
    }
    lobby.version += 1;
    if event_started && (moved || resized) {
        out.feed.push(
            FeedEntry::new(3, "lobby.moved", if moved { "moved" } else { "resized" })
                .actor(&actor.email)
                .lobby(id)
                .data(rocket::serde::json::json!({
                    "admin": true,
                    "start": edit.start,
                    "minutes": edit.minutes,
                })),
        );
    }
    Ok(())
}

fn remove_lobby(
    state: &mut LiveState,
    actor: &Actor,
    id: i32,
    now: DateTime<Utc>,
    out: &mut Outcome,
) -> Result<(), Reject> {
    let event_started = state.event.time_begin <= now;
    let Some(lobby) = state.lobbies.get(&id) else {
        return Err(Reject::NotFound("That lobby no longer exists".to_string()));
    };
    let name = lobby.name.clone();
    if event_started && lobby.status != LobbyStatus::Planned {
        // Keep anything that happened in the record; hide it from the views.
        if let Some(lobby) = state.lobbies.get_mut(&id) {
            lobby.status = LobbyStatus::Removed;
            lobby.version += 1;
        }
    } else {
        state.lobbies.remove(&id);
    }
    if event_started {
        out.feed.push(
            FeedEntry::new(3, "lobby.removed", "removed")
                .actor(&actor.email)
                .data(rocket::serde::json::json!({ "admin": true, "name": name })),
        );
    }
    Ok(())
}

/// Time-driven rules. Phase 1 has none; later phases add the start-time
/// machine, graces, backers and vote deadlines here.
const fn tick(_state: &mut LiveState, _now: DateTime<Utc>, _out: &mut Outcome) {}

#[cfg(test)]
pub mod tests {
    use super::*;
    use crate::live::model::{EventInfo, Person, Rsvp};
    use chrono::{Duration, TimeZone};

    pub fn t(h: u32, m: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 10, 23, h, m, 0)
            .single()
            .expect("valid")
    }

    pub fn person(email: &str, rsvp: Option<Rsvp>) -> Person {
        Person {
            email: email.to_string(),
            handle: Some(email.split('@').next().unwrap_or("x").to_string()),
            rsvp,
            attendance: vec![1; 12],
            steam_id: None,
            seat: None,
        }
    }

    /// An event from Fri 18:00 to Sun 16:00 with three attending gamers.
    pub fn state() -> LiveState {
        let mut s = LiveState::new(EventInfo {
            id: 1,
            title: "LAN".to_string(),
            time_begin: t(18, 0),
            time_end: t(18, 0) + Duration::hours(46),
            discord_invite_url: None,
            timezone: "Europe/London".to_string(),
            wallboard_token: None,
        });
        for e in ["ana@x.io", "bo@x.io", "cy@x.io"] {
            s.people.insert(e.to_string(), person(e, Some(Rsvp::Yes)));
        }
        s.people
            .insert("no@x.io".to_string(), person("no@x.io", Some(Rsvp::No)));
        s
    }

    pub fn gamer(email: &str) -> Actor {
        Actor {
            email: email.to_string(),
            admin: false,
        }
    }

    pub fn admin() -> Actor {
        Actor {
            email: "admin@x.io".to_string(),
            admin: true,
        }
    }

    pub fn cmd(actor: Actor, command: Command) -> Input {
        Input::Command { actor, command }
    }

    #[test]
    fn check_in_opens_at_doors() {
        let mut s = state();
        let early = apply(
            &mut s,
            cmd(
                gamer("ana@x.io"),
                Command::CheckIn {
                    email: "ana@x.io".into(),
                },
            ),
            t(17, 59),
        );
        assert!(matches!(early, Err(Reject::Conflict(_))));

        let out = apply(
            &mut s,
            cmd(
                gamer("ana@x.io"),
                Command::CheckIn {
                    email: "ana@x.io".into(),
                },
            ),
            t(18, 4),
        )
        .expect("checked in");
        assert!(s.is_checked_in("ana@x.io"));
        assert_eq!(out.feed.len(), 1);
        assert_eq!(out.feed[0].kind, "checkin");
        assert_eq!(out.feed[0].tier, 4);

        // Checking in twice is a no-op.
        let again = apply(
            &mut s,
            cmd(
                gamer("ana@x.io"),
                Command::CheckIn {
                    email: "ana@x.io".into(),
                },
            ),
            t(18, 5),
        )
        .expect("ok");
        assert!(again.feed.is_empty());
        assert_eq!(s.checkins["ana@x.io"].at, t(18, 4));
    }

    #[test]
    fn check_in_is_personal_unless_admin() {
        let mut s = state();
        let other = apply(
            &mut s,
            cmd(
                gamer("ana@x.io"),
                Command::CheckIn {
                    email: "bo@x.io".into(),
                },
            ),
            t(19, 0),
        );
        assert!(matches!(other, Err(Reject::Forbidden(_))));
        let declined = apply(
            &mut s,
            cmd(
                gamer("no@x.io"),
                Command::CheckIn {
                    email: "no@x.io".into(),
                },
            ),
            t(19, 0),
        );
        assert!(matches!(declined, Err(Reject::Conflict(_))));
        apply(
            &mut s,
            cmd(
                admin(),
                Command::CheckIn {
                    email: "bo@x.io".into(),
                },
            ),
            t(19, 0),
        )
        .expect("admin can");
        assert_eq!(s.checkins["bo@x.io"].by, "admin@x.io");
    }

    fn edit(start: DateTime<Utc>, minutes: i32) -> LobbyEdit {
        LobbyEdit {
            game_id: 548_430,
            game_name: "Deep Rock Galactic".to_string(),
            start,
            minutes,
        }
    }

    #[test]
    fn admin_edits_freeze_the_plan_once_the_event_runs() {
        let mut s = state();
        // Before the event: plain planning, no feed, nothing frozen.
        apply(
            &mut s,
            cmd(admin(), Command::CreateLobby(edit(t(20, 0), 120))),
            t(12, 0),
        )
        .expect("created");
        let id = *s.lobbies.keys().next().expect("a lobby");
        let out = apply(
            &mut s,
            cmd(
                admin(),
                Command::UpdateLobby {
                    id,
                    edit: edit(t(21, 0), 120),
                },
            ),
            t(12, 0),
        )
        .expect("moved");
        assert!(out.feed.is_empty());
        assert_eq!(s.lobbies[&id].planned_start, None);

        // During the event: the plan is frozen and the feed says so.
        let out = apply(
            &mut s,
            cmd(
                admin(),
                Command::UpdateLobby {
                    id,
                    edit: edit(t(22, 30), 90),
                },
            ),
            t(19, 0),
        )
        .expect("moved");
        let lobby = &s.lobbies[&id];
        assert_eq!(lobby.planned_start, Some(t(21, 0)));
        assert_eq!(lobby.planned_minutes, Some(120));
        assert_eq!(lobby.start, t(22, 30));
        assert_eq!(out.feed[0].kind, "lobby.moved");

        // Only admins edit.
        let refused = apply(
            &mut s,
            cmd(gamer("ana@x.io"), Command::RemoveLobby { id }),
            t(19, 0),
        );
        assert!(matches!(refused, Err(Reject::Forbidden(_))));

        apply(&mut s, cmd(admin(), Command::RemoveLobby { id }), t(19, 0)).expect("removed");
        assert!(s.lobbies.is_empty());
    }

    #[test]
    fn edits_are_validated() {
        let mut s = state();
        apply(
            &mut s,
            cmd(admin(), Command::CreateLobby(edit(t(20, 0), 120))),
            t(12, 0),
        )
        .expect("created");
        let id = *s.lobbies.keys().next().expect("a lobby");
        let bad = apply(
            &mut s,
            cmd(
                admin(),
                Command::UpdateLobby {
                    id,
                    edit: edit(t(20, 0), 1),
                },
            ),
            t(12, 0),
        );
        assert!(matches!(bad, Err(Reject::BadInput(_))));
        let missing = apply(
            &mut s,
            cmd(
                admin(),
                Command::UpdateLobby {
                    id: 999,
                    edit: edit(t(20, 0), 60),
                },
            ),
            t(12, 0),
        );
        assert!(matches!(missing, Err(Reject::NotFound(_))));
    }
}
