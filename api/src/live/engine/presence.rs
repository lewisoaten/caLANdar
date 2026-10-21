//! Steam presence (DESIGN.md §3.7, §5.1).
//!
//! A new game counts once it is seen on two polls in a row (about 30-60s),
//! so a launch-to-patch blip doesn't create a lobby. Presence only ever
//! puts *checked-in* people in lobbies: someone playing at home only shows
//! up in the admin's check-in queue.

use chrono::{DateTime, Duration, Utc};
use rocket::serde::json::json;

use super::{
    membership::{self, joinable_now},
    schedule, FeedEntry, Outcome, PersonalToast, PresenceSample,
};
use crate::live::model::{
    Email, LiveState, LobbyKind, LobbySource, LobbyStatus, Presence, Via, AFK_STATES,
};

/// A changed game is accepted when seen again after at least this long.
pub const DEBOUNCE: Duration = Duration::seconds(25);
/// Steam's `communityvisibilitystate` for a public profile.
const PUBLIC: i32 = 3;

pub fn apply_samples(
    state: &mut LiveState,
    samples: &[PresenceSample],
    immediate: bool,
    now: DateTime<Utc>,
    out: &mut Outcome,
) {
    for sample in samples {
        if !state.people.contains_key(&sample.email) {
            continue;
        }
        apply_sample(state, sample, immediate, now, out);
    }
}

fn apply_sample(
    state: &mut LiveState,
    sample: &PresenceSample,
    immediate: bool,
    now: DateTime<Utc>,
    out: &mut Outcome,
) {
    let email = sample.email.clone();
    let checked_in = state.is_checked_in(&email);
    let presence = state
        .presence
        .entry(email.clone())
        .or_insert_with(|| Presence::new(&email));
    presence.observed_at = Some(now);
    presence.persona_state = sample.persona_state;
    presence.visibility = sample.visibility;

    // Away / Snooze, held for a while, fades the seat (it never removes you
    // from the lobby, or lobbies would empty whenever people step away).
    if AFK_STATES.contains(&sample.persona_state) {
        presence.afk_since.get_or_insert(now);
    } else {
        presence.afk_since = None;
        presence.afk_noted = false;
    }

    // Private profiles never report a game: say so once after check-in.
    if checked_in && sample.visibility != PUBLIC && !presence.private_hint_sent {
        presence.private_hint_sent = true;
        out.personal.push(PersonalToast {
            to: email.clone(),
            kind: "steam-private",
            data: json!({}),
        });
    }

    let reported = sample.game_id;
    let accepted = if reported == presence.game_id {
        presence.pending_game_id = None;
        presence.pending_game_name = None;
        presence.pending_since = None;
        false
    } else if immediate
        || (presence.pending_game_id == reported
            && presence
                .pending_since
                .is_some_and(|since| now - since >= DEBOUNCE))
    {
        true
    } else {
        if presence.pending_game_id != reported || presence.pending_since.is_none() {
            presence.pending_game_id = reported;
            presence.pending_game_name.clone_from(&sample.game_name);
            presence.pending_since = Some(now);
        }
        false
    };
    if !accepted {
        return;
    }

    let previous = presence.game_name.clone();
    presence.game_id = reported;
    presence.game_name = if reported.is_some() {
        sample
            .game_name
            .clone()
            .or_else(|| presence.pending_game_name.clone())
    } else {
        None
    };
    presence.pending_game_id = None;
    presence.pending_game_name = None;
    presence.pending_since = None;
    // A different game clears "I left that lobby" (§5.1.1).
    if presence.ignore_game_id.is_some() && presence.ignore_game_id != reported {
        presence.ignore_game_id = None;
    }
    let name = presence.game_name.clone();

    if !checked_in {
        return;
    }
    match (&name, &previous) {
        (Some(game), _) => out.feed.push(
            FeedEntry::new(4, "presence.playing", format!("is playing {game}")).actor(&email),
        ),
        (None, Some(game)) => out.feed.push(
            FeedEntry::new(4, "presence.stopped", format!("stopped playing {game}")).actor(&email),
        ),
        (None, None) => {}
    }
    steam_membership(state, &email, reported, name.as_deref(), now, out);
}

/// Bring someone's lobby in line with the game Steam shows (§5.1).
pub fn steam_membership(
    state: &mut LiveState,
    email: &str,
    game: Option<i64>,
    game_name: Option<&str>,
    now: DateTime<Utc>,
    out: &mut Outcome,
) {
    let current = state.current_membership(email);
    let current_lobby = current.and_then(|(_, id)| state.lobbies.get(&id)).cloned();

    // Eating: Steam may still show a game in the background, and closing it
    // doesn't end the meal (§5.1.4). This only runs when Steam's game
    // changes, though, so launching a game means you've finished eating:
    // that takes you out of the food lobby like any other switch.
    if game.is_none()
        && current_lobby
            .as_ref()
            .is_some_and(|l| l.kind == LobbyKind::Food)
    {
        return;
    }

    let Some(game) = game else {
        // Stopped playing: leave a lobby Steam put you in. Manual joins are
        // taken on trust.
        if let Some((member_id, _)) = current {
            if state
                .members
                .get(&member_id)
                .is_some_and(|m| m.via == Via::Steam)
            {
                membership::leave(state, member_id, "stopped", now, out);
            }
        }
        return;
    };

    let presence = state.presence.get(email).cloned().unwrap_or_default();
    if presence.ignore_game_id == Some(game) {
        return;
    }

    // You joined a lobby by hand and have now launched its game.
    if let Some(target) = presence.switch_lobby_id {
        if state.lobbies.get(&target).and_then(|l| l.game_id) == Some(game) {
            membership::join(state, email, target, Via::Steam, now, out);
            return;
        }
    }

    if current_lobby.as_ref().and_then(|l| l.game_id) == Some(game) {
        return;
    }

    let target = resolve_lobby(state, email, game, now).unwrap_or_else(|| {
        let name = game_name.map_or_else(|| format!("App {game}"), ToString::to_string);
        let minutes = state.typical_for(Some(game)).minutes;
        let id = schedule::new_lobby(
            state,
            game,
            name,
            LobbySource::Steam,
            LobbyStatus::Live,
            now,
            minutes,
            now,
        );
        out.feed.push(
            FeedEntry::new(2, "lobby.new", "started playing")
                .actor(email)
                .lobby(id)
                .people(vec![email.to_string()])
                .data(json!({ "kicker": "New lobby" })),
        );
        id
    });
    membership::join(state, email, target, Via::Steam, now, out);
}

/// Which lobby of `game` Steam presence puts someone in (§5.1.3): the one
/// you're pre-joined to, then the one with most people, then the most
/// recent. Only lobbies running now (or about to start) count.
pub fn resolve_lobby(state: &LiveState, email: &str, game: i64, now: DateTime<Utc>) -> Option<i32> {
    let prejoined = |id: i32| {
        state
            .prejoins
            .get(&(id, email.to_string()))
            .is_some_and(crate::live::model::Prejoin::is_active)
    };
    state
        .lobbies
        .values()
        .filter(|l| l.game_id == Some(game) && joinable_now(l, now))
        .max_by_key(|l| {
            (
                prejoined(l.id),
                state.members_of(l.id).count(),
                l.status.is_running(),
                l.start,
            )
        })
        .map(|l| l.id)
}

/// People Steam shows playing who haven't checked in (the admin queue).
pub fn playing_not_checked_in(state: &LiveState) -> Vec<(Email, Option<String>)> {
    state
        .presence
        .values()
        .filter(|p| p.game_id.is_some() && !state.is_checked_in(&p.email))
        .filter(|p| {
            state
                .people
                .get(&p.email)
                .is_some_and(crate::live::model::Person::attending)
        })
        .map(|p| (p.email.clone(), p.game_name.clone()))
        .collect()
}
