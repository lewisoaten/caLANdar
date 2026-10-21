//! Proposals: "everything is a vote", made precise (DESIGN.md §5.2).
//!
//! An *additive* proposal runs alongside whatever else is on and needs one
//! backer (a pre-join) within five minutes, or it disappears silently, feed
//! line and all. A proposal can instead challenge a planned lobby, which
//! opens (or adds to) "What's on at <time>?".

use chrono::{DateTime, Duration, Utc};
use rocket::serde::json::json;

use super::{
    lobby_mut, membership, schedule,
    votes::{self, OptionSpec},
    Actor, FeedEntry, LobbyRef, Outcome, PlayersAndTeams, Reject,
};
use crate::live::model::{GameDefaults, LiveState, LobbyKind, LobbySource, LobbyStatus, Prejoin};

/// A proposal needs a backer within this long.
pub const BACKER_DEADLINE: Duration = Duration::minutes(5);

#[derive(Debug, Clone, PartialEq)]
pub enum ProposalMode {
    /// Run alongside: a new lobby that needs one backer.
    Alongside,
    /// Add as an option to "What's on at <start of this lobby>?".
    Challenge(LobbyRef),
    /// Add as an option to this (open slot) vote.
    AddTo(i64),
}

#[derive(Debug, Clone, PartialEq)]
pub struct Proposal {
    pub what: OptionSpec,
    pub start: DateTime<Utc>,
    pub minutes: i32,
    pub players: PlayersAndTeams,
    pub mode: ProposalMode,
}

/// What a proposal made: a lobby, or a vote option.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Proposed {
    pub lobby: Option<i32>,
    pub vote: Option<i64>,
}

pub fn propose(
    state: &mut LiveState,
    actor: &Actor,
    proposal: Proposal,
    now: DateTime<Utc>,
    out: &mut Outcome,
) -> Result<Proposed, Reject> {
    let attending = state
        .people
        .get(&actor.email)
        .is_some_and(crate::live::model::Person::attending);
    if !attending && !actor.admin {
        return Err(Reject::Forbidden(
            "RSVP yes or maybe to propose".to_string(),
        ));
    }
    // Saved for everyone: re-proposing pre-fills these (§5.6).
    if let OptionSpec::Game { game_id, .. } = &proposal.what {
        if proposal.players.max_players.is_some() || proposal.players.teams.is_some() {
            let previous = state.defaults.get(game_id).cloned().unwrap_or_default();
            state.defaults.insert(
                *game_id,
                GameDefaults {
                    max_players: proposal.players.max_players,
                    teams: proposal.players.teams.clone(),
                    duration_minutes: previous.duration_minutes,
                    set_by: Some(actor.email.clone()),
                },
            );
        }
    }
    let players = (proposal.players.max_players, proposal.players.teams.clone());
    match proposal.mode {
        ProposalMode::Challenge(target) => {
            let (vote, _) = votes::challenge(
                state,
                actor,
                target,
                proposal.what,
                proposal.minutes,
                players,
                now,
                out,
            )?;
            Ok(Proposed {
                lobby: None,
                vote: Some(vote),
            })
        }
        ProposalMode::AddTo(vote) => {
            votes::add_option(
                state,
                actor,
                vote,
                proposal.what,
                proposal.minutes,
                players,
                now,
                out,
            )?;
            Ok(Proposed {
                lobby: None,
                vote: Some(vote),
            })
        }
        ProposalMode::Alongside => alongside(state, actor, proposal, now, out),
    }
}

fn alongside(
    state: &mut LiveState,
    actor: &Actor,
    proposal: Proposal,
    now: DateTime<Utc>,
    out: &mut Outcome,
) -> Result<Proposed, Reject> {
    if !(15..=12 * 60).contains(&proposal.minutes) {
        return Err(Reject::BadInput(
            "Between 15 minutes and 12 hours".to_string(),
        ));
    }
    let start = proposal.start.max(now);
    if start < state.event.time_begin - Duration::hours(1) || start >= state.event.time_end {
        return Err(Reject::BadInput("That's outside the event".to_string()));
    }
    let (game_id, name, food) = match &proposal.what {
        OptionSpec::Game { game_id, name } => (*game_id, name.clone(), None),
        OptionSpec::Food(food) => {
            if food.name.trim().is_empty() {
                return Err(Reject::BadInput("Say what food".to_string()));
            }
            (0, food.name.trim().to_string(), Some(food.clone()))
        }
    };
    let id = schedule::new_lobby(
        state,
        game_id,
        name,
        LobbySource::Proposal,
        LobbyStatus::Proposed,
        start,
        proposal.minutes,
        now,
    );
    if let Some(lobby) = state.lobbies.get_mut(&id) {
        lobby.proposed_by = Some(actor.email.clone());
        lobby.grace_until = Some(now + BACKER_DEADLINE);
        if let Some(food) = food {
            lobby.kind = LobbyKind::Food;
            lobby.game_id = None;
            lobby.food = Some(food);
        }
        if proposal.players.max_players.is_some() || proposal.players.teams.is_some() {
            lobby.max_players = proposal.players.max_players;
            lobby.teams.clone_from(&proposal.players.teams);
        }
    }
    // The proposer is in, but doesn't count as their own backer.
    state.prejoins.insert(
        (id, actor.email.clone()),
        Prejoin {
            lobby_id: id,
            email: actor.email.clone(),
            team: None,
            random_team: false,
            created_at: now,
            dropped_at: None,
            drop_reason: None,
        },
    );
    let mut entry = FeedEntry::new(3, "lobby.proposed", "proposed")
        .actor(&actor.email)
        .lobby(id)
        .data(json!({ "start": start }));
    entry.key_kind = Some("proposal");
    out.feed.push(entry);
    Ok(Proposed {
        lobby: Some(id),
        vote: None,
    })
}

/// Unbacked proposals past their deadline disappear, feed line and all.
pub fn expire(state: &mut LiveState, now: DateTime<Utc>, out: &mut Outcome) {
    let lapsed: Vec<i32> = state
        .lobbies
        .values()
        .filter(|l| l.status == LobbyStatus::Proposed && l.grace_until.is_some_and(|g| g <= now))
        .map(|l| l.id)
        .collect();
    for id in lapsed {
        votes::boot(state, id);
        out.feed_deletes.push(("proposal", id));
    }
}

/// Remove your own proposal (before it is played).
pub fn remove_own(
    state: &mut LiveState,
    actor: &Actor,
    lobby_id: i32,
    out: &mut Outcome,
) -> Result<(), Reject> {
    let lobby = lobby_mut(state, lobby_id)?;
    if lobby.proposed_by.as_deref() != Some(actor.email.as_str()) && !actor.admin {
        return Err(Reject::Forbidden(
            "Only the proposer can remove it".to_string(),
        ));
    }
    if !matches!(lobby.status, LobbyStatus::Proposed | LobbyStatus::Confirmed) {
        return Err(Reject::Conflict("It has already started".to_string()));
    }
    votes::boot(state, lobby_id);
    out.feed_deletes.push(("proposal", lobby_id));
    Ok(())
}

/// "Close now" on an empty lobby: it ends when the last person left.
pub fn close_now(
    state: &mut LiveState,
    actor: &Actor,
    lobby_id: i32,
    now: DateTime<Utc>,
    out: &mut Outcome,
) -> Result<(), Reject> {
    let lobby = lobby_mut(state, lobby_id)?.clone();
    if lobby.status != LobbyStatus::Empty {
        return Err(Reject::Conflict(
            "Only an empty lobby can be closed".to_string(),
        ));
    }
    let was_in = state
        .members
        .values()
        .any(|m| m.lobby_id == lobby_id && m.email == actor.email);
    if lobby.proposed_by.as_deref() != Some(actor.email.as_str()) && !was_in && !actor.admin {
        return Err(Reject::Forbidden(
            "Only people who played it can close it".to_string(),
        ));
    }
    membership::finish_lobby(state, lobby_id, now, "ended", out);
    Ok(())
}

/// How much "more time" adds.
pub const MORE_TIME: Duration = Duration::minutes(5);
/// "More time" never puts a deadline further out than this.
pub const MORE_TIME_MAX: Duration = Duration::minutes(30);

/// "+5 min": more time for a proposal to find a backer, or for an empty
/// lobby before it closes. For the proposer and the people who played it
/// (and admins), so nobody has to re-propose the same thing.
pub fn more_time(
    state: &mut LiveState,
    actor: &Actor,
    lobby_id: i32,
    now: DateTime<Utc>,
) -> Result<(), Reject> {
    let lobby = lobby_mut(state, lobby_id)?.clone();
    let mine = lobby.proposed_by.as_deref() == Some(actor.email.as_str());
    let current = match lobby.status {
        LobbyStatus::Proposed => {
            if !mine && !actor.admin {
                return Err(Reject::Forbidden(
                    "Only the proposer can give it more time".to_string(),
                ));
            }
            lobby.grace_until.unwrap_or(now)
        }
        LobbyStatus::Empty => {
            let was_in = state
                .members
                .values()
                .any(|m| m.lobby_id == lobby_id && m.email == actor.email);
            if !mine && !was_in && !actor.admin {
                return Err(Reject::Forbidden(
                    "Only people who played it can keep it open".to_string(),
                ));
            }
            empty_closes_at(&lobby).unwrap_or(now)
        }
        _ => {
            return Err(Reject::Conflict(
                "Only a proposal or an empty lobby can have more time".to_string(),
            ))
        }
    };
    let until = (current.max(now) + MORE_TIME).min(now + MORE_TIME_MAX);
    let lobby = lobby_mut(state, lobby_id)?;
    lobby.grace_until = Some(until);
    lobby.version += 1;
    Ok(())
}

/// When an empty lobby closes: five minutes after the last person left, or
/// later if someone asked for more time (kept in `grace_until`).
pub fn empty_closes_at(lobby: &crate::live::model::Lobby) -> Option<DateTime<Utc>> {
    let base = lobby.empty_since? + membership::EMPTY_CLOSE;
    Some(lobby.grace_until.map_or(base, |g| g.max(base)))
}
