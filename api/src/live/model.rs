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
    pub discord_webhook_url: Option<String>,
    /// e.g. `03:00-09:00`: the wall-board sleeps then (local time).
    pub wallboard_sleep: Option<String>,
    /// `{name, lat, lng}` for food near the venue.
    pub venue: Option<rocket::serde::json::serde_json::Value>,
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

    /// Attending (yes/maybe) and around at `t` by their declared attendance.
    /// No attendance declared counts as around the whole time.
    pub fn attending_at(&self, event: &EventInfo, t: DateTime<Utc>) -> bool {
        if !self.attending() {
            return false;
        }
        if self.attendance.is_empty() {
            return true;
        }
        bucket_index(event.time_begin, event.time_end, t)
            .is_none_or(|i| self.attendance.get(i).copied().unwrap_or(0) == 1)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CheckIn {
    pub email: Email,
    pub at: DateTime<Utc>,
    pub by: Email,
    /// Stepped out until then (they count as not checked in); `None` is here.
    pub away_until: Option<DateTime<Utc>>,
    /// Checked out because their RSVP says they've left; back by themselves
    /// when it says they're around.
    pub departed: bool,
    /// Here although their RSVP says they've left (checked in again).
    pub staying: bool,
}

impl CheckIn {
    /// Checked in and here: not stepped out, and not gone by their RSVP.
    pub const fn here(&self) -> bool {
        self.away_until.is_none() && !self.departed
    }
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

impl LobbyStatus {
    /// Past its start: someone can be in it now.
    pub const fn is_running(self) -> bool {
        matches!(self, Self::Waiting | Self::Grace | Self::Live | Self::Empty)
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
    pub set_by: Option<Email>,
}

string_enum!(Via {
    Steam = "steam",
    Manual = "manual",
    Admin = "admin",
});

/// One stay in a lobby (`lobby_member`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Member {
    /// Negative until stored.
    pub id: i64,
    pub lobby_id: i32,
    pub email: Email,
    pub team: Option<String>,
    pub via: Via,
    pub joined_at: DateTime<Utc>,
    pub left_at: Option<DateTime<Utc>>,
    pub left_reason: Option<String>,
    pub manual_expires_at: Option<DateTime<Utc>>,
}

impl Member {
    pub const fn is_open(&self) -> bool {
        self.left_at.is_none()
    }
}

/// A pre-join (`lobby_prejoin`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Prejoin {
    pub lobby_id: i32,
    pub email: Email,
    pub team: Option<String>,
    pub random_team: bool,
    pub created_at: DateTime<Utc>,
    pub dropped_at: Option<DateTime<Utc>>,
    pub drop_reason: Option<String>,
}

impl Prejoin {
    pub const fn is_active(&self) -> bool {
        self.dropped_at.is_none()
    }
}

string_enum!(VoteType {
    Slot = "slot",
    Extend = "extend",
    Delay = "delay",
    Change = "change",
    Kickoff = "kickoff",
});

string_enum!(VoteStatus {
    Open = "open",
    Final = "final",
    Vetoed = "vetoed",
    Lapsed = "lapsed",
});

string_enum!(OptionKind {
    Lobby = "lobby",
    Game = "game",
    Food = "food",
    KeepPlaying = "keep_playing",
    Yes = "yes",
    No = "no",
});

/// A competitive decision (`live_vote`, DESIGN.md §5.3).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Vote {
    /// Negative until stored.
    pub id: i64,
    pub kind: VoteType,
    pub target_lobby_id: Option<i32>,
    pub slot_start: Option<DateTime<Utc>>,
    pub status: VoteStatus,
    pub resolution: Option<String>,
    pub opened_by: Email,
    pub opened_at: DateTime<Utc>,
    pub deadline: DateTime<Utc>,
    pub settle_at: Option<DateTime<Utc>>,
    pub resolved_by: Option<Email>,
    pub resolved_at: Option<DateTime<Utc>>,
    pub winner_option_id: Option<i64>,
}

/// One option of a vote (`live_vote_option`).
#[derive(Debug, Clone, PartialEq)]
pub struct VoteOption {
    /// Negative until stored.
    pub id: i64,
    pub vote_id: i64,
    pub kind: OptionKind,
    pub lobby_id: Option<i32>,
    pub game_id: Option<i64>,
    /// Game name (not stored: looked up), or the food's name.
    pub name: String,
    pub food: Option<Food>,
    pub start_delta_min: Option<i32>,
    pub duration_min: Option<i32>,
    pub new_start: Option<DateTime<Utc>>,
    pub max_players: Option<i32>,
    pub teams: Option<Vec<Team>>,
    pub created_by: Option<Email>,
    pub created_at: DateTime<Utc>,
}

/// Someone's vote (`live_vote_ballot`): their option and whether they're
/// happy to split the party.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Ballot {
    pub vote_id: i64,
    pub email: Email,
    pub option_id: Option<i64>,
    pub split_ok: bool,
    pub updated_at: DateTime<Utc>,
}

/// The 6-hour attendance buckets of an event, `[start, stop)`, in the order
/// of `get_day_quarter_buckets(begin, end)`.
fn buckets(begin: DateTime<Utc>, end: DateTime<Utc>) -> Vec<(DateTime<Utc>, DateTime<Utc>)> {
    let mut out = Vec::new();
    let mut day = begin.date_naive();
    while let Some(six) = day.and_hms_opt(6, 0, 0) {
        if six.and_utc() >= end {
            break;
        }
        let Some(midnight) = day.and_hms_opt(0, 0, 0) else {
            break;
        };
        for hour in [6, 12, 18, 24] {
            let start = midnight.and_utc() + Duration::hours(hour);
            let stop = start + Duration::hours(6);
            if start <= end && stop > begin {
                out.push((start, stop));
            }
        }
        let Some(next) = day.succ_opt() else {
            break;
        };
        day = next;
    }
    out
}

/// Index of the 6-hour attendance bucket containing `t`.
pub fn bucket_index(begin: DateTime<Utc>, end: DateTime<Utc>, t: DateTime<Utc>) -> Option<usize> {
    buckets(begin, end)
        .iter()
        .position(|&(start, stop)| start <= t && t < stop)
}

/// How many attendance buckets the event has.
pub fn bucket_count(begin: DateTime<Utc>, end: DateTime<Utc>) -> usize {
    buckets(begin, end).len()
}

/// Steam persona states that mean "away" (Away, Snooze).
pub const AFK_STATES: [i32; 2] = [3, 4];
/// How long someone must be away before the floor fades their seat.
pub const AFK_AFTER: Duration = Duration::minutes(10);

/// Latest presence of a person (`live_presence`).
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Presence {
    pub email: Email,
    /// The game Steam says they're playing (after the debounce).
    pub game_id: Option<i64>,
    pub game_name: Option<String>,
    pub persona_state: i32,
    /// Steam `communityvisibilitystate`: 3 is public.
    pub visibility: i32,
    pub observed_at: Option<DateTime<Utc>>,
    pub pending_game_id: Option<i64>,
    pub pending_game_name: Option<String>,
    pub pending_since: Option<DateTime<Utc>>,
    pub afk_since: Option<DateTime<Utc>>,
    pub afk_noted: bool,
    pub ignore_game_id: Option<i64>,
    pub switch_lobby_id: Option<i32>,
    pub switch_grace_until: Option<DateTime<Utc>>,
    pub private_hint_sent: bool,
}

impl Presence {
    pub fn new(email: &str) -> Self {
        Self {
            email: email.to_string(),
            visibility: 3,
            ..Self::default()
        }
    }

    pub fn is_afk(&self, now: DateTime<Utc>) -> bool {
        self.afk_since.is_some_and(|since| now - since >= AFK_AFTER)
    }
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
    pub members: BTreeMap<i64, Member>,
    pub prejoins: BTreeMap<(i32, Email), Prejoin>,
    pub presence: BTreeMap<Email, Presence>,
    pub votes: BTreeMap<i64, Vote>,
    pub options: BTreeMap<i64, VoteOption>,
    pub ballots: BTreeMap<(i64, Email), Ballot>,
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
            members: BTreeMap::new(),
            prejoins: BTreeMap::new(),
            presence: BTreeMap::new(),
            votes: BTreeMap::new(),
            options: BTreeMap::new(),
            ballots: BTreeMap::new(),
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

    /// Checked in and here (not stepped out).
    pub fn is_checked_in(&self, email: &str) -> bool {
        self.checkins.get(email).is_some_and(CheckIn::here)
    }

    /// Checked in earlier but not here now (stepped out, or gone by RSVP).
    pub fn is_away(&self, email: &str) -> bool {
        self.checkins.get(email).is_some_and(|c| !c.here())
    }

    /// Whether anyone is here right now.
    pub fn anyone_checked_in(&self) -> bool {
        self.checkins.values().any(CheckIn::here)
    }

    /// The lobby someone is in right now, as `(member id, lobby id)`.
    pub fn current_membership(&self, email: &str) -> Option<(i64, i32)> {
        self.members
            .values()
            .find(|m| m.email == email && m.is_open())
            .map(|m| (m.id, m.lobby_id))
    }

    /// Open members of a lobby.
    pub fn members_of(&self, lobby_id: i32) -> impl Iterator<Item = &Member> {
        self.members
            .values()
            .filter(move |m| m.lobby_id == lobby_id && m.is_open())
    }

    /// Active pre-joins of a lobby.
    pub fn prejoins_of(&self, lobby_id: i32) -> impl Iterator<Item = &Prejoin> {
        self.prejoins
            .values()
            .filter(move |p| p.lobby_id == lobby_id && p.is_active())
    }

    /// People in or pre-joined to a lobby (each once).
    pub fn lobby_headcount(&self, lobby_id: i32) -> usize {
        let mut people: Vec<&str> = self
            .members_of(lobby_id)
            .map(|m| m.email.as_str())
            .collect();
        for p in self.prejoins_of(lobby_id) {
            if !people.contains(&p.email.as_str()) {
                people.push(&p.email);
            }
        }
        people.len()
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
    fn bucket_index_matches_the_attendance_buckets() {
        use chrono::TimeZone;
        let at = |d, h, m| {
            Utc.with_ymd_and_hms(2026, 10, d, h, m, 0)
                .single()
                .expect("valid")
        };
        // Fri 18:00 -> Sun 16:00: buckets Fri 18, Sat 00, 06, 12, 18, Sun 00, 06, 12.
        let (begin, end) = (at(23, 18, 0), at(25, 16, 0));
        assert_eq!(
            crate::controllers::event_invitation::get_day_quarter_buckets(begin, end).len(),
            8
        );
        assert_eq!(bucket_index(begin, end, at(23, 18, 0)), Some(0));
        assert_eq!(bucket_index(begin, end, at(23, 23, 59)), Some(0));
        assert_eq!(bucket_index(begin, end, at(24, 0, 0)), Some(1));
        assert_eq!(bucket_index(begin, end, at(24, 12, 30)), Some(3));
        assert_eq!(bucket_index(begin, end, at(25, 15, 0)), Some(7));
        assert_eq!(bucket_index(begin, end, at(23, 17, 0)), None);
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
        assert!(LobbyStatus::Grace.is_running());
        assert!(!LobbyStatus::Done.is_running());
        assert_eq!(LobbyStatus::parse("grace"), Some(LobbyStatus::Grace));
        assert_eq!(LobbyStatus::parse("nope"), None);
    }
}
