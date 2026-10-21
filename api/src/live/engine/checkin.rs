//! Check-in at the venue (DESIGN.md §5.5).

use chrono::{DateTime, Utc};
use rocket::serde::json::json;

use super::{Actor, FeedEntry, Outcome, Reject};
use crate::live::model::{CheckIn, LiveState};

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
    state.checkins.insert(
        email.to_string(),
        CheckIn {
            email: email.to_string(),
            at: now,
            by: actor.email.clone(),
        },
    );
    let mut entry = FeedEntry::new(4, "checkin", "checked in").actor(email);
    if email != actor.email {
        entry.data = json!({ "byAdmin": true });
    }
    out.feed.push(entry);

    // Steam may already show them playing: put them in a lobby now.
    if let Some(game) = state.presence.get(email).and_then(|p| p.game_id) {
        let name = state.presence.get(email).and_then(|p| p.game_name.clone());
        super::presence::steam_membership(state, email, Some(game), name.as_deref(), now, out);
    }
    Ok(())
}
