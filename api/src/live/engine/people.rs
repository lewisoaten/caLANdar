//! Admin actions on people from the check-in queue (DESIGN.md §5.5).

use chrono::{DateTime, Utc};
use rocket::serde::json::json;

use super::{membership, require_admin, Actor, Outcome, PersonalToast, Reject};
use crate::live::model::{bucket_count, bucket_index, LiveState, Rsvp};

fn person_email(state: &LiveState, email: &str) -> Result<String, Reject> {
    state
        .people
        .get(email)
        .map(|p| p.email.clone())
        .ok_or_else(|| Reject::NotFound("They aren't invited".to_string()))
}

/// They called to cancel: RSVP no, drop their pre-joins, take them out of
/// any lobby (and so out of every vote).
pub fn rsvp_no(
    state: &mut LiveState,
    actor: &Actor,
    email: &str,
    now: DateTime<Utc>,
    out: &mut Outcome,
) -> Result<(), Reject> {
    require_admin(actor)?;
    let email = person_email(state, email)?;
    if let Some(p) = state.people.get_mut(&email) {
        p.rsvp = Some(Rsvp::No);
    }
    for p in state.prejoins.values_mut() {
        if p.email == email && p.is_active() {
            p.dropped_at = Some(now);
            p.drop_reason = Some("rsvp".to_string());
        }
    }
    membership::leave_current(state, &email, "left", now, out);
    Ok(())
}

/// Running late: clear the attendance block they're in now, so the plan and
/// votes stop counting them for it.
pub fn delay_arrival(
    state: &mut LiveState,
    actor: &Actor,
    email: &str,
    now: DateTime<Utc>,
) -> Result<(), Reject> {
    require_admin(actor)?;
    let email = person_email(state, email)?;
    let Some(index) = bucket_index(state.event.time_begin, state.event.time_end, now) else {
        return Err(Reject::Conflict("The event isn't on right now".to_string()));
    };
    if let Some(p) = state.people.get_mut(&email) {
        if p.attendance.is_empty() {
            // Unset means every block: keep the later ones.
            let count = bucket_count(state.event.time_begin, state.event.time_end);
            p.attendance = vec![1; count.max(index + 1)];
        }
        if let Some(slot) = p.attendance.get_mut(index) {
            *slot = 0;
        }
    }
    Ok(())
}

/// A personal nudge (toast, and Web Push if they subscribed).
pub fn nudge(
    state: &LiveState,
    actor: &Actor,
    email: &str,
    out: &mut Outcome,
) -> Result<(), Reject> {
    require_admin(actor)?;
    let email = person_email(state, email)?;
    out.personal.push(PersonalToast {
        to: email,
        kind: "nudge",
        data: json!({ "text": "The admins are looking for you: are you on your way?" }),
    });
    Ok(())
}
