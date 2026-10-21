//! Joining, leaving and pre-joining lobbies (DESIGN.md §5.1, §5.4).
//!
//! You have one *now* lobby (an open `Member`) and any number of pre-joins.
//! Joining a lobby closes your previous membership; the last person out
//! leaves a live lobby `empty`, and five minutes later it is `done`.

use chrono::{DateTime, Duration, Utc};
use rocket::serde::json::json;

use super::{schedule, Actor, FeedEntry, LobbyRef, Outcome, Reject};
use crate::live::model::{
    Email, LiveState, Lobby, LobbyKind, LobbySource, LobbyStatus, Member, Prejoin, Presence, Via,
};

/// How early before its start a lobby can be joined, by hand or by Steam:
/// it starts early. People pre-joined keep their grace until five minutes
/// after the scheduled start.
pub const EARLY_JOIN: Duration = Duration::minutes(60);
/// How long you have to launch the game after joining by hand while Steam
/// shows another one.
pub const SWITCH_GRACE: Duration = Duration::minutes(5);
/// A manual "now" lapses this long after the lobby's planned end.
pub const MANUAL_OVERRUN: Duration = Duration::minutes(30);
/// "Still playing" extends a manual "now" by this much.
pub const STILL_PLAYING: Duration = Duration::minutes(60);
/// An empty lobby closes this long after the last person left.
pub const EMPTY_CLOSE: Duration = Duration::minutes(5);
/// The start-time grace: five minutes to join (§5.4).
pub const GRACE: Duration = Duration::minutes(5);

/// Most people a lobby takes, if limited.
pub fn capacity(lobby: &Lobby) -> Option<i32> {
    lobby
        .teams
        .as_ref()
        .map(|teams| teams.iter().map(|t| t.size).sum())
        .or(lobby.max_players)
}

/// Can someone be *in* this lobby now (as opposed to pre-joining it)?
pub fn joinable_now(lobby: &Lobby, now: DateTime<Utc>) -> bool {
    if lobby.status.is_running() {
        return true;
    }
    matches!(
        lobby.status,
        LobbyStatus::Planned | LobbyStatus::Confirmed | LobbyStatus::Delayed
    ) && now >= lobby.start - EARLY_JOIN
        && now < lobby.end()
}

/// Take someone out of the lobby they're in, if any.
pub fn leave_current(
    state: &mut LiveState,
    email: &str,
    reason: &str,
    now: DateTime<Utc>,
    out: &mut Outcome,
) -> Option<i32> {
    let (member_id, lobby_id) = state.current_membership(email)?;
    leave(state, member_id, reason, now, out);
    Some(lobby_id)
}

/// Close a membership. The last person out leaves a live lobby empty.
pub fn leave(
    state: &mut LiveState,
    member_id: i64,
    reason: &str,
    now: DateTime<Utc>,
    out: &mut Outcome,
) {
    let Some(member) = state.members.get_mut(&member_id) else {
        return;
    };
    if !member.is_open() {
        return;
    }
    member.left_at = Some(now);
    member.left_reason = Some(reason.to_string());
    let lobby_id = member.lobby_id;
    if state.members_of(lobby_id).next().is_some() {
        return;
    }
    if let Some(lobby) = state.lobbies.get_mut(&lobby_id) {
        // Started early and everyone left before the scheduled start: it
        // hasn't really started, so it starts on schedule as planned.
        if lobby.status == LobbyStatus::Grace && now < lobby.start {
            let backed = state
                .prejoins
                .values()
                .any(|p| p.lobby_id == lobby_id && p.is_active());
            lobby.status = if lobby.source == LobbySource::Proposal || backed {
                LobbyStatus::Confirmed
            } else {
                LobbyStatus::Planned
            };
            lobby.grace_until = None;
            lobby.grace_locked = false;
            lobby.actual_start = None;
            lobby.version += 1;
            return;
        }
        if lobby.status == LobbyStatus::Live {
            lobby.status = LobbyStatus::Empty;
            lobby.empty_since = Some(now);
            // "More time" on an empty lobby is kept here (see `more_time`).
            lobby.grace_until = None;
            lobby.version += 1;
            out.feed.push(
                FeedEntry::new(2, "lobby.empty", "everyone left")
                    .lobby(lobby_id)
                    .data(json!({ "kicker": "Empty", "closesAt": now + EMPTY_CLOSE })),
            );
        }
    }
}

/// Put someone in a lobby now. Closes their previous membership, starts the
/// lobby if it hasn't started, and takes their pre-join's team.
pub fn join(
    state: &mut LiveState,
    email: &str,
    lobby_id: i32,
    via: Via,
    now: DateTime<Utc>,
    out: &mut Outcome,
) {
    if state
        .current_membership(email)
        .is_some_and(|(_, current)| current == lobby_id)
    {
        return;
    }
    leave_current(state, email, "switched", now, out);
    if let Some(p) = state.presence.get_mut(email) {
        p.switch_lobby_id = None;
        p.switch_grace_until = None;
    }

    let Some(lobby) = state.lobbies.get(&lobby_id) else {
        return;
    };
    let manual_expires_at = (via != Via::Steam).then(|| lobby.end().max(now) + MANUAL_OVERRUN);
    let team = state
        .prejoins
        .get(&(lobby_id, email.to_string()))
        .filter(|p| p.is_active())
        .and_then(|p| p.team.clone());
    let id = state.temp_id();
    state.members.insert(
        id,
        Member {
            id,
            lobby_id,
            email: email.to_string(),
            team,
            via,
            joined_at: now,
            left_at: None,
            left_reason: None,
            manual_expires_at,
        },
    );

    let Some(lobby) = state.lobbies.get_mut(&lobby_id) else {
        return;
    };
    let starting = !matches!(
        lobby.status,
        LobbyStatus::Live | LobbyStatus::Empty | LobbyStatus::Grace
    );
    match lobby.status {
        LobbyStatus::Empty => {
            lobby.status = LobbyStatus::Live;
            lobby.empty_since = None;
            lobby.grace_until = None;
        }
        LobbyStatus::Live | LobbyStatus::Grace => {}
        _ => {
            // Someone's in: the grace locks (§5.4.2). Anyone pre-joined who
            // is still elsewhere when it ends drops out.
            lobby.status = LobbyStatus::Grace;
            lobby.grace_locked = true;
            lobby.grace_until = Some(lobby.start.max(now) + GRACE);
            lobby.hold_remaining_s = None;
        }
    }
    if lobby.actual_start.is_none() {
        lobby.actual_start = Some(now);
    }
    lobby.version += 1;
    if starting {
        super::votes::cancel_delays(state, lobby_id, now);
        out.feed.push(
            FeedEntry::new(2, "lobby.started", "started")
                .lobby(lobby_id)
                .people(vec![email.to_string()])
                .data(json!({ "kicker": "Started", "actualStart": now })),
        );
    }
}

/// Close everyone out of a lobby and mark it done with its actual times.
pub fn finish_lobby(
    state: &mut LiveState,
    lobby_id: i32,
    now: DateTime<Utc>,
    reason: &str,
    out: &mut Outcome,
) {
    let open: Vec<i64> = state.members_of(lobby_id).map(|m| m.id).collect();
    let game = state.lobbies.get(&lobby_id).and_then(|l| l.game_id);
    for id in open {
        let Some(m) = state.members.get_mut(&id) else {
            continue;
        };
        m.left_at = Some(now);
        m.left_reason = Some(reason.to_string());
        // Still playing it: don't let Steam recreate the lobby just ended.
        let email = m.email.clone();
        if let Some(p) = state.presence.get_mut(&email) {
            if game.is_some() && p.game_id == game {
                p.ignore_game_id = game;
            }
        }
    }
    let played: Vec<Email> = {
        let mut people: Vec<Email> = Vec::new();
        for m in state.members.values().filter(|m| m.lobby_id == lobby_id) {
            if !people.contains(&m.email) {
                people.push(m.email.clone());
            }
        }
        people
    };
    let Some(lobby) = state.lobbies.get_mut(&lobby_id) else {
        return;
    };
    let end = lobby.empty_since.unwrap_or(now);
    let start = lobby.actual_start.unwrap_or(lobby.start);
    lobby.freeze_plan();
    lobby.status = LobbyStatus::Done;
    lobby.actual_start = Some(start);
    lobby.actual_end = Some(end.max(start));
    lobby.start = start;
    lobby.minutes = i32::try_from((end - start).num_minutes().max(1)).unwrap_or(1);
    lobby.empty_since = None;
    lobby.version += 1;
    out.feed.push(
        FeedEntry::new(2, "lobby.ended", "ended")
            .lobby(lobby_id)
            .people(played)
            .data(json!({ "kicker": "Ended", "actualStart": start, "actualEnd": end })),
    );
}

/// Drop every row that hangs off a lobby (it is being deleted).
pub fn forget_lobby(state: &mut LiveState, lobby_id: i32) {
    state.members.retain(|_, m| m.lobby_id != lobby_id);
    state.prejoins.retain(|(l, _), _| *l != lobby_id);
    for p in state.presence.values_mut() {
        if p.switch_lobby_id == Some(lobby_id) {
            p.switch_lobby_id = None;
            p.switch_grace_until = None;
        }
    }
}

fn require_checked_in(state: &LiveState, email: &str) -> Result<(), Reject> {
    if state.is_checked_in(email) {
        Ok(())
    } else {
        Err(Reject::Conflict("Check in first".to_string()))
    }
}

/// "I'm playing this now."
pub fn join_command(
    state: &mut LiveState,
    actor: &Actor,
    lobby_id: i32,
    now: DateTime<Utc>,
    out: &mut Outcome,
) -> Result<(), Reject> {
    require_checked_in(state, &actor.email)?;
    let lobby = super::lobby_mut(state, lobby_id)?.clone();
    if lobby.status == LobbyStatus::Done {
        return Err(Reject::Conflict(
            "That lobby has finished. Propose it again instead.".to_string(),
        ));
    }
    if !joinable_now(&lobby, now) {
        return Err(Reject::Conflict(
            "That lobby hasn't started yet. Pre-join it instead.".to_string(),
        ));
    }
    if state
        .current_membership(&actor.email)
        .is_some_and(|(_, current)| current == lobby_id)
    {
        return Ok(());
    }
    if let Some(cap) = capacity(&lobby) {
        let inside = i32::try_from(state.members_of(lobby_id).count()).unwrap_or(i32::MAX);
        if inside >= cap {
            return Err(Reject::Conflict("That lobby is full".to_string()));
        }
    }
    // One game at a time: Steam wins until you launch the new game (§5.1.2).
    let steam_game = state
        .presence
        .get(&actor.email)
        .filter(|p| p.observed_at.is_some())
        .and_then(|p| p.game_id);
    if lobby.kind == LobbyKind::Game {
        if let Some(playing) = steam_game {
            if Some(playing) != lobby.game_id {
                let presence = state
                    .presence
                    .entry(actor.email.clone())
                    .or_insert_with(|| Presence::new(&actor.email));
                presence.switch_lobby_id = Some(lobby_id);
                presence.switch_grace_until = Some(now + SWITCH_GRACE);
                return Ok(());
            }
        }
    }
    join(state, &actor.email, lobby_id, Via::Manual, now, out);
    out.feed.push(
        FeedEntry::new(3, "lobby.joined", "joined")
            .actor(&actor.email)
            .lobby(lobby_id),
    );
    Ok(())
}

/// "I'm not playing": leave your lobby. If Steam still shows its game, that
/// game no longer pulls you back in until Steam shows a different one.
pub fn leave_command(
    state: &mut LiveState,
    actor: &Actor,
    now: DateTime<Utc>,
    out: &mut Outcome,
) -> Result<(), Reject> {
    let presence_game = state.presence.get(&actor.email).and_then(|p| p.game_id);
    if let Some(p) = state.presence.get_mut(&actor.email) {
        p.switch_lobby_id = None;
        p.switch_grace_until = None;
    }
    let Some(lobby_id) = leave_current(state, &actor.email, "left", now, out) else {
        return Ok(());
    };
    let lobby_game = state.lobbies.get(&lobby_id).and_then(|l| l.game_id);
    if presence_game.is_some() && presence_game == lobby_game {
        if let Some(p) = state.presence.get_mut(&actor.email) {
            p.ignore_game_id = presence_game;
        }
    }
    out.feed.push(
        FeedEntry::new(4, "lobby.left", "left")
            .actor(&actor.email)
            .lobby(lobby_id),
    );
    Ok(())
}

/// "Still playing": keep a manual join from lapsing.
pub fn still_playing(
    state: &mut LiveState,
    actor: &Actor,
    lobby_id: i32,
    now: DateTime<Utc>,
) -> Result<(), Reject> {
    let member = state
        .members
        .values_mut()
        .find(|m| m.email == actor.email && m.lobby_id == lobby_id && m.is_open())
        .ok_or_else(|| Reject::Conflict("You aren't in that lobby".to_string()))?;
    member.manual_expires_at = Some(now + STILL_PLAYING);
    Ok(())
}

/// Store a planner suggestion someone acted on (DESIGN.md §4.5: the first
/// interaction materialises it, so re-planning can't pull it away).
pub fn materialise(state: &mut LiveState, s: &super::Suggestion, now: DateTime<Utc>) -> i32 {
    if let Some(existing) = state.lobbies.values().find(|l| {
        l.game_id == Some(s.game_id) && l.start == s.start && l.status != LobbyStatus::Removed
    }) {
        return existing.id;
    }
    schedule::new_lobby(
        state,
        s.game_id,
        s.game_name.clone(),
        LobbySource::Suggestion,
        LobbyStatus::Planned,
        s.start,
        s.minutes,
        now,
    )
}

/// Is the lobby one you can pre-join?
fn prejoinable(lobby: &Lobby) -> bool {
    matches!(
        lobby.status,
        LobbyStatus::Planned
            | LobbyStatus::Proposed
            | LobbyStatus::Confirmed
            | LobbyStatus::Delayed
            | LobbyStatus::Waiting
            | LobbyStatus::Grace
    )
}

/// Pre-join a lobby (or a suggestion, which is stored first). Returns the
/// lobby's id.
pub fn prejoin(
    state: &mut LiveState,
    actor: &Actor,
    target: LobbyRef,
    team: Option<String>,
    random: bool,
    now: DateTime<Utc>,
    out: &mut Outcome,
) -> Result<i32, Reject> {
    let email = actor.email.clone();
    let person = state
        .people
        .get(&email)
        .ok_or_else(|| Reject::Forbidden("You aren't invited to this event".to_string()))?;
    if !person.attending() {
        return Err(Reject::Conflict(
            "RSVP yes or maybe to join lobbies".to_string(),
        ));
    }
    let lobby_id = match target {
        LobbyRef::Stored(id) => id,
        LobbyRef::Suggested(s) => materialise(state, &s, now),
    };
    let lobby = super::lobby_mut(state, lobby_id)?.clone();
    if !prejoinable(&lobby) {
        return Err(Reject::Conflict(if lobby.status == LobbyStatus::Done {
            "That lobby has finished. Propose it again instead.".to_string()
        } else {
            "That lobby is running: join it instead".to_string()
        }));
    }
    let key = (lobby_id, email.clone());
    let existing = state.prejoins.get(&key).filter(|p| p.is_active()).cloned();

    let team = if random { None } else { team };
    if let Some(name) = &team {
        let Some(teams) = &lobby.teams else {
            return Err(Reject::BadInput("That lobby has no teams".to_string()));
        };
        let Some(spec) = teams.iter().find(|t| &t.name == name) else {
            return Err(Reject::BadInput(format!("No team called {name}")));
        };
        let taken = state
            .prejoins_of(lobby_id)
            .filter(|p| p.team.as_deref() == Some(name) && p.email != email)
            .count();
        if i32::try_from(taken).unwrap_or(i32::MAX) >= spec.size {
            return Err(Reject::Conflict(format!("{name} is full")));
        }
    }
    if existing.is_none() {
        if let Some(cap) = capacity(&lobby) {
            let count = i32::try_from(state.lobby_headcount(lobby_id)).unwrap_or(i32::MAX);
            if count >= cap {
                return Err(Reject::Conflict("That lobby is full".to_string()));
            }
        }
    }

    state.prejoins.insert(
        key,
        Prejoin {
            lobby_id,
            email: email.clone(),
            team,
            random_team: random,
            created_at: existing.as_ref().map_or(now, |p| p.created_at),
            dropped_at: None,
            drop_reason: None,
        },
    );
    let mut newly_backed = None;
    if let Some(lobby) = state.lobbies.get_mut(&lobby_id) {
        let backed = lobby.proposed_by.as_deref() != Some(email.as_str());
        if lobby.status == LobbyStatus::Proposed && backed {
            lobby.status = LobbyStatus::Confirmed;
            lobby.grace_until = None;
            newly_backed.clone_from(&lobby.proposed_by);
        } else if lobby.status == LobbyStatus::Planned {
            lobby.status = LobbyStatus::Confirmed;
        }
        lobby.version += 1;
    }
    if let Some(proposer) = newly_backed {
        // Additive proposals are final with one backer (§5.2).
        out.feed.push(
            FeedEntry::new(1, "lobby.backed", "backed")
                .actor(&proposer)
                .lobby(lobby_id)
                .people(vec![proposer.clone(), email.clone()])
                .data(json!({ "badge": "FINAL · BACKED", "voteType": "proposal" })),
        );
    }
    if existing.is_none() {
        out.feed.push(
            FeedEntry::new(3, "lobby.prejoined", "pre-joined")
                .actor(&email)
                .lobby(lobby_id),
        );
    }
    Ok(lobby_id)
}

/// Drop a pre-join. A stored suggestion nobody wants any more goes back to
/// the planner (its row is deleted).
pub fn unprejoin(
    state: &mut LiveState,
    actor: &Actor,
    lobby_id: i32,
    now: DateTime<Utc>,
    _out: &mut Outcome,
) -> Result<(), Reject> {
    let key = (lobby_id, actor.email.clone());
    let Some(prejoin) = state.prejoins.get_mut(&key).filter(|p| p.is_active()) else {
        return Ok(());
    };
    prejoin.dropped_at = Some(now);
    prejoin.drop_reason = Some("left".to_string());
    revert_if_unwanted(state, lobby_id);
    Ok(())
}

/// A future lobby with nobody left: back to planned, or (a stored
/// suggestion) back to the planner.
pub fn revert_if_unwanted(state: &mut LiveState, lobby_id: i32) {
    if state.lobby_headcount(lobby_id) > 0 {
        return;
    }
    let Some(lobby) = state.lobbies.get(&lobby_id) else {
        return;
    };
    if lobby.status != LobbyStatus::Confirmed {
        return;
    }
    if lobby.source == LobbySource::Suggestion && lobby.planned_start.is_none() {
        forget_lobby(state, lobby_id);
        state.lobbies.remove(&lobby_id);
    } else if let Some(lobby) = state.lobbies.get_mut(&lobby_id) {
        lobby.status = if lobby.source == LobbySource::Proposal {
            LobbyStatus::Proposed
        } else {
            LobbyStatus::Planned
        };
        lobby.version += 1;
    }
}
