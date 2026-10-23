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
    // Around by their RSVP, or staying on past it (which sticks until the
    // RSVP says they're around again).
    let staying = !person.attending_at(&state.event, now);
    if let Some(checkin) = state.checkins.get_mut(email) {
        // Back early from stepping out, or staying on after leaving.
        checkin.away_until = None;
        checkin.departed = false;
        checkin.staying = staying;
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
                departed: false,
                staying,
            },
        );
        let mut entry = FeedEntry::new(4, "checkin", "checked in").actor(email);
        if email != actor.email {
            entry.data = json!({ "byAdmin": true });
        }
        out.feed.push(entry);
    }
    returned(state, email, now, out);
    Ok(())
}

/// Someone is here again: Steam may already show them playing, so put them
/// in that game's lobby now.
fn returned(state: &mut LiveState, email: &str, now: DateTime<Utc>, out: &mut Outcome) {
    if let Some(presence) = state.presence.get(email) {
        if let Some(game) = presence.game_id {
            let name = presence.game_name.clone();
            super::presence::steam_membership(state, email, Some(game), name.as_deref(), now, out);
        }
    }
}

/// Step out for a while (`minutes` is one of [`AWAY_CHOICES`]), or with no
/// `minutes` check out until the RSVP says they're around again (only for
/// someone staying past it). `extend` adds the time to an existing step-out
/// instead of counting from now. Stepping out leaves their lobby, and they
/// stop counting for votes, until they check back in or the time is up, so
/// nobody has to remember to come back.
pub fn check_out(
    state: &mut LiveState,
    actor: &Actor,
    email: &str,
    minutes: Option<i64>,
    extend: bool,
    now: DateTime<Utc>,
    out: &mut Outcome,
) -> Result<(), Reject> {
    if email != actor.email && !actor.admin {
        return Err(Reject::Forbidden(
            "You can only check yourself out".to_string(),
        ));
    }
    if minutes.is_some_and(|m| !AWAY_CHOICES.contains(&m)) {
        return Err(Reject::BadInput(
            "Choose 30 minutes, 1 hour or 2 hours".to_string(),
        ));
    }
    let Some(checkin) = state.checkins.get(email) else {
        return Err(Reject::Conflict("Check in first".to_string()));
    };
    if checkin.departed {
        return Err(Reject::Conflict("You're already checked out".to_string()));
    }
    let Some(minutes) = minutes else {
        // A full check-out: for someone staying on past their RSVP.
        if !checkin.staying {
            return Err(Reject::BadInput(
                "Choose how long to step out for".to_string(),
            ));
        }
        if let Some(checkin) = state.checkins.get_mut(email) {
            checkin.staying = false;
            checkin.departed = true;
            checkin.away_until = None;
        }
        left(state, email, now, out);
        out.feed
            .push(FeedEntry::new(4, "checkout.left", "has left").actor(email));
        return Ok(());
    };
    let base = checkin
        .away_until
        .filter(|_| extend)
        .unwrap_or(now)
        .max(now);
    let until = (base + Duration::minutes(minutes)).min(state.event.time_end);
    if let Some(checkin) = state.checkins.get_mut(email) {
        checkin.away_until = Some(until);
    }
    left(state, email, now, out);
    out.feed.push(
        FeedEntry::new(
            4,
            "checkout",
            if extend { "stays out" } else { "stepped out" },
        )
        .actor(email)
        .data(json!({ "until": until, "minutes": minutes })),
    );
    Ok(())
}

/// They're not here any more: out of their lobby.
fn left(state: &mut LiveState, email: &str, now: DateTime<Utc>, out: &mut Outcome) {
    if let Some(lobby_id) = membership::leave_current(state, email, "away", now, out) {
        out.feed.push(
            FeedEntry::new(4, "lobby.left", "left")
                .actor(email)
                .lobby(lobby_id),
        );
    }
}

/// Time passing: people who stepped out come back when their time is up.
/// Checked-in people also follow their RSVP: they're checked out once it
/// says they've left (or they RSVP no) and back in when it says they're
/// around again. Anyone staying on past it stays until it's next due.
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
        if state.is_checked_in(&email) {
            returned(state, &email, now, out);
        }
    }

    let emails: Vec<String> = state.checkins.keys().cloned().collect();
    for email in emails {
        let around = state
            .people
            .get(&email)
            .is_some_and(|p| p.attending_at(&state.event, now));
        let Some(checkin) = state.checkins.get_mut(&email) else {
            continue;
        };
        if around {
            checkin.staying = false;
            if checkin.departed {
                checkin.departed = false;
                out.feed
                    .push(FeedEntry::new(4, "checkin.back", "is back").actor(&email));
                if state.is_checked_in(&email) {
                    returned(state, &email, now, out);
                }
            }
        } else if !checkin.staying && !checkin.departed {
            checkin.departed = true;
            left(state, &email, now, out);
            out.feed
                .push(FeedEntry::new(4, "checkout.left", "has left").actor(&email));
        }
    }
}
