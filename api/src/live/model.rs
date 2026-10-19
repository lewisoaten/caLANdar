//! The live state of one event: plain data, loaded from the database by
//! [`super::store`] and changed only by [`super::engine`] (DESIGN.md §3.1).

use std::collections::BTreeMap;

use chrono::{DateTime, Duration, Utc};
use rocket::serde::{Deserialize, Serialize};

pub type Email = String;

/// The opaque id people are known by in the live API (never their email).
pub fn pid(email: &str) -> String {
    let digest = md5::compute(email.to_lowercase().as_bytes());
    format!("{digest:x}")[..12].to_string()
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EventInfo {
    pub id: i32,
    pub title: String,
    pub time_begin: DateTime<Utc>,
    pub time_end: DateTime<Utc>,
    pub discord_invite_url: Option<String>,
    pub timezone: String,
    pub wallboard_token: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Rsvp {
    Yes,
    Maybe,
    No,
}

impl Rsvp {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Yes => "yes",
            Self::Maybe => "maybe",
            Self::No => "no",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SeatRef {
    pub seat_id: i32,
    pub label: String,
    pub room_id: i32,
}

/// Someone invited to the event (read-only context for the engine).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Person {
    pub email: Email,
    pub handle: Option<String>,
    pub rsvp: Option<Rsvp>,
    /// 6-hour attendance buckets (see `get_day_quarter_buckets`).
    pub attendance: Vec<u8>,
    pub steam_id: Option<i64>,
    pub seat: Option<SeatRef>,
}

impl Person {
    pub fn display_name(&self) -> String {
        self.handle
            .clone()
            .filter(|h| !h.trim().is_empty())
            .unwrap_or_else(|| "Player".to_string())
    }

    pub const fn attending(&self) -> bool {
        matches!(self.rsvp, Some(Rsvp::Yes | Rsvp::Maybe))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CheckIn {
    pub email: Email,
    pub at: DateTime<Utc>,
    pub by: Email,
}

macro_rules! string_enum {
    ($name:ident { $( $variant:ident = $s:literal ),+ $(,)? }) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
        pub enum $name { $( $variant ),+ }

        impl $name {
            pub const fn as_str(self) -> &'static str {
                match self { $( Self::$variant => $s ),+ }
            }

            pub fn parse(value: &str) -> Option<Self> {
                match value { $( $s => Some(Self::$variant), )+ _ => None }
            }
        }
    };
}

string_enum!(LobbyKind { Game = "game", Food = "food" });

string_enum!(LobbyStatus {
    Planned = "planned",
    Proposed = "proposed",
    Confirmed = "confirmed",
    Waiting = "waiting",
    Delayed = "delayed",
    Grace = "grace",
    Live = "live",
    Empty = "empty",
    Done = "done",
    Removed = "removed",
});

#[allow(dead_code)] // The presence and start-time rules (phases 2-3) use these.
impl LobbyStatus {
    /// Not started yet.
    pub const fn is_future(self) -> bool {
        matches!(
            self,
            Self::Planned | Self::Proposed | Self::Confirmed | Self::Delayed
        )
    }

    /// Past its start: someone can be in it now.
    pub const fn is_running(self) -> bool {
        matches!(self, Self::Waiting | Self::Grace | Self::Live | Self::Empty)
    }

    pub const fn is_over(self) -> bool {
        matches!(self, Self::Done | Self::Removed)
    }
}

string_enum!(LobbySource {
    Plan = "plan",
    Suggestion = "suggestion",
    Proposal = "proposal",
    Steam = "steam",
    Split = "split",
    Vote = "vote",
});

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct Team {
    pub name: String,
    pub size: i32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct Food {
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

/// A lobby: one row of `event_game_schedule`.
#[derive(Debug, Clone, PartialEq)]
pub struct Lobby {
    /// Negative for lobbies created by the engine and not yet stored.
    pub id: i32,
    pub kind: LobbyKind,
    pub game_id: Option<i64>,
    /// The game's name, or the food's.
    pub name: String,
    pub food: Option<Food>,
    pub status: LobbyStatus,
    pub source: LobbySource,
    /// Current best start and length (actual once played).
    pub start: DateTime<Utc>,
    pub minutes: i32,
    pub planned_start: Option<DateTime<Utc>>,
    pub planned_minutes: Option<i32>,
    pub actual_start: Option<DateTime<Utc>>,
    pub actual_end: Option<DateTime<Utc>>,
    pub max_players: Option<i32>,
    pub teams: Option<Vec<Team>>,
    pub proposed_by: Option<Email>,
    pub created_by_vote: Option<i64>,
    pub grace_until: Option<DateTime<Utc>>,
    pub grace_locked: bool,
    pub hold_remaining_s: Option<i32>,
    pub empty_since: Option<DateTime<Utc>>,
    pub is_pinned: bool,
    pub created_at: DateTime<Utc>,
    pub version: i32,
}

impl Lobby {
    #[allow(dead_code)]
    pub fn end(&self) -> DateTime<Utc> {
        self.start + Duration::minutes(i64::from(self.minutes))
    }

    /// Freeze the planned time before the first live change (§4.5).
    pub fn freeze_plan(&mut self) {
        if self.planned_start.is_none() {
            self.planned_start = Some(self.start);
            self.planned_minutes = Some(self.minutes);
        }
    }
}

/// Saved players and teams for a game (`game_lobby_defaults`).
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct GameDefaults {
    pub max_players: Option<i32>,
    pub teams: Option<Vec<Team>>,
    pub duration_minutes: Option<i32>,
}

/// How long a game is typically played for, learned from history (§5.6).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Typical {
    pub minutes: i32,
    /// Played sessions it was learned from (0 for fallbacks).
    pub sessions: i64,
}

/// Everything the rules need about one event.
#[derive(Debug, Clone, PartialEq)]
pub struct LiveState {
    pub event: EventInfo,
    pub people: BTreeMap<Email, Person>,
    pub checkins: BTreeMap<Email, CheckIn>,
    pub lobbies: BTreeMap<i32, Lobby>,
    pub defaults: BTreeMap<i64, GameDefaults>,
    pub typical: BTreeMap<i64, Typical>,
    /// Next temporary id (counting down from -1) for new rows.
    pub next_temp_id: i64,
}

impl LiveState {
    pub fn new(event: EventInfo) -> Self {
        Self {
            event,
            people: BTreeMap::new(),
            checkins: BTreeMap::new(),
            lobbies: BTreeMap::new(),
            defaults: BTreeMap::new(),
            typical: BTreeMap::new(),
            next_temp_id: -1,
        }
    }

    /// A fresh temporary id; the store swaps it for a real one on insert.
    pub fn temp_id(&mut self) -> i64 {
        let id = self.next_temp_id;
        self.next_temp_id -= 1;
        id
    }

    pub fn temp_lobby_id(&mut self) -> i32 {
        i32::try_from(self.temp_id()).unwrap_or(i32::MIN)
    }

    pub fn is_checked_in(&self, email: &str) -> bool {
        self.checkins.contains_key(email)
    }

    /// Typical length for a game, with the fallbacks of §5.6.
    pub fn typical_for(&self, game_id: Option<i64>) -> Typical {
        let Some(game_id) = game_id else {
            return Typical {
                minutes: 60,
                sessions: 0,
            };
        };
        if let Some(t) = self.typical.get(&game_id) {
            return *t;
        }
        if let Some(minutes) = self.defaults.get(&game_id).and_then(|d| d.duration_minutes) {
            return Typical {
                minutes,
                sessions: 0,
            };
        }
        Typical {
            minutes: DEFAULT_GAME_MINUTES,
            sessions: 0,
        }
    }
}

/// Length used when nothing better is known (the planner's old default).
pub const DEFAULT_GAME_MINUTES: i32 = 120;

/// Round to the nearest 30 minutes, clamped to 30m-6h (§5.6).
pub fn round_typical(minutes: f64) -> i32 {
    let rounded = (minutes / 30.0).round() * 30.0;
    #[allow(clippy::cast_possible_truncation)]
    let rounded = rounded as i32;
    rounded.clamp(30, 360)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pids_are_stable_and_case_insensitive() {
        assert_eq!(pid("A@Example.com"), pid("a@example.com"));
        assert_eq!(pid("a@example.com").len(), 12);
        assert_ne!(pid("a@example.com"), pid("b@example.com"));
    }

    #[test]
    fn typical_rounding() {
        assert_eq!(round_typical(44.0), 30);
        assert_eq!(round_typical(46.0), 60);
        assert_eq!(round_typical(10.0), 30);
        assert_eq!(round_typical(1000.0), 360);
        assert_eq!(round_typical(240.0), 240);
    }

    #[test]
    fn status_groups() {
        assert!(LobbyStatus::Planned.is_future());
        assert!(LobbyStatus::Grace.is_running());
        assert!(LobbyStatus::Done.is_over());
        assert_eq!(LobbyStatus::parse("grace"), Some(LobbyStatus::Grace));
        assert_eq!(LobbyStatus::parse("nope"), None);
    }
}
