//! Check-in at the venue (DESIGN.md §5.5).

use chrono::{DateTime, Duration, Utc};
use rocket::serde::json::json;

use super::{membership, Actor, FeedEntry, Outcome, Reject};
use crate::live::model::{CheckIn, LiveState};

/// How long someone can step out for, in minutes.
pub const AWAY_CHOICES: [i64; 3] = [30, 60, 120];

/// Check-in opens at doors (`time_begin`) and closes at the end. It is
/// personal; admins can check someone in (the check-in queue).
pub fn check_in(
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
    if let Some(checkin) = state.checkins.get_mut(email) {
        // Back early from stepping out.
        checkin.away_until = None;
        out.feed
            .push(FeedEntry::new(4, "checkin.back", "is back").actor(email));
    } else {
        state.checkins.insert(
            email.to_string(),
            CheckIn {
                email: email.to_string(),
                at: now,
                by: actor.email.clone(),
                away_until: None,
            },
        );
        let mut entry = FeedEntry::new(4, "checkin", "checked in").actor(email);
        if email != actor.email {
            entry.data = json!({ "byAdmin": true });
        }
        out.feed.push(entry);
    }

    // Steam may already show them playing: put them in a lobby now.
    if let Some(game) = state.presence.get(email).and_then(|p| p.game_id) {
        let name = state.presence.get(email).and_then(|p| p.game_name.clone());
        super::presence::steam_membership(state, email, Some(game), name.as_deref(), now, out);
    }
    Ok(())
}

/// Step out for a while (`minutes` is one of [`AWAY_CHOICES`]). It leaves
/// their lobby, and they stop counting for votes, until they check back in
/// or the time is up, so nobody has to remember to come back.
pub fn check_out(
    state: &mut LiveState,
    actor: &Actor,
    email: &str,
    minutes: i64,
    now: DateTime<Utc>,
    out: &mut Outcome,
) -> Result<(), Reject> {
    if email != actor.email && !actor.admin {
        return Err(Reject::Forbidden(
            "You can only check yourself out".to_string(),
        ));
    }
    if !AWAY_CHOICES.contains(&minutes) {
        return Err(Reject::BadInput(
            "Choose 30 minutes, 1 hour or 2 hours".to_string(),
        ));
    }
    if !state.checkins.contains_key(email) {
        return Err(Reject::Conflict("Check in first".to_string()));
    }
    let until = (now + Duration::minutes(minutes)).min(state.event.time_end);
    if let Some(checkin) = state.checkins.get_mut(email) {
        checkin.away_until = Some(until);
    }
    if let Some(lobby_id) = membership::leave_current(state, email, "away", now, out) {
        out.feed.push(
            FeedEntry::new(4, "lobby.left", "left")
                .actor(email)
                .lobby(lobby_id),
        );
    }
    out.feed.push(
        FeedEntry::new(4, "checkout", "stepped out")
            .actor(email)
            .data(json!({ "until": until, "minutes": minutes })),
    );
    Ok(())
}

/// Time passing: people who stepped out come back when their time is up, and
/// anyone who checked in while their RSVP said they'd be around is checked
/// out once it says they've left (or they RSVP no).
pub fn tick(state: &mut LiveState, now: DateTime<Utc>, out: &mut Outcome) {
    let back: Vec<String> = state
        .checkins
        .values()
        .filter(|c| c.away_until.is_some_and(|until| until <= now))
        .map(|c| c.email.clone())
        .collect();
    for email in back {
        if let Some(checkin) = state.checkins.get_mut(&email) {
            checkin.away_until = None;
        }
        out.feed
            .push(FeedEntry::new(4, "checkin.back", "is back").actor(&email));
        // Steam may show them playing again.
        if let Some(presence) = state.presence.get(&email) {
            if let Some(game) = presence.game_id {
                let name = presence.game_name.clone();
                super::presence::steam_membership(
                    state,
                    &email,
                    Some(game),
                    name.as_deref(),
                    now,
                    out,
                );
            }
        }
    }

    let left: Vec<String> = state
        .checkins
        .values()
        .filter(|c| {
            state.people.get(&c.email).is_some_and(|p| {
                p.attending_at(&state.event, c.at) && !p.attending_at(&state.event, now)
            })
        })
        .map(|c| c.email.clone())
        .collect();
    for email in left {
        state.checkins.remove(&email);
        membership::leave_current(state, &email, "departed", now, out);
        out.feed
            .push(FeedEntry::new(4, "checkout.left", "has left").actor(&email));
    }
}
