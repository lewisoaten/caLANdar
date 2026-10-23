//! Competitive votes (DESIGN.md §5.3): what's on at a slot, keep playing,
//! delay, change a lobby, kick off early.
//!
//! - **Involved** people are recomputed from live state for each type
//!   (§5.3.3), so someone who checks in, joins or pre-joins can vote, and
//!   someone who leaves stops counting.
//! - **Unanimous** among the involved finalises after a 20s settle window
//!   (§5.3.4); if every involved voter also ticked "happy to split" and the
//!   votes are spread, the party splits instead.
//! - At the **deadline** the plurality wins (ties go to the plan), unless
//!   every voter ticked split (§5.3.2).
//! - Admins can force an option, split, or veto at any time.

use std::collections::BTreeMap;

use chrono::{DateTime, Duration, Utc};
use rocket::serde::json::json;

use super::{lobby_mut, membership, schedule, Actor, FeedEntry, LobbyRef, Outcome, Reject};
use crate::live::model::{
    Ballot, Email, Food, LiveState, LobbyKind, LobbySource, LobbyStatus, OptionKind, Team, Vote,
    VoteOption, VoteStatus, VoteType,
};

/// A unanimous vote finalises this long after the last change.
pub const SETTLE: Duration = Duration::seconds(20);
/// A delay vote has this long (the grace is held meanwhile).
pub const DELAY_DEADLINE: Duration = Duration::minutes(3);
/// Slot and change votes close this long before the lobby starts...
pub const BEFORE_START: Duration = Duration::minutes(15);
/// ...but always stay open at least this long.
pub const MIN_OPEN: Duration = Duration::minutes(5);

/// What a new option is.
#[derive(Debug, Clone, PartialEq)]
pub enum OptionSpec {
    Game { game_id: i64, name: String },
    Food(Food),
}

/// A new vote.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VoteRequest {
    /// Keep playing a running lobby for longer.
    Extend { lobby: i32, minutes: i32 },
    /// Start a lobby later (from the "Nobody's in yet" alert).
    Delay { lobby: i32, minutes: i32 },
    /// Move or resize an upcoming lobby.
    Change {
        lobby: i32,
        start_delta: i32,
        minutes_delta: i32,
    },
    /// Before the event: start the first lobby earlier.
    Kickoff {
        lobby: i32,
        new_start: DateTime<Utc>,
    },
}

/// How an admin settles a vote.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Resolve {
    Force(i64),
    Split,
    Veto,
}

fn vote_mut(state: &mut LiveState, id: i64) -> Result<&mut Vote, Reject> {
    state
        .votes
        .get_mut(&id)
        .ok_or_else(|| Reject::NotFound("That vote no longer exists".to_string()))
}

fn open_vote_mut(state: &mut LiveState, id: i64) -> Result<&mut Vote, Reject> {
    let vote = vote_mut(state, id)?;
    if vote.status != VoteStatus::Open {
        return Err(Reject::Conflict("That vote is already final".to_string()));
    }
    Ok(vote)
}

/// Who votes on this (DESIGN.md §5.3.3), recomputed from live state.
pub fn involved(state: &LiveState, vote: &Vote) -> Vec<Email> {
    let mut people: Vec<Email> = Vec::new();
    let mut add = |email: &str| {
        if !people.iter().any(|p| p == email) {
            people.push(email.to_string());
        }
    };
    let target = vote.target_lobby_id;
    match vote.kind {
        VoteType::Slot => {
            let at = vote.slot_start.unwrap_or(vote.opened_at);
            let anyone_checked_in = state.anyone_checked_in();
            for person in state.people.values() {
                let counts = if anyone_checked_in {
                    state.is_checked_in(&person.email) && person.attending()
                } else {
                    person.attending_at(&state.event, at)
                };
                if counts {
                    add(&person.email);
                }
            }
        }
        VoteType::Extend => {
            if let Some(lobby) = target {
                for m in state.members_of(lobby) {
                    add(&m.email);
                }
            }
        }
        VoteType::Change | VoteType::Delay => {
            // Whoever called it cares, even if they hadn't pre-joined.
            add(&vote.opened_by);
            if let Some(lobby_id) = target {
                for m in state.members_of(lobby_id) {
                    add(&m.email);
                }
                for p in state.prejoins_of(lobby_id) {
                    add(&p.email);
                }
                if let Some(lobby) = state.lobbies.get(&lobby_id) {
                    if let Some(proposer) = &lobby.proposed_by {
                        add(proposer);
                    }
                    // Everyone who voted for it (F9.1b).
                    if let Some(origin) = lobby.created_by_vote.and_then(|v| state.votes.get(&v)) {
                        for b in state.ballots.values() {
                            if b.vote_id == origin.id && b.option_id == origin.winner_option_id {
                                add(&b.email);
                            }
                        }
                    }
                }
            }
        }
        VoteType::Kickoff => {
            for person in state.people.values() {
                if person.attending_at(&state.event, state.event.time_begin) {
                    add(&person.email);
                }
            }
        }
    }
    people.sort();
    people
}

/// Ballots of the involved that picked an option, by email.
fn counted_ballots<'a>(state: &'a LiveState, vote: &Vote, involved: &[Email]) -> Vec<&'a Ballot> {
    state
        .ballots
        .values()
        .filter(|b| b.vote_id == vote.id && b.option_id.is_some() && involved.contains(&b.email))
        .collect()
}

fn options_of(state: &LiveState, vote_id: i64) -> Vec<&VoteOption> {
    let mut options: Vec<&VoteOption> = state
        .options
        .values()
        .filter(|o| o.vote_id == vote_id)
        .collect();
    options.sort_by_key(|o| (o.created_at, o.id.unsigned_abs()));
    options
}

fn new_option(
    state: &mut LiveState,
    vote_id: i64,
    kind: OptionKind,
    name: String,
    created_by: Option<&str>,
    now: DateTime<Utc>,
) -> i64 {
    let id = state.temp_id();
    state.options.insert(
        id,
        VoteOption {
            id,
            vote_id,
            kind,
            lobby_id: None,
            game_id: None,
            name,
            food: None,
            start_delta_min: None,
            duration_min: None,
            new_start: None,
            max_players: None,
            teams: None,
            created_by: created_by.map(ToString::to_string),
            created_at: now,
        },
    );
    id
}

fn new_vote(
    state: &mut LiveState,
    kind: VoteType,
    target: Option<i32>,
    slot_start: Option<DateTime<Utc>>,
    opened_by: &str,
    deadline: DateTime<Utc>,
    now: DateTime<Utc>,
) -> i64 {
    let id = state.temp_id();
    state.votes.insert(
        id,
        Vote {
            id,
            kind,
            target_lobby_id: target,
            slot_start,
            status: VoteStatus::Open,
            resolution: None,
            opened_by: opened_by.to_string(),
            opened_at: now,
            deadline,
            settle_at: None,
            resolved_by: None,
            resolved_at: None,
            winner_option_id: None,
        },
    );
    id
}

fn open_vote_on(state: &LiveState, lobby: i32, kinds: &[VoteType]) -> Option<i64> {
    state
        .votes
        .values()
        .find(|v| {
            v.status == VoteStatus::Open
                && v.target_lobby_id == Some(lobby)
                && kinds.contains(&v.kind)
        })
        .map(|v| v.id)
}

fn cast(state: &mut LiveState, vote_id: i64, email: &str, option: i64, now: DateTime<Utc>) {
    let key = (vote_id, email.to_string());
    let split_ok = state.ballots.get(&key).is_some_and(|b| b.split_ok);
    state.ballots.insert(
        key,
        Ballot {
            vote_id,
            email: email.to_string(),
            option_id: Some(option),
            split_ok,
            updated_at: now,
        },
    );
}

fn called_vote(out: &mut Outcome, actor: &str, vote_id: i64, lobby: Option<i32>) {
    let mut entry = FeedEntry::new(3, "vote.called", "called a vote").actor(actor);
    entry.vote_id = Some(vote_id);
    entry.lobby_id = lobby;
    out.feed.push(entry);
}

/// Open a yes/no vote about a lobby.
pub fn open(
    state: &mut LiveState,
    actor: &Actor,
    request: VoteRequest,
    now: DateTime<Utc>,
    out: &mut Outcome,
) -> Result<i64, Reject> {
    let (kind, lobby_id) = match request {
        VoteRequest::Extend { lobby, .. } => (VoteType::Extend, lobby),
        VoteRequest::Delay { lobby, .. } => (VoteType::Delay, lobby),
        VoteRequest::Change { lobby, .. } => (VoteType::Change, lobby),
        VoteRequest::Kickoff { lobby, .. } => (VoteType::Kickoff, lobby),
    };
    let lobby = lobby_mut(state, lobby_id)?.clone();
    if open_vote_on(state, lobby_id, &[kind]).is_some() {
        return Err(Reject::Conflict(
            "There's already an open vote on that lobby".to_string(),
        ));
    }

    let (deadline, yes_label) = match request {
        VoteRequest::Extend { minutes, .. } => {
            if !lobby.status.is_running() {
                return Err(Reject::Conflict("That lobby isn't running".to_string()));
            }
            if !state.members_of(lobby_id).any(|m| m.email == actor.email) {
                return Err(Reject::Forbidden(
                    "Only people in the lobby can vote to keep playing".to_string(),
                ));
            }
            validate_minutes(minutes)?;
            // Would run into an open slot vote: become an option of it (§5.3.5).
            let new_end = lobby.end() + Duration::minutes(i64::from(minutes));
            if let Some(slot) = state
                .votes
                .values()
                .find(|v| {
                    v.status == VoteStatus::Open
                        && v.kind == VoteType::Slot
                        && v.slot_start.is_some_and(|s| s > now && s < new_end)
                })
                .map(|v| v.id)
            {
                let existing = options_of(state, slot)
                    .into_iter()
                    .find(|o| o.kind == OptionKind::KeepPlaying && o.lobby_id == Some(lobby_id))
                    .map(|o| o.id);
                let option = existing.unwrap_or_else(|| {
                    let id = new_option(
                        state,
                        slot,
                        OptionKind::KeepPlaying,
                        format!("Keep playing {}", lobby.name),
                        Some(&actor.email),
                        now,
                    );
                    if let Some(o) = state.options.get_mut(&id) {
                        o.lobby_id = Some(lobby_id);
                        o.game_id = lobby.game_id;
                        o.duration_min = Some(minutes);
                    }
                    id
                });
                cast(state, slot, &actor.email, option, now);
                return Ok(slot);
            }
            (
                now + MIN_OPEN,
                format!("Keep playing +{}", minutes_label(minutes)),
            )
        }
        VoteRequest::Delay { minutes, .. } => {
            validate_minutes(minutes)?;
            if !matches!(
                lobby.status,
                LobbyStatus::Waiting | LobbyStatus::Planned | LobbyStatus::Confirmed
            ) {
                return Err(Reject::Conflict(
                    "Only a lobby nobody has joined can be delayed".to_string(),
                ));
            }
            (
                now + DELAY_DEADLINE,
                format!("Delay +{}", minutes_label(minutes)),
            )
        }
        VoteRequest::Change {
            start_delta,
            minutes_delta,
            ..
        } => {
            if !matches!(
                lobby.status,
                LobbyStatus::Planned | LobbyStatus::Confirmed | LobbyStatus::Proposed
            ) {
                return Err(Reject::Conflict(
                    "Only upcoming lobbies can be changed".to_string(),
                ));
            }
            if start_delta == 0 && minutes_delta == 0 {
                return Err(Reject::BadInput(
                    "Change the start or the length".to_string(),
                ));
            }
            if lobby.minutes + minutes_delta < 15 {
                return Err(Reject::BadInput(
                    "A lobby lasts at least 15 minutes".to_string(),
                ));
            }
            let deadline = (lobby.start - BEFORE_START).max(now + MIN_OPEN);
            (deadline, "Change it".to_string())
        }
        VoteRequest::Kickoff { new_start, .. } => {
            if now >= state.event.time_begin {
                return Err(Reject::Conflict(
                    "The event has already started".to_string(),
                ));
            }
            if new_start < state.event.time_begin || new_start >= lobby.start {
                return Err(Reject::BadInput(
                    "Kick-off must be between doors and the planned start".to_string(),
                ));
            }
            (
                (new_start - BEFORE_START).max(now + MIN_OPEN),
                "Kick off early".to_string(),
            )
        }
    };

    let vote_id = new_vote(
        state,
        kind,
        Some(lobby_id),
        Some(lobby.start),
        &actor.email,
        deadline,
        now,
    );
    let yes = new_option(
        state,
        vote_id,
        OptionKind::Yes,
        yes_label,
        Some(&actor.email),
        now,
    );
    if let Some(o) = state.options.get_mut(&yes) {
        o.lobby_id = Some(lobby_id);
        o.game_id = lobby.game_id;
        match request {
            VoteRequest::Extend { minutes, .. } | VoteRequest::Delay { minutes, .. } => {
                o.duration_min = Some(minutes);
            }
            VoteRequest::Change {
                start_delta,
                minutes_delta,
                ..
            } => {
                o.start_delta_min = Some(start_delta);
                o.duration_min = Some(minutes_delta);
            }
            VoteRequest::Kickoff { new_start, .. } => o.new_start = Some(new_start),
        }
    }
    new_option(
        state,
        vote_id,
        OptionKind::No,
        "Keep it as it is".to_string(),
        None,
        now,
    );
    cast(state, vote_id, &actor.email, yes, now);

    // Opening a delay vote holds the grace (§5.4.1).
    if kind == VoteType::Delay {
        if let Some(l) = state.lobbies.get_mut(&lobby_id) {
            if l.status == LobbyStatus::Waiting {
                l.hold_remaining_s = l
                    .grace_until
                    .map(|g| i32::try_from((g - now).num_seconds().max(0)).unwrap_or(0));
                l.grace_until = None;
                l.status = LobbyStatus::Delayed;
                l.version += 1;
            }
        }
    }
    called_vote(out, &actor.email, vote_id, Some(lobby_id));
    Ok(vote_id)
}

fn validate_minutes(minutes: i32) -> Result<(), Reject> {
    if (5..=12 * 60).contains(&minutes) {
        Ok(())
    } else {
        Err(Reject::BadInput(
            "Between 5 minutes and 12 hours".to_string(),
        ))
    }
}

fn minutes_label(minutes: i32) -> String {
    match (minutes / 60, minutes % 60) {
        (0, m) => format!("{m}m"),
        (h, 0) => format!("{h}h"),
        (h, m) => format!("{h}h {m:02}"),
    }
}

/// Challenge a planned lobby with an alternative: open "What's on at
/// <start>?" (or add to it), with the plan as option one and "keep playing"
/// for each running lobby that ends before the slot (§5.3.1). Returns the
/// vote and the new option.
pub fn challenge(
    state: &mut LiveState,
    actor: &Actor,
    target: LobbyRef,
    spec: OptionSpec,
    minutes: i32,
    players: (Option<i32>, Option<Vec<Team>>),
    now: DateTime<Utc>,
    out: &mut Outcome,
) -> Result<(i64, i64), Reject> {
    validate_minutes(minutes)?;
    let lobby_id = match target {
        LobbyRef::Stored(id) => id,
        LobbyRef::Suggested(s) => membership::materialise(state, &s, now),
    };
    let lobby = lobby_mut(state, lobby_id)?.clone();
    if !matches!(lobby.status, LobbyStatus::Planned | LobbyStatus::Confirmed) {
        return Err(Reject::Conflict(
            "Only a planned lobby can be challenged".to_string(),
        ));
    }
    let vote_id = if let Some(existing) = open_vote_on(state, lobby_id, &[VoteType::Slot]) {
        existing
    } else {
        let deadline = (lobby.start - BEFORE_START).max(now + MIN_OPEN);
        let vote_id = new_vote(
            state,
            VoteType::Slot,
            Some(lobby_id),
            Some(lobby.start),
            &actor.email,
            deadline,
            now,
        );
        let planned = new_option(
            state,
            vote_id,
            OptionKind::Lobby,
            lobby.name.clone(),
            None,
            now,
        );
        if let Some(o) = state.options.get_mut(&planned) {
            o.lobby_id = Some(lobby_id);
            o.game_id = lobby.game_id;
            o.food.clone_from(&lobby.food);
            o.duration_min = Some(lobby.minutes);
        }
        // Keep playing what's on now instead.
        let running: Vec<(i32, String, Option<i64>)> = state
            .lobbies
            .values()
            .filter(|l| {
                l.id != lobby_id
                    && l.kind == LobbyKind::Game
                    && matches!(l.status, LobbyStatus::Live | LobbyStatus::Grace)
                    && l.end() <= lobby.end()
            })
            .map(|l| (l.id, l.name.clone(), l.game_id))
            .collect();
        for (id, name, game_id) in running {
            let o = new_option(
                state,
                vote_id,
                OptionKind::KeepPlaying,
                format!("Keep playing {name}"),
                None,
                now,
            );
            if let Some(o) = state.options.get_mut(&o) {
                o.lobby_id = Some(id);
                o.game_id = game_id;
            }
        }
        called_vote(out, &actor.email, vote_id, Some(lobby_id));
        vote_id
    };
    let option = add_option_inner(state, actor, vote_id, spec, minutes, players, now, out)?;
    Ok((vote_id, option))
}

/// Add an option to an open slot vote: the start comes from the vote; only
/// the length is chosen.
pub fn add_option(
    state: &mut LiveState,
    actor: &Actor,
    vote_id: i64,
    spec: OptionSpec,
    minutes: i32,
    players: (Option<i32>, Option<Vec<Team>>),
    now: DateTime<Utc>,
    out: &mut Outcome,
) -> Result<i64, Reject> {
    validate_minutes(minutes)?;
    let vote = open_vote_mut(state, vote_id)?;
    if vote.kind != VoteType::Slot {
        return Err(Reject::Conflict(
            "Options can only be added to slot votes".to_string(),
        ));
    }
    add_option_inner(state, actor, vote_id, spec, minutes, players, now, out)
}

fn add_option_inner(
    state: &mut LiveState,
    actor: &Actor,
    vote_id: i64,
    spec: OptionSpec,
    minutes: i32,
    players: (Option<i32>, Option<Vec<Team>>),
    now: DateTime<Utc>,
    out: &mut Outcome,
) -> Result<i64, Reject> {
    let (kind, name, game_id, food) = match spec {
        OptionSpec::Game { game_id, name } => (OptionKind::Game, name, Some(game_id), None),
        OptionSpec::Food(food) => (OptionKind::Food, food.name.clone(), None, Some(food)),
    };
    if let Some(game) = game_id {
        if options_of(state, vote_id)
            .iter()
            .any(|o| o.game_id == Some(game))
        {
            return Err(Reject::Conflict(
                "That game is already an option".to_string(),
            ));
        }
    }
    let option = new_option(state, vote_id, kind, name, Some(&actor.email), now);
    if let Some(o) = state.options.get_mut(&option) {
        o.game_id = game_id;
        o.food = food;
        o.duration_min = Some(minutes);
        o.max_players = players.0;
        o.teams = players.1;
    }
    cast(state, vote_id, &actor.email, option, now);
    let mut entry = FeedEntry::new(3, "vote.option", "added an option").actor(&actor.email);
    entry.vote_id = Some(vote_id);
    entry.data = json!({ "option": state.options.get(&option).map(|o| o.name.clone()) });
    out.feed.push(entry);
    Ok(option)
}

/// Vote (or change your vote) and say whether you're happy to split.
pub fn ballot(
    state: &mut LiveState,
    actor: &Actor,
    vote_id: i64,
    option: Option<i64>,
    split_ok: Option<bool>,
    now: DateTime<Utc>,
    out: &mut Outcome,
) -> Result<(), Reject> {
    let vote = open_vote_mut(state, vote_id)?.clone();
    if !involved(state, &vote).contains(&actor.email) {
        return Err(Reject::Forbidden(match vote.kind {
            VoteType::Slot => "Check in to vote on this".to_string(),
            VoteType::Extend => "Only people in the lobby vote on this".to_string(),
            _ => "This vote is for the people in that lobby".to_string(),
        }));
    }
    if let Some(option) = option {
        if state
            .options
            .get(&option)
            .is_none_or(|o| o.vote_id != vote_id)
        {
            return Err(Reject::NotFound("That option doesn't exist".to_string()));
        }
    }
    let key = (vote_id, actor.email.clone());
    let previous = state.ballots.get(&key).cloned();
    let ballot = Ballot {
        vote_id,
        email: actor.email.clone(),
        option_id: option.or_else(|| previous.as_ref().and_then(|b| b.option_id)),
        split_ok: split_ok.unwrap_or_else(|| previous.as_ref().is_some_and(|b| b.split_ok)),
        updated_at: now,
    };
    let first = previous.as_ref().and_then(|b| b.option_id).is_none() && ballot.option_id.is_some();
    state.ballots.insert(key, ballot);
    // Any change restarts the settle window.
    if let Some(v) = state.votes.get_mut(&vote_id) {
        v.settle_at = None;
    }
    if first {
        let mut entry = FeedEntry::new(3, "vote.ballot", "voted").actor(&actor.email);
        entry.vote_id = Some(vote_id);
        out.feed.push(entry);
    }
    Ok(())
}

/// Admin: force an option, split the party, or veto.
pub fn resolve(
    state: &mut LiveState,
    actor: &Actor,
    vote_id: i64,
    how: Resolve,
    now: DateTime<Utc>,
    out: &mut Outcome,
) -> Result<(), Reject> {
    super::require_admin(actor)?;
    let vote = open_vote_mut(state, vote_id)?.clone();
    match how {
        Resolve::Force(option) => {
            if state
                .options
                .get(&option)
                .is_none_or(|o| o.vote_id != vote_id)
            {
                return Err(Reject::NotFound("That option doesn't exist".to_string()));
            }
            finalize(
                state,
                vote_id,
                Some(option),
                "admin_pick",
                Some(&actor.email),
                now,
                out,
            );
        }
        Resolve::Split => {
            if vote.kind != VoteType::Slot {
                return Err(Reject::Conflict("Only slot votes can split".to_string()));
            }
            split(state, vote_id, "admin_split", Some(&actor.email), now, out);
        }
        Resolve::Veto => {
            close(
                state,
                vote_id,
                VoteStatus::Vetoed,
                "vetoed",
                Some(&actor.email),
                now,
            );
            after_no_change(state, &vote, now);
            result_feed(state, vote_id, "FINAL · VETOED", out);
        }
    }
    Ok(())
}

fn close(
    state: &mut LiveState,
    vote_id: i64,
    status: VoteStatus,
    resolution: &str,
    by: Option<&str>,
    now: DateTime<Utc>,
) {
    if let Some(v) = state.votes.get_mut(&vote_id) {
        v.status = status;
        v.resolution = Some(resolution.to_string());
        v.resolved_at = Some(now);
        v.resolved_by = by.map(ToString::to_string);
        v.settle_at = None;
    }
}

/// A delay vote that didn't pass: the grace resumes with the time it had.
fn after_no_change(state: &mut LiveState, vote: &Vote, now: DateTime<Utc>) {
    if vote.kind != VoteType::Delay {
        return;
    }
    if let Some(l) = vote
        .target_lobby_id
        .and_then(|id| state.lobbies.get_mut(&id))
    {
        if l.status == LobbyStatus::Delayed {
            l.status = LobbyStatus::Waiting;
            l.grace_until =
                Some(now + Duration::seconds(i64::from(l.hold_remaining_s.unwrap_or(0))));
            l.hold_remaining_s = None;
            l.version += 1;
        }
    }
}

/// Cancel open delay votes on a lobby someone has now joined: "someone's
/// in, so this can't be delayed".
pub fn cancel_delays(state: &mut LiveState, lobby_id: i32, now: DateTime<Utc>) {
    let ids: Vec<i64> = state
        .votes
        .values()
        .filter(|v| {
            v.status == VoteStatus::Open
                && v.kind == VoteType::Delay
                && v.target_lobby_id == Some(lobby_id)
        })
        .map(|v| v.id)
        .collect();
    for id in ids {
        close(state, id, VoteStatus::Lapsed, "joined", None, now);
    }
}

/// The T1 result card.
fn result_feed(state: &LiveState, vote_id: i64, badge: &str, out: &mut Outcome) {
    let Some(vote) = state.votes.get(&vote_id) else {
        return;
    };
    let options: Vec<_> = options_of(state, vote_id)
        .into_iter()
        .map(|o| {
            let voters: Vec<String> = state
                .ballots
                .values()
                .filter(|b| b.vote_id == vote_id && b.option_id == Some(o.id))
                .map(|b| crate::live::model::pid(&b.email))
                .collect();
            json!({ "id": o.id.to_string(), "name": o.name, "voters": voters })
        })
        .collect();
    let winner = vote.winner_option_id.and_then(|id| state.options.get(&id));
    let mut entry = FeedEntry::new(1, "vote.result", "decided").actor(&vote.opened_by);
    entry.vote_id = Some(vote_id);
    entry.lobby_id = vote.target_lobby_id;
    entry.data = json!({
        "badge": badge,
        "voteType": vote.kind.as_str(),
        "resolution": vote.resolution,
        "title": title(state, vote),
        "options": options,
        "winnerOptionId": vote.winner_option_id.map(|id| id.to_string()),
        "gameId": winner.and_then(|o| o.game_id),
    });
    out.feed.push(entry);
}

/// "What's on at 22:00?" and friends, in the event's time zone.
pub fn title(state: &LiveState, vote: &Vote) -> String {
    let tz: chrono_tz::Tz = state
        .event
        .timezone
        .parse()
        .unwrap_or(chrono_tz::Europe::London);
    let at = |t: DateTime<Utc>| t.with_timezone(&tz).format("%H:%M").to_string();
    let lobby = vote.target_lobby_id.and_then(|id| state.lobbies.get(&id));
    let name = lobby.map_or_else(|| "it".to_string(), |l| l.name.clone());
    let yes = options_of(state, vote.id)
        .into_iter()
        .find(|o| o.kind == OptionKind::Yes)
        .cloned();
    match vote.kind {
        VoteType::Slot => format!(
            "What's on at {}?",
            at(vote.slot_start.unwrap_or(vote.opened_at))
        ),
        VoteType::Extend => format!(
            "Keep playing {name} for +{}?",
            minutes_label(yes.and_then(|o| o.duration_min).unwrap_or(30))
        ),
        VoteType::Delay => format!(
            "Delay {name} by {}?",
            minutes_label(yes.and_then(|o| o.duration_min).unwrap_or(15))
        ),
        VoteType::Change => {
            let start = lobby.map_or(vote.opened_at, |l| l.start)
                + Duration::minutes(i64::from(
                    yes.as_ref().and_then(|o| o.start_delta_min).unwrap_or(0),
                ));
            let minutes =
                lobby.map_or(60, |l| l.minutes) + yes.and_then(|o| o.duration_min).unwrap_or(0);
            format!(
                "Change {name} to {} · {}?",
                at(start),
                minutes_label(minutes)
            )
        }
        VoteType::Kickoff => format!(
            "Kick off early: {name} at {}?",
            at(yes.and_then(|o| o.new_start).unwrap_or(vote.opened_at))
        ),
    }
}

/// Settle and deadline rules, run on every tick.
pub fn tick(state: &mut LiveState, now: DateTime<Utc>, out: &mut Outcome) {
    let open: Vec<Vote> = state
        .votes
        .values()
        .filter(|v| v.status == VoteStatus::Open)
        .cloned()
        .collect();
    for vote in open {
        let who = involved(state, &vote);
        let ballots = counted_ballots(state, &vote, &who);
        let all_voted = !who.is_empty() && ballots.len() == who.len();
        let mut picks: Vec<i64> = ballots.iter().filter_map(|b| b.option_id).collect();
        picks.sort_unstable();
        picks.dedup();
        let all_split = all_voted && ballots.iter().all(|b| b.split_ok);
        let unanimous = all_voted && picks.len() == 1;
        let everyone_split = vote.kind == VoteType::Slot && all_split && picks.len() >= 2;

        if vote.deadline <= now {
            resolve_at_deadline(state, &vote, &who, now, out);
            continue;
        }
        if unanimous || everyone_split {
            match vote.settle_at {
                None => {
                    if let Some(v) = state.votes.get_mut(&vote.id) {
                        v.settle_at = Some(now + SETTLE);
                    }
                }
                Some(at) if at <= now => {
                    if everyone_split {
                        split(state, vote.id, "everyone_split", None, now, out);
                    } else {
                        finalize(
                            state,
                            vote.id,
                            picks.first().copied(),
                            "unanimous",
                            None,
                            now,
                            out,
                        );
                    }
                }
                Some(_) => {}
            }
        } else if vote.settle_at.is_some() {
            if let Some(v) = state.votes.get_mut(&vote.id) {
                v.settle_at = None;
            }
        }
    }
}

fn resolve_at_deadline(
    state: &mut LiveState,
    vote: &Vote,
    who: &[Email],
    now: DateTime<Utc>,
    out: &mut Outcome,
) {
    let ballots: Vec<Ballot> = counted_ballots(state, vote, who)
        .into_iter()
        .cloned()
        .collect();
    if ballots.is_empty() {
        close(state, vote.id, VoteStatus::Lapsed, "deadline", None, now);
        after_no_change(state, vote, now);
        return;
    }
    let mut tally: BTreeMap<i64, usize> = BTreeMap::new();
    for b in &ballots {
        if let Some(o) = b.option_id {
            *tally.entry(o).or_default() += 1;
        }
    }
    if vote.kind == VoteType::Slot && tally.len() >= 2 && ballots.iter().all(|b| b.split_ok) {
        split(state, vote.id, "everyone_split", None, now, out);
        return;
    }
    let best = tally.values().copied().max().unwrap_or(0);
    let tied: Vec<i64> = tally
        .iter()
        .filter(|(_, n)| **n == best)
        .map(|(o, _)| *o)
        .collect();
    // Ties go to the plan (the lobby option, or "no change"), then the
    // earliest option.
    let options = options_of(state, vote.id);
    let winner = options
        .iter()
        .find(|o| tied.contains(&o.id) && matches!(o.kind, OptionKind::Lobby | OptionKind::No))
        .or_else(|| options.iter().find(|o| tied.contains(&o.id)))
        .map(|o| o.id);
    finalize(state, vote.id, winner, "deadline", None, now, out);
}

/// Make a vote final with `winner` and apply what it decided.
fn finalize(
    state: &mut LiveState,
    vote_id: i64,
    winner: Option<i64>,
    resolution: &str,
    by: Option<&str>,
    now: DateTime<Utc>,
    out: &mut Outcome,
) {
    let Some(vote) = state.votes.get(&vote_id).cloned() else {
        return;
    };
    close(state, vote_id, VoteStatus::Final, resolution, by, now);
    if let Some(v) = state.votes.get_mut(&vote_id) {
        v.winner_option_id = winner;
    }
    let option = winner.and_then(|id| state.options.get(&id)).cloned();
    match (vote.kind, option.as_ref().map(|o| o.kind)) {
        (VoteType::Slot, Some(_)) => {
            if let Some(o) = &option {
                let lobby = realise_option(state, &vote, o, now);
                prejoin_voters(state, vote_id, o.id, lobby, now);
                if Some(lobby) != vote.target_lobby_id {
                    drop_challenged(state, &vote, now);
                }
            }
        }
        (_, Some(OptionKind::Yes)) => {
            if let Some(o) = &option {
                apply_yes(state, &vote, o);
            }
        }
        _ => after_no_change(state, &vote, now),
    }
    let badge = match resolution {
        "unanimous" => "FINAL · UNANIMOUS",
        "admin_pick" => "FINAL · ADMIN PICK",
        _ => "FINAL · CLOSED",
    };
    result_feed(state, vote_id, badge, out);
}

/// Split the party: one lobby per option with votes, at the slot's time,
/// each voter pre-joined to theirs.
fn split(
    state: &mut LiveState,
    vote_id: i64,
    resolution: &str,
    by: Option<&str>,
    now: DateTime<Utc>,
    out: &mut Outcome,
) {
    let Some(vote) = state.votes.get(&vote_id).cloned() else {
        return;
    };
    close(state, vote_id, VoteStatus::Final, resolution, by, now);
    let voted: Vec<VoteOption> = options_of(state, vote_id)
        .into_iter()
        .filter(|o| {
            state
                .ballots
                .values()
                .any(|b| b.vote_id == vote_id && b.option_id == Some(o.id))
        })
        .cloned()
        .collect();
    let mut kept_target = false;
    for o in &voted {
        let lobby = realise_option(state, &vote, o, now);
        if Some(lobby) == vote.target_lobby_id {
            kept_target = true;
        }
        if let Some(l) = state.lobbies.get_mut(&lobby) {
            if l.source == LobbySource::Vote {
                l.source = LobbySource::Split;
            }
        }
        prejoin_voters(state, vote_id, o.id, lobby, now);
    }
    if !kept_target {
        drop_challenged(state, &vote, now);
    }
    result_feed(
        state,
        vote_id,
        if resolution == "admin_split" {
            "FINAL · ADMIN SPLIT"
        } else {
            "FINAL · EVERYONE SPLIT"
        },
        out,
    );
}

/// The lobby an option stands for, created if it is new.
fn realise_option(state: &mut LiveState, vote: &Vote, o: &VoteOption, now: DateTime<Utc>) -> i32 {
    match o.kind {
        OptionKind::Lobby => o.lobby_id.unwrap_or_default(),
        OptionKind::KeepPlaying => {
            let lobby_id = o.lobby_id.unwrap_or_default();
            let slot_end = vote
                .target_lobby_id
                .and_then(|id| state.lobbies.get(&id))
                .map(super::super::model::Lobby::end);
            if let Some(l) = state.lobbies.get_mut(&lobby_id) {
                l.freeze_plan();
                let wanted = slot_end.unwrap_or_else(|| {
                    l.end() + Duration::minutes(i64::from(o.duration_min.unwrap_or(60)))
                });
                let minutes = i32::try_from((wanted - l.start).num_minutes()).unwrap_or(l.minutes);
                l.minutes = l.minutes.max(minutes);
                l.version += 1;
            }
            lobby_id
        }
        OptionKind::Game | OptionKind::Food => {
            let start = vote.slot_start.unwrap_or(now);
            let minutes = o.duration_min.unwrap_or(120);
            let id = schedule::new_lobby(
                state,
                o.game_id.unwrap_or_default(),
                o.name.clone(),
                LobbySource::Vote,
                LobbyStatus::Confirmed,
                start,
                minutes,
                now,
            );
            if let Some(l) = state.lobbies.get_mut(&id) {
                l.created_by_vote = Some(vote.id);
                if o.kind == OptionKind::Food {
                    l.kind = LobbyKind::Food;
                    l.game_id = None;
                    l.food.clone_from(&o.food);
                }
                if o.max_players.is_some() || o.teams.is_some() {
                    l.max_players = o.max_players;
                    l.teams.clone_from(&o.teams);
                }
            }
            id
        }
        OptionKind::Yes | OptionKind::No => vote.target_lobby_id.unwrap_or_default(),
    }
}

fn prejoin_voters(
    state: &mut LiveState,
    vote_id: i64,
    option: i64,
    lobby_id: i32,
    now: DateTime<Utc>,
) {
    let voters: Vec<Email> = state
        .ballots
        .values()
        .filter(|b| b.vote_id == vote_id && b.option_id == Some(option))
        .map(|b| b.email.clone())
        .collect();
    let Some(lobby) = state.lobbies.get(&lobby_id) else {
        return;
    };
    if lobby.status.is_running() {
        // Keep playing: the voters are (mostly) already in it.
        return;
    }
    for email in voters {
        let key = (lobby_id, email.clone());
        if state
            .prejoins
            .get(&key)
            .is_some_and(crate::live::model::Prejoin::is_active)
        {
            continue;
        }
        state.prejoins.insert(
            key,
            crate::live::model::Prejoin {
                lobby_id,
                email,
                team: None,
                random_team: false,
                created_at: now,
                dropped_at: None,
                drop_reason: None,
            },
        );
    }
    let wanted = state.lobby_headcount(lobby_id) > 0;
    if let Some(l) = state.lobbies.get_mut(&lobby_id) {
        if l.status == LobbyStatus::Planned && wanted {
            l.status = LobbyStatus::Confirmed;
        }
    }
}

/// The challenged plan lost: take it off the schedule (a stored suggestion
/// goes back to the planner).
fn drop_challenged(state: &mut LiveState, vote: &Vote, now: DateTime<Utc>) {
    let Some(target) = vote.target_lobby_id else {
        return;
    };
    let Some(lobby) = state.lobbies.get(&target) else {
        return;
    };
    if !matches!(lobby.status, LobbyStatus::Planned | LobbyStatus::Confirmed) {
        return;
    }
    for p in state.prejoins.values_mut() {
        if p.lobby_id == target && p.is_active() {
            p.dropped_at = Some(now);
            p.drop_reason = Some("vote".to_string());
        }
    }
    boot(state, target);
}

/// Take a never-played lobby off the schedule: a stored suggestion or a
/// proposal disappears (back to the planner's pool), anything else is
/// marked removed.
pub fn boot(state: &mut LiveState, lobby_id: i32) {
    let Some(lobby) = state.lobbies.get(&lobby_id) else {
        return;
    };
    if matches!(
        lobby.source,
        LobbySource::Suggestion | LobbySource::Proposal
    ) {
        membership::forget_lobby(state, lobby_id);
        state.lobbies.remove(&lobby_id);
    } else if let Some(lobby) = state.lobbies.get_mut(&lobby_id) {
        lobby.status = LobbyStatus::Removed;
        lobby.grace_until = None;
        lobby.version += 1;
    }
}

fn apply_yes(state: &mut LiveState, vote: &Vote, o: &VoteOption) {
    let Some(lobby_id) = vote.target_lobby_id else {
        return;
    };
    let Some(l) = state.lobbies.get_mut(&lobby_id) else {
        return;
    };
    l.freeze_plan();
    match vote.kind {
        VoteType::Extend => l.minutes += o.duration_min.unwrap_or(0),
        VoteType::Delay => {
            l.start += Duration::minutes(i64::from(o.duration_min.unwrap_or(0)));
            l.grace_until = None;
            l.hold_remaining_s = None;
            if matches!(l.status, LobbyStatus::Delayed | LobbyStatus::Waiting) {
                l.status = LobbyStatus::Planned;
            }
        }
        VoteType::Change => {
            l.start += Duration::minutes(i64::from(o.start_delta_min.unwrap_or(0)));
            l.minutes = (l.minutes + o.duration_min.unwrap_or(0)).max(15);
        }
        VoteType::Kickoff => {
            if let Some(start) = o.new_start {
                l.start = start;
            }
        }
        VoteType::Slot => {}
    }
    l.version += 1;
    if vote.kind == VoteType::Delay && state.lobby_headcount(lobby_id) > 0 {
        if let Some(l) = state.lobbies.get_mut(&lobby_id) {
            l.status = LobbyStatus::Confirmed;
        }
    }
}
