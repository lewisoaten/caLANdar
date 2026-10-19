//! What clients see: serialisable projections of a [`LiveState`].
//!
//! The stream sends a full view whenever it changes (DESIGN.md §3.2: full
//! entity snapshots, not patches), so the store builds the views before and
//! after a step and emits only those that differ. People appear by `pid`.

use std::collections::BTreeMap;

use chrono::{DateTime, Utc};
use rocket::serde::{Deserialize, Serialize};
use rocket_okapi::okapi::schemars::{self, JsonSchema};

use super::model::{pid, Email, Food, LiveState, Lobby, Team, Typical};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct SeatView {
    pub seat_id: i32,
    pub label: String,
    pub room_id: i32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct PresenceView {
    pub game_id: Option<i64>,
    pub game_name: Option<String>,
    pub via: Option<String>,
    pub afk: bool,
    pub switch_lobby_id: Option<String>,
    pub switch_grace_until: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct PersonView {
    pub pid: String,
    pub handle: String,
    pub avatar_url: String,
    pub seat: Option<SeatView>,
    pub rsvp: Option<String>,
    pub attendance: Vec<u8>,
    pub checked_in: bool,
    pub checked_in_at: Option<DateTime<Utc>>,
    pub has_steam: bool,
    /// Only shared once the person has checked in (Steam presence from home
    /// is nobody else's business).
    pub presence: Option<PresenceView>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct MemberView {
    pub pid: String,
    pub team: Option<String>,
    pub via: String,
    pub joined_at: DateTime<Utc>,
    pub left_at: Option<DateTime<Utc>>,
    pub left_reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct PrejoinView {
    pub pid: String,
    pub team: Option<String>,
    pub random: bool,
    pub created_at: DateTime<Utc>,
    pub dropped_at: Option<DateTime<Utc>>,
    pub drop_reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct TeamView {
    pub name: String,
    pub size: i32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct TypicalView {
    pub minutes: i32,
    pub sessions: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct FoodView {
    pub name: String,
    pub place_id: Option<String>,
    pub photo_url: Option<String>,
    pub rating: Option<f64>,
    pub address: Option<String>,
    pub free_text: Option<String>,
}

impl From<&Food> for FoodView {
    fn from(f: &Food) -> Self {
        Self {
            name: f.name.clone(),
            place_id: f.place_id.clone(),
            photo_url: f.photo_url.clone(),
            rating: f.rating,
            address: f.address.clone(),
            free_text: f.free_text.clone(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct LobbyView {
    /// Stored lobbies: the schedule entry id. Suggestions: `s<game>@<ms>`.
    pub id: String,
    pub kind: String,
    pub game_id: Option<i64>,
    pub name: String,
    pub food: Option<FoodView>,
    pub status: String,
    pub source: String,
    pub start: DateTime<Utc>,
    pub minutes: i32,
    pub planned_start: Option<DateTime<Utc>>,
    pub planned_minutes: Option<i32>,
    pub actual_start: Option<DateTime<Utc>>,
    pub actual_end: Option<DateTime<Utc>>,
    pub max_players: Option<i32>,
    pub teams: Option<Vec<TeamView>>,
    pub proposed_by: Option<String>,
    pub created_by_vote: Option<String>,
    pub grace_until: Option<DateTime<Utc>>,
    pub grace_locked: bool,
    pub empty_since: Option<DateTime<Utc>>,
    pub members: Vec<MemberView>,
    pub prejoins: Vec<PrejoinView>,
    pub needs_setup: bool,
    pub typical: Option<TypicalView>,
    pub is_pinned: bool,
    #[serde(rename = "virtual")]
    pub is_virtual: bool,
}

fn teams_view(teams: Option<&Vec<Team>>) -> Option<Vec<TeamView>> {
    teams.map(|teams| {
        teams
            .iter()
            .map(|t| TeamView {
                name: t.name.clone(),
                size: t.size,
            })
            .collect()
    })
}

const fn typical_view(t: Typical) -> TypicalView {
    TypicalView {
        minutes: t.minutes,
        sessions: t.sessions,
    }
}

pub fn person_view(state: &LiveState, email: &str) -> Option<PersonView> {
    let person = state.people.get(email)?;
    let checkin = state.checkins.get(email);
    Some(PersonView {
        pid: pid(email),
        handle: person.display_name(),
        avatar_url: crate::util::gravatar_url(email),
        seat: person.seat.as_ref().map(|s| SeatView {
            seat_id: s.seat_id,
            label: s.label.clone(),
            room_id: s.room_id,
        }),
        rsvp: person.rsvp.map(|r| r.as_str().to_string()),
        attendance: person.attendance.clone(),
        checked_in: checkin.is_some(),
        checked_in_at: checkin.map(|c| c.at),
        has_steam: person.steam_id.is_some(),
        presence: None,
    })
}

pub fn lobby_view(state: &LiveState, lobby: &Lobby) -> LobbyView {
    LobbyView {
        id: lobby.id.to_string(),
        kind: lobby.kind.as_str().to_string(),
        game_id: lobby.game_id,
        name: lobby.name.clone(),
        food: lobby.food.as_ref().map(FoodView::from),
        status: lobby.status.as_str().to_string(),
        source: lobby.source.as_str().to_string(),
        start: lobby.start,
        minutes: lobby.minutes,
        planned_start: lobby.planned_start,
        planned_minutes: lobby.planned_minutes,
        actual_start: lobby.actual_start,
        actual_end: lobby.actual_end,
        max_players: lobby.max_players,
        teams: teams_view(lobby.teams.as_ref()),
        proposed_by: lobby.proposed_by.as_deref().map(pid),
        created_by_vote: lobby.created_by_vote.map(|v| v.to_string()),
        grace_until: lobby.grace_until,
        grace_locked: lobby.grace_locked,
        empty_since: lobby.empty_since,
        members: Vec::new(),
        prejoins: Vec::new(),
        needs_setup: false,
        typical: lobby
            .game_id
            .map(|g| typical_view(state.typical_for(Some(g)))),
        is_pinned: lobby.is_pinned,
        is_virtual: false,
    }
}

/// Every person's view, by email.
pub fn people_views(state: &LiveState) -> BTreeMap<Email, PersonView> {
    state
        .people
        .keys()
        .filter_map(|email| person_view(state, email).map(|v| (email.clone(), v)))
        .collect()
}

/// Every lobby's view, by id.
pub fn lobby_views(state: &LiveState) -> BTreeMap<i32, LobbyView> {
    state
        .lobbies
        .iter()
        .map(|(id, lobby)| (*id, lobby_view(state, lobby)))
        .collect()
}

/// A planner suggestion as a virtual lobby (DESIGN.md §4.5).
pub fn suggestion_view(
    state: &LiveState,
    game_id: i64,
    name: &str,
    start: DateTime<Utc>,
    minutes: i32,
) -> LobbyView {
    LobbyView {
        id: suggestion_id(game_id, start),
        kind: "game".to_string(),
        game_id: Some(game_id),
        name: name.to_string(),
        food: None,
        status: "planned".to_string(),
        source: "suggestion".to_string(),
        start,
        minutes,
        planned_start: None,
        planned_minutes: None,
        actual_start: None,
        actual_end: None,
        max_players: state.defaults.get(&game_id).and_then(|d| d.max_players),
        teams: teams_view(state.defaults.get(&game_id).and_then(|d| d.teams.as_ref())),
        proposed_by: None,
        created_by_vote: None,
        grace_until: None,
        grace_locked: false,
        empty_since: None,
        members: Vec::new(),
        prejoins: Vec::new(),
        needs_setup: false,
        typical: Some(typical_view(state.typical_for(Some(game_id)))),
        is_pinned: false,
        is_virtual: true,
    }
}

/// `s<gameId>@<startMs>`, the stable id of a suggestion (the schedule page's
/// `sessionKey` convention).
pub fn suggestion_id(game_id: i64, start: DateTime<Utc>) -> String {
    format!("s{game_id}@{}", start.timestamp_millis())
}

/// Parse a suggestion id back into `(game_id, start)`.
#[allow(dead_code)] // Pre-joining a suggestion (phase 2) materialises it.
pub fn parse_suggestion_id(id: &str) -> Option<(i64, DateTime<Utc>)> {
    let rest = id.strip_prefix('s')?;
    let (game, ms) = rest.split_once('@')?;
    Some((
        game.parse().ok()?,
        DateTime::from_timestamp_millis(ms.parse().ok()?)?,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn suggestion_ids_round_trip() {
        let start = Utc
            .with_ymd_and_hms(2026, 10, 23, 20, 0, 0)
            .single()
            .expect("valid");
        let id = suggestion_id(730, start);
        assert_eq!(id, format!("s730@{}", start.timestamp_millis()));
        assert_eq!(parse_suggestion_id(&id), Some((730, start)));
        assert_eq!(parse_suggestion_id("12"), None);
        assert_eq!(parse_suggestion_id("sx@1"), None);
    }
}
