//! What clients see: serialisable projections of a [`LiveState`].
//!
//! The stream sends a full view whenever it changes (DESIGN.md §3.2: full
//! entity snapshots, not patches), so the store builds the views before and
//! after a step and emits only those that differ. People appear by `pid`.

use std::collections::BTreeMap;

use chrono::{DateTime, Utc};
use rocket::serde::{Deserialize, Serialize};
use rocket_okapi::okapi::schemars::{self, JsonSchema};

use super::model::{
    pid, Email, Food, LiveState, Lobby, LobbySource, Member, Prejoin, Team, Typical,
};

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
    /// Stepped out until then (`checked_in` is false meanwhile).
    pub away_until: Option<DateTime<Utc>>,
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

pub fn person_view(state: &LiveState, email: &str, now: DateTime<Utc>) -> Option<PersonView> {
    let person = state.people.get(email)?;
    let checkin = state.checkins.get(email);
    let presence = checkin.filter(|c| c.away_until.is_none()).and_then(|_| {
        let p = state.presence.get(email);
        let via = state
            .current_membership(email)
            .and_then(|(member, _)| state.members.get(&member))
            .map(|m| m.via.as_str().to_string());
        if p.is_none() && via.is_none() {
            return None;
        }
        Some(PresenceView {
            game_id: p.and_then(|p| p.game_id),
            game_name: p.and_then(|p| p.game_name.clone()),
            via,
            afk: p.is_some_and(|p| p.is_afk(now)),
            switch_lobby_id: p.and_then(|p| p.switch_lobby_id).map(|id| id.to_string()),
            switch_grace_until: p.and_then(|p| p.switch_grace_until),
        })
    });
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
        checked_in: state.is_checked_in(email),
        checked_in_at: checkin.map(|c| c.at),
        away_until: checkin.and_then(|c| c.away_until),
        has_steam: person.steam_id.is_some(),
        presence,
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
        members: {
            let mut members: Vec<&Member> = state
                .members
                .values()
                .filter(|m| m.lobby_id == lobby.id)
                .collect();
            members.sort_by_key(|m| (m.joined_at, m.id));
            members
                .into_iter()
                .map(|m| MemberView {
                    pid: pid(&m.email),
                    team: m.team.clone(),
                    via: m.via.as_str().to_string(),
                    joined_at: m.joined_at,
                    left_at: m.left_at,
                    left_reason: m.left_reason.clone(),
                })
                .collect()
        },
        prejoins: {
            let mut prejoins: Vec<&Prejoin> = state
                .prejoins
                .values()
                .filter(|p| p.lobby_id == lobby.id)
                .collect();
            prejoins.sort_by_key(|p| p.created_at);
            prejoins
                .into_iter()
                .map(|p| PrejoinView {
                    pid: pid(&p.email),
                    team: p.team.clone(),
                    random: p.random_team,
                    created_at: p.created_at,
                    dropped_at: p.dropped_at,
                    drop_reason: p.drop_reason.clone(),
                })
                .collect()
        },
        // First time this game is seen on Steam: ask for players and teams.
        needs_setup: lobby.source == LobbySource::Steam
            && lobby.status.is_running()
            && lobby
                .game_id
                .is_some_and(|g| !state.defaults.contains_key(&g)),
        typical: lobby
            .game_id
            .map(|g| typical_view(state.typical_for(Some(g)))),
        is_pinned: lobby.is_pinned,
        is_virtual: false,
    }
}

/// One item of the admin's check-in queue.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct AdminQueueItem {
    pub pid: String,
    /// `playing-not-checked-in`
    pub kind: String,
    pub game_name: Option<String>,
}

/// The admin's check-in queue: people Steam shows playing who haven't
/// checked in, and (from 30 minutes after doors) people expected now who
/// haven't arrived.
pub fn admin_queue(state: &LiveState, now: DateTime<Utc>) -> Vec<AdminQueueItem> {
    let mut items: Vec<AdminQueueItem> = super::engine::playing_not_checked_in(state)
        .into_iter()
        .map(|(email, game_name)| AdminQueueItem {
            pid: pid(&email),
            kind: "playing-not-checked-in".to_string(),
            game_name,
        })
        .collect();
    if now >= state.event.time_begin + chrono::Duration::minutes(30) && now <= state.event.time_end
    {
        for person in state.people.values() {
            let id = pid(&person.email);
            if !state.is_checked_in(&person.email)
                && !state.is_away(&person.email)
                && person.attending_at(&state.event, now)
                && !items.iter().any(|i| i.pid == id)
            {
                items.push(AdminQueueItem {
                    pid: id,
                    kind: "expected-not-checked-in".to_string(),
                    game_name: None,
                });
            }
        }
    }
    items.sort_by(|a, b| (&a.kind, &a.pid).cmp(&(&b.kind, &b.pid)));
    items
}

/// Every person's view, by email.
pub fn people_views(state: &LiveState, now: DateTime<Utc>) -> BTreeMap<Email, PersonView> {
    state
        .people
        .keys()
        .filter_map(|email| person_view(state, email, now).map(|v| (email.clone(), v)))
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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct VoteOptionView {
    pub id: String,
    pub kind: String,
    pub lobby_id: Option<String>,
    pub game_id: Option<i64>,
    pub name: String,
    pub food: Option<FoodView>,
    pub start_delta_min: Option<i32>,
    pub duration_min: Option<i32>,
    pub new_start: Option<DateTime<Utc>>,
    pub created_by: Option<String>,
    /// pids of the involved people who picked this.
    pub voters: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct VoteView {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub title: String,
    pub target_lobby_id: Option<String>,
    pub slot_start: Option<DateTime<Utc>>,
    pub status: String,
    pub resolution: Option<String>,
    pub opened_by: String,
    pub opened_at: DateTime<Utc>,
    pub deadline: DateTime<Utc>,
    pub settle_at: Option<DateTime<Utc>>,
    pub resolved_at: Option<DateTime<Utc>>,
    pub winner_option_id: Option<String>,
    pub options: Vec<VoteOptionView>,
    pub split_ok: Vec<String>,
    pub involved: Vec<String>,
    pub waiting_on: Vec<String>,
    /// e.g. `EVERYONE CHECKED IN · 7/9`.
    pub involved_label: String,
}

pub fn vote_view(state: &LiveState, vote: &super::model::Vote) -> VoteView {
    use super::model::{OptionKind, VoteStatus, VoteType};
    let open = vote.status == VoteStatus::Open;
    // Final votes keep the voters they had; open ones count the involved.
    let involved = if open {
        super::engine::involved(state, vote)
    } else {
        state
            .ballots
            .values()
            .filter(|b| b.vote_id == vote.id)
            .map(|b| b.email.clone())
            .collect()
    };
    let ballots: Vec<_> = state
        .ballots
        .values()
        .filter(|b| b.vote_id == vote.id && b.option_id.is_some() && involved.contains(&b.email))
        .collect();
    let mut options: Vec<_> = state
        .options
        .values()
        .filter(|o| o.vote_id == vote.id)
        .collect();
    options.sort_by_key(|o| (o.created_at, o.id.unsigned_abs()));
    let voted: Vec<&str> = ballots.iter().map(|b| b.email.as_str()).collect();
    let label = match vote.kind {
        VoteType::Slot => "EVERYONE CHECKED IN",
        VoteType::Extend => "PEOPLE IN THE LOBBY",
        VoteType::Delay => "EVERYONE WHO'S IN FOR IT",
        VoteType::Change => "PEOPLE PRE-JOINED",
        VoteType::Kickoff => "EVERYONE AT THE START",
    };
    VoteView {
        id: vote.id.to_string(),
        kind: vote.kind.as_str().to_string(),
        title: super::engine::vote_title(state, vote),
        target_lobby_id: vote.target_lobby_id.map(|id| id.to_string()),
        slot_start: vote.slot_start,
        status: vote.status.as_str().to_string(),
        resolution: vote.resolution.clone(),
        opened_by: pid(&vote.opened_by),
        opened_at: vote.opened_at,
        deadline: vote.deadline,
        settle_at: vote.settle_at,
        resolved_at: vote.resolved_at,
        winner_option_id: vote.winner_option_id.map(|id| id.to_string()),
        options: options
            .into_iter()
            .map(|o| VoteOptionView {
                id: o.id.to_string(),
                kind: o.kind.as_str().to_string(),
                lobby_id: o.lobby_id.map(|id| id.to_string()),
                game_id: o.game_id,
                name: match o.kind {
                    OptionKind::Lobby => o
                        .lobby_id
                        .and_then(|id| state.lobbies.get(&id))
                        .map_or_else(|| o.name.clone(), |l| l.name.clone()),
                    _ => o.name.clone(),
                },
                food: o.food.as_ref().map(FoodView::from),
                start_delta_min: o.start_delta_min,
                duration_min: o.duration_min,
                new_start: o.new_start,
                created_by: o.created_by.as_deref().map(pid),
                voters: ballots
                    .iter()
                    .filter(|b| b.option_id == Some(o.id))
                    .map(|b| pid(&b.email))
                    .collect(),
            })
            .collect(),
        split_ok: ballots
            .iter()
            .filter(|b| b.split_ok)
            .map(|b| pid(&b.email))
            .collect(),
        waiting_on: involved
            .iter()
            .filter(|e| !voted.contains(&e.as_str()))
            .map(|e| pid(e))
            .collect(),
        involved_label: format!("{label} · {}/{}", voted.len(), involved.len()),
        involved: involved.iter().map(|e| pid(e)).collect(),
    }
}

/// Every vote's view, by id.
pub fn vote_views(state: &LiveState, _now: DateTime<Utc>) -> BTreeMap<i64, VoteView> {
    state
        .votes
        .values()
        .map(|v| (v.id, vote_view(state, v)))
        .collect()
}
