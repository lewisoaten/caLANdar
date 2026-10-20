//! Time-driven rules (DESIGN.md §3.6). Every timed rule is a stored deadline
//! processed here once it has passed, so ticking is idempotent and it does
//! not matter who ticks (a command, the stream instance, Cloud Scheduler or
//! a client whose countdown reached zero) or how late.

use chrono::{DateTime, Utc};
use rocket::serde::json::json;

use super::{membership, proposals, FeedEntry, Outcome};
use crate::live::model::{LiveState, LobbyKind, LobbyStatus, Prejoin};

pub fn run(state: &mut LiveState, now: DateTime<Utc>, out: &mut Outcome) {
    super::proposals::expire(state, now, out);
    super::votes::tick(state, now, out);
    start_machine(state, now, out);
    switch_graces(state, now);
    manual_expiry(state, now, out);
    food_ends(state, now, out);
    close_empty(state, now, out);
    afk(state, now, out);
}

/// A manual join of B while Steam showed A: if B wasn't launched within the
/// grace, the join becomes a pre-join of B and you stay in A (§5.1.2).
fn switch_graces(state: &mut LiveState, now: DateTime<Utc>) {
    let expired: Vec<(String, i32)> = state
        .presence
        .values()
        .filter_map(|p| match (p.switch_lobby_id, p.switch_grace_until) {
            (Some(lobby), Some(until)) if until <= now => Some((p.email.clone(), lobby)),
            _ => None,
        })
        .collect();
    for (email, lobby_id) in expired {
        if let Some(p) = state.presence.get_mut(&email) {
            p.switch_lobby_id = None;
            p.switch_grace_until = None;
        }
        if !state.lobbies.contains_key(&lobby_id) {
            continue;
        }
        let key = (lobby_id, email.clone());
        let already = state.prejoins.get(&key).is_some_and(Prejoin::is_active);
        if !already {
            state.prejoins.insert(
                key,
                Prejoin {
                    lobby_id,
                    email,
                    team: None,
                    random_team: false,
                    created_at: now,
                    dropped_at: None,
                    drop_reason: None,
                },
            );
            if let Some(lobby) = state.lobbies.get_mut(&lobby_id) {
                if lobby.status == LobbyStatus::Planned {
                    lobby.status = LobbyStatus::Confirmed;
                }
                lobby.version += 1;
            }
        }
    }
}

/// A manual "now" lapses (planned end + 30 minutes) unless the player said
/// they're still playing.
fn manual_expiry(state: &mut LiveState, now: DateTime<Utc>, out: &mut Outcome) {
    let expired: Vec<i64> = state
        .members
        .values()
        .filter(|m| m.is_open() && m.manual_expires_at.is_some_and(|t| t <= now))
        .map(|m| m.id)
        .collect();
    for id in expired {
        membership::leave(state, id, "expired", now, out);
    }
}

/// Food lobbies end at their end time: everyone leaves.
fn food_ends(state: &mut LiveState, now: DateTime<Utc>, out: &mut Outcome) {
    let ended: Vec<i32> = state
        .lobbies
        .values()
        .filter(|l| l.kind == LobbyKind::Food && l.status == LobbyStatus::Live && l.end() <= now)
        .map(|l| l.id)
        .collect();
    for id in ended {
        membership::finish_lobby(state, id, now, "ended", out);
    }
}

/// An empty lobby closes five minutes after the last person left (or later,
/// with more time); it ends at the time they left (§4.4).
fn close_empty(state: &mut LiveState, now: DateTime<Utc>, out: &mut Outcome) {
    let closing: Vec<i32> = state
        .lobbies
        .values()
        .filter(|l| {
            l.status == LobbyStatus::Empty
                && proposals::empty_closes_at(l).is_some_and(|t| t <= now)
        })
        .map(|l| l.id)
        .collect();
    for id in closing {
        membership::finish_lobby(state, id, now, "ended", out);
    }
}

/// Note in the feed (once) when a checked-in player has been away a while.
fn afk(state: &mut LiveState, now: DateTime<Utc>, out: &mut Outcome) {
    let newly: Vec<String> = state
        .presence
        .values()
        .filter(|p| !p.afk_noted && p.is_afk(now) && state.checkins.contains_key(&p.email))
        .map(|p| p.email.clone())
        .collect();
    for email in newly {
        if let Some(p) = state.presence.get_mut(&email) {
            p.afk_noted = true;
        }
        out.feed.push(
            FeedEntry::new(4, "presence.afk", "went AFK")
                .actor(&email)
                .data(json!({})),
        );
    }
}

/// The start-time machine (DESIGN.md §4.4, §5.4): at its start, a lobby
/// nobody has joined waits five minutes for someone (everyone involved gets
/// the pink alert); a joined lobby's grace runs to its end, when stragglers
/// drop out and the party splits; nobody by the end of a wait and the lobby
/// is booted back to the planner.
pub fn start_machine(state: &mut LiveState, now: DateTime<Utc>, out: &mut Outcome) {
    if now < state.event.time_begin {
        return;
    }
    let due: Vec<i32> = state
        .lobbies
        .values()
        .filter(|l| {
            matches!(l.status, LobbyStatus::Planned | LobbyStatus::Confirmed)
                && l.start <= now
                // Long past (e.g. added after the fact): leave it be.
                && now < l.start + membership::GRACE * 2
        })
        .map(|l| l.id)
        .collect();
    for id in due {
        if let Some(l) = state.lobbies.get_mut(&id) {
            l.status = LobbyStatus::Waiting;
            l.grace_locked = false;
            l.grace_until = Some(l.start + membership::GRACE);
            l.version += 1;
        }
    }

    let expired: Vec<(i32, LobbyStatus)> = state
        .lobbies
        .values()
        .filter(|l| {
            matches!(l.status, LobbyStatus::Waiting | LobbyStatus::Grace)
                && l.grace_until.is_some_and(|g| g <= now)
        })
        .map(|l| (l.id, l.status))
        .collect();
    for (id, status) in expired {
        let anyone_in = state.members_of(id).next().is_some();
        let played = state.members.values().any(|m| m.lobby_id == id);
        if status == LobbyStatus::Grace && anyone_in {
            end_grace(state, id, now, out);
        } else if played {
            // Played briefly, then everyone left during the grace.
            membership::finish_lobby(state, id, now, "ended", out);
        } else {
            // Nobody joined: back to the planning pool (§5.4.2).
            super::votes::boot(state, id);
        }
    }
}

/// The grace is over: the lobby is live, anyone still elsewhere drops out
/// (the auto-split), and random-team players get a team.
fn end_grace(state: &mut LiveState, lobby_id: i32, now: DateTime<Utc>, out: &mut Outcome) {
    let inside: Vec<String> = state
        .members_of(lobby_id)
        .map(|m| m.email.clone())
        .collect();
    let mut dropped = Vec::new();
    for p in state.prejoins.values_mut() {
        if p.lobby_id == lobby_id && p.is_active() && !inside.contains(&p.email) {
            p.dropped_at = Some(now);
            p.drop_reason = Some("elsewhere".to_string());
            dropped.push(p.email.clone());
        }
    }
    assign_random_teams(state, lobby_id);
    if let Some(l) = state.lobbies.get_mut(&lobby_id) {
        l.status = LobbyStatus::Live;
        l.grace_until = None;
        l.grace_locked = false;
        l.version += 1;
    }
    if !dropped.is_empty() {
        out.feed.push(
            FeedEntry::new(2, "lobby.split", "party split")
                .lobby(lobby_id)
                .people(dropped)
                .data(json!({ "kicker": "Party split", "inside": inside.len() })),
        );
    }
}

/// Random-team players go to the team with the most open slots (§5.4.4).
fn assign_random_teams(state: &mut LiveState, lobby_id: i32) {
    let Some(teams) = state.lobbies.get(&lobby_id).and_then(|l| l.teams.clone()) else {
        return;
    };
    let random: Vec<String> = state
        .prejoins
        .values()
        .filter(|p| p.lobby_id == lobby_id && p.is_active() && p.random_team && p.team.is_none())
        .map(|p| p.email.clone())
        .collect();
    for email in random {
        let open = |name: &str, size: i32, state: &LiveState| {
            let filled = state
                .members_of(lobby_id)
                .filter(|m| m.team.as_deref() == Some(name))
                .count();
            i64::from(size) - i64::try_from(filled).unwrap_or(0)
        };
        let Some(team) = teams
            .iter()
            .max_by_key(|t| open(&t.name, t.size, state))
            .map(|t| t.name.clone())
        else {
            continue;
        };
        if let Some(p) = state.prejoins.get_mut(&(lobby_id, email.clone())) {
            p.team = Some(team.clone());
        }
        if let Some(m) = state
            .members
            .values_mut()
            .find(|m| m.lobby_id == lobby_id && m.email == email && m.is_open())
        {
            m.team = Some(team);
        }
    }
}
