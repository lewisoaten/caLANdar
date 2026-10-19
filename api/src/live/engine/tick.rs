//! Time-driven rules (DESIGN.md §3.6). Every timed rule is a stored deadline
//! processed here once it has passed, so ticking is idempotent and it does
//! not matter who ticks (a command, the stream instance, Cloud Scheduler or
//! a client whose countdown reached zero) or how late.

use chrono::{DateTime, Utc};
use rocket::serde::json::json;

use super::{
    membership::{self, EMPTY_CLOSE},
    FeedEntry, Outcome,
};
use crate::live::model::{LiveState, LobbyKind, LobbyStatus, Prejoin};

pub fn run(state: &mut LiveState, now: DateTime<Utc>, out: &mut Outcome) {
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

/// An empty lobby closes five minutes after the last person left; it ends
/// at the time they left (§4.4).
fn close_empty(state: &mut LiveState, now: DateTime<Utc>, out: &mut Outcome) {
    let closing: Vec<i32> = state
        .lobbies
        .values()
        .filter(|l| {
            l.status == LobbyStatus::Empty && l.empty_since.is_some_and(|t| t + EMPTY_CLOSE <= now)
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
