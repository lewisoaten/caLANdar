//! Engine tests: one scenario per rule, in the spirit of the storyboard
//! frames (F1-F13) of the design handoff.
#![allow(clippy::unwrap_used)]

use super::votes::{involved, title};
use super::*;
use crate::live::model::{EventInfo, Person, Rsvp};
use crate::live::model::{LobbyKind, LobbySource, LobbyStatus, Via};
use chrono::{Duration, TimeZone};

pub fn t(h: u32, m: u32) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 10, 23, h, m, 0)
        .single()
        .expect("valid")
}

pub fn person(email: &str, rsvp: Option<Rsvp>) -> Person {
    Person {
        email: email.to_string(),
        handle: Some(email.split('@').next().unwrap_or("x").to_string()),
        rsvp,
        attendance: vec![1; 12],
        steam_id: None,
        seat: None,
    }
}

/// An event from Fri 18:00 to Sun 16:00 with three attending gamers.
pub fn state() -> LiveState {
    let mut s = LiveState::new(EventInfo {
        id: 1,
        title: "LAN".to_string(),
        time_begin: t(18, 0),
        time_end: t(18, 0) + Duration::hours(46),
        discord_invite_url: None,
        timezone: "Europe/London".to_string(),
        wallboard_token: None,
        discord_webhook_url: None,
        wallboard_sleep: None,
        venue: None,
    });
    for e in ["ana@x.io", "bo@x.io", "cy@x.io"] {
        s.people.insert(e.to_string(), person(e, Some(Rsvp::Yes)));
    }
    s.people
        .insert("no@x.io".to_string(), person("no@x.io", Some(Rsvp::No)));
    s
}

pub fn gamer(email: &str) -> Actor {
    Actor {
        email: email.to_string(),
        admin: false,
    }
}

pub fn admin() -> Actor {
    Actor {
        email: "admin@x.io".to_string(),
        admin: true,
    }
}

pub fn cmd(actor: Actor, command: Command) -> Input {
    Input::Command { actor, command }
}

#[test]
fn check_in_opens_at_doors() {
    let mut s = state();
    let early = apply(
        &mut s,
        cmd(
            gamer("ana@x.io"),
            Command::CheckIn {
                email: "ana@x.io".into(),
            },
        ),
        t(17, 59),
    );
    assert!(matches!(early, Err(Reject::Conflict(_))));

    let out = apply(
        &mut s,
        cmd(
            gamer("ana@x.io"),
            Command::CheckIn {
                email: "ana@x.io".into(),
            },
        ),
        t(18, 4),
    )
    .expect("checked in");
    assert!(s.is_checked_in("ana@x.io"));
    assert_eq!(out.feed.len(), 1);
    assert_eq!(out.feed[0].kind, "checkin");
    assert_eq!(out.feed[0].tier, 4);

    // Checking in twice is a no-op.
    let again = apply(
        &mut s,
        cmd(
            gamer("ana@x.io"),
            Command::CheckIn {
                email: "ana@x.io".into(),
            },
        ),
        t(18, 5),
    )
    .expect("ok");
    assert!(again.feed.is_empty());
    assert_eq!(s.checkins["ana@x.io"].at, t(18, 4));
}

#[test]
fn check_in_is_personal_unless_admin() {
    let mut s = state();
    let other = apply(
        &mut s,
        cmd(
            gamer("ana@x.io"),
            Command::CheckIn {
                email: "bo@x.io".into(),
            },
        ),
        t(19, 0),
    );
    assert!(matches!(other, Err(Reject::Forbidden(_))));
    let declined = apply(
        &mut s,
        cmd(
            gamer("no@x.io"),
            Command::CheckIn {
                email: "no@x.io".into(),
            },
        ),
        t(19, 0),
    );
    assert!(matches!(declined, Err(Reject::Conflict(_))));
    apply(
        &mut s,
        cmd(
            admin(),
            Command::CheckIn {
                email: "bo@x.io".into(),
            },
        ),
        t(19, 0),
    )
    .expect("admin can");
    assert_eq!(s.checkins["bo@x.io"].by, "admin@x.io");
}

fn edit(start: DateTime<Utc>, minutes: i32) -> LobbyEdit {
    LobbyEdit {
        game_id: 548_430,
        game_name: "Deep Rock Galactic".to_string(),
        start,
        minutes,
    }
}

#[test]
fn admin_edits_freeze_the_plan_once_the_event_runs() {
    let mut s = state();
    // Before the event: plain planning, no feed, nothing frozen.
    apply(
        &mut s,
        cmd(admin(), Command::CreateLobby(edit(t(20, 0), 120))),
        t(12, 0),
    )
    .expect("created");
    let id = *s.lobbies.keys().next().expect("a lobby");
    let out = apply(
        &mut s,
        cmd(
            admin(),
            Command::UpdateLobby {
                id,
                edit: edit(t(21, 0), 120),
            },
        ),
        t(12, 0),
    )
    .expect("moved");
    assert!(out.feed.is_empty());
    assert_eq!(s.lobbies[&id].planned_start, None);

    // During the event: the plan is frozen and the feed says so.
    let out = apply(
        &mut s,
        cmd(
            admin(),
            Command::UpdateLobby {
                id,
                edit: edit(t(22, 30), 90),
            },
        ),
        t(19, 0),
    )
    .expect("moved");
    let lobby = &s.lobbies[&id];
    assert_eq!(lobby.planned_start, Some(t(21, 0)));
    assert_eq!(lobby.planned_minutes, Some(120));
    assert_eq!(lobby.start, t(22, 30));
    assert_eq!(out.feed[0].kind, "lobby.moved");

    // Only admins edit.
    let refused = apply(
        &mut s,
        cmd(gamer("ana@x.io"), Command::RemoveLobby { id }),
        t(19, 0),
    );
    assert!(matches!(refused, Err(Reject::Forbidden(_))));

    apply(&mut s, cmd(admin(), Command::RemoveLobby { id }), t(19, 0)).expect("removed");
    assert!(s.lobbies.is_empty());
}

#[test]
fn edits_are_validated() {
    let mut s = state();
    apply(
        &mut s,
        cmd(admin(), Command::CreateLobby(edit(t(20, 0), 120))),
        t(12, 0),
    )
    .expect("created");
    let id = *s.lobbies.keys().next().expect("a lobby");
    let bad = apply(
        &mut s,
        cmd(
            admin(),
            Command::UpdateLobby {
                id,
                edit: edit(t(20, 0), 1),
            },
        ),
        t(12, 0),
    );
    assert!(matches!(bad, Err(Reject::BadInput(_))));
    let missing = apply(
        &mut s,
        cmd(
            admin(),
            Command::UpdateLobby {
                id: 999,
                edit: edit(t(20, 0), 60),
            },
        ),
        t(12, 0),
    );
    assert!(matches!(missing, Err(Reject::NotFound(_))));
}

// ---- phase 2: presence ----------------------------------------------------

const CS2: i64 = 730;
const DRG: i64 = 548_430;
const FAC: i64 = 427_520;

pub fn checked_in(emails: &[&str]) -> LiveState {
    let mut s = state();
    for e in emails {
        apply(
            &mut s,
            cmd(gamer(e), Command::CheckIn { email: (*e).into() }),
            t(18, 1),
        )
        .expect("checked in");
    }
    s
}

fn steam(email: &str, game: Option<(i64, &str)>) -> PresenceSample {
    PresenceSample {
        email: email.to_string(),
        game_id: game.map(|g| g.0),
        game_name: game.map(|g| g.1.to_string()),
        persona_state: 1,
        visibility: 3,
    }
}

fn poll(s: &mut LiveState, samples: Vec<PresenceSample>, at: DateTime<Utc>) -> Outcome {
    apply(
        s,
        Input::Presence {
            samples,
            immediate: false,
        },
        at,
    )
    .expect("presence")
}

/// Two polls 30s apart: the debounced way a game is seen.
pub fn play(
    s: &mut LiveState,
    email: &str,
    game: Option<(i64, &str)>,
    at: DateTime<Utc>,
) -> Outcome {
    poll(s, vec![steam(email, game)], at);
    poll(s, vec![steam(email, game)], at + Duration::seconds(30))
}

pub fn lobby_of(s: &LiveState, email: &str) -> Option<i32> {
    s.current_membership(email).map(|(_, id)| id)
}

fn planned(s: &mut LiveState, game: i64, name: &str, start: DateTime<Utc>, minutes: i32) -> i32 {
    apply(
        s,
        cmd(
            admin(),
            Command::CreateLobby(LobbyEdit {
                game_id: game,
                game_name: name.to_string(),
                start,
                minutes,
            }),
        ),
        t(12, 0),
    )
    .expect("planned");
    s.lobbies
        .values()
        .find(|l| l.game_id == Some(game) && l.start == start)
        .expect("lobby")
        .id
}

#[test]
fn steam_needs_two_polls_then_auto_creates_a_lobby() {
    let mut s = checked_in(&["ana@x.io"]);
    poll(
        &mut s,
        vec![steam("ana@x.io", Some((CS2, "Counter-Strike 2")))],
        t(19, 0),
    );
    assert_eq!(lobby_of(&s, "ana@x.io"), None, "one poll is a blip");
    let out = poll(
        &mut s,
        vec![steam("ana@x.io", Some((CS2, "Counter-Strike 2")))],
        t(19, 0) + Duration::seconds(30),
    );
    let id = lobby_of(&s, "ana@x.io").expect("in a lobby");
    let lobby = &s.lobbies[&id];
    assert_eq!(lobby.source, LobbySource::Steam);
    assert_eq!(lobby.status, LobbyStatus::Live);
    assert_eq!(lobby.minutes, 120, "no history: the default length");
    assert!(out.feed.iter().any(|f| f.kind == "lobby.new"));
    let m = s
        .members
        .values()
        .find(|m| m.email == "ana@x.io")
        .expect("member");
    assert_eq!(m.via, Via::Steam);
}

#[test]
fn a_launch_blip_never_creates_a_lobby() {
    let mut s = checked_in(&["ana@x.io"]);
    poll(
        &mut s,
        vec![steam("ana@x.io", Some((CS2, "CS2")))],
        t(19, 0),
    );
    poll(
        &mut s,
        vec![steam("ana@x.io", None)],
        t(19, 0) + Duration::seconds(30),
    );
    assert!(s.lobbies.is_empty());
}

#[test]
fn presence_before_check_in_only_reaches_the_admin_queue() {
    let mut s = state();
    play(&mut s, "ana@x.io", Some((CS2, "CS2")), t(19, 0));
    assert!(s.lobbies.is_empty(), "might be playing at home");
    assert_eq!(
        presence::playing_not_checked_in(&s),
        vec![("ana@x.io".to_string(), Some("CS2".to_string()))]
    );
    // Checking in puts them straight into a lobby.
    apply(
        &mut s,
        cmd(
            gamer("ana@x.io"),
            Command::CheckIn {
                email: "ana@x.io".into(),
            },
        ),
        t(19, 5),
    )
    .expect("checked in");
    assert!(lobby_of(&s, "ana@x.io").is_some());
}

#[test]
fn the_second_player_joins_the_same_lobby() {
    let mut s = checked_in(&["ana@x.io", "bo@x.io"]);
    play(&mut s, "ana@x.io", Some((CS2, "CS2")), t(19, 0));
    play(&mut s, "bo@x.io", Some((CS2, "CS2")), t(19, 2));
    assert_eq!(s.lobbies.len(), 1);
    assert_eq!(lobby_of(&s, "ana@x.io"), lobby_of(&s, "bo@x.io"));
}

#[test]
fn steam_prefers_the_lobby_you_pre_joined() {
    let mut s = checked_in(&["ana@x.io", "bo@x.io"]);
    let planned_id = planned(&mut s, DRG, "Deep Rock Galactic", t(20, 0), 120);
    apply(
        &mut s,
        cmd(
            gamer("ana@x.io"),
            Command::Prejoin {
                lobby: LobbyRef::Stored(planned_id),
                team: None,
                random: false,
            },
        ),
        t(19, 0),
    )
    .expect("pre-joined");
    assert_eq!(s.lobbies[&planned_id].status, LobbyStatus::Confirmed);
    // Launching DRG ten minutes early starts the planned lobby.
    play(
        &mut s,
        "ana@x.io",
        Some((DRG, "Deep Rock Galactic")),
        t(19, 50),
    );
    assert_eq!(lobby_of(&s, "ana@x.io"), Some(planned_id));
    assert_eq!(
        s.lobbies[&planned_id].status,
        LobbyStatus::Grace,
        "the grace runs to the planned start + 5"
    );
    assert_eq!(s.lobbies[&planned_id].grace_until, Some(t(20, 5)));
    assert_eq!(
        s.lobbies[&planned_id].actual_start,
        Some(t(19, 50) + Duration::seconds(30))
    );
}

#[test]
fn a_planned_lobby_hours_away_is_not_where_steam_puts_you() {
    let mut s = checked_in(&["ana@x.io"]);
    let later = planned(&mut s, DRG, "Deep Rock Galactic", t(23, 0), 120);
    play(
        &mut s,
        "ana@x.io",
        Some((DRG, "Deep Rock Galactic")),
        t(19, 0),
    );
    let now_lobby = lobby_of(&s, "ana@x.io").expect("in a lobby");
    assert_ne!(now_lobby, later);
    assert_eq!(s.lobbies[&later].status, LobbyStatus::Planned);
}

#[test]
fn manual_join_while_steam_shows_another_game_waits_for_the_launch() {
    let mut s = checked_in(&["ana@x.io", "bo@x.io"]);
    play(&mut s, "ana@x.io", Some((CS2, "CS2")), t(19, 0));
    let cs2 = lobby_of(&s, "ana@x.io").expect("cs2");
    play(&mut s, "bo@x.io", Some((FAC, "Factorio")), t(19, 0));
    let fac = lobby_of(&s, "bo@x.io").expect("factorio");

    apply(
        &mut s,
        cmd(gamer("ana@x.io"), Command::Join { lobby: fac }),
        t(19, 10),
    )
    .expect("join");
    assert_eq!(
        lobby_of(&s, "ana@x.io"),
        Some(cs2),
        "Steam wins until you launch it"
    );
    assert_eq!(s.presence["ana@x.io"].switch_lobby_id, Some(fac));

    play(&mut s, "ana@x.io", Some((FAC, "Factorio")), t(19, 12));
    assert_eq!(lobby_of(&s, "ana@x.io"), Some(fac));
    assert_eq!(s.presence["ana@x.io"].switch_lobby_id, None);
}

#[test]
fn an_unlaunched_switch_becomes_a_pre_join() {
    let mut s = checked_in(&["ana@x.io", "bo@x.io"]);
    play(&mut s, "ana@x.io", Some((CS2, "CS2")), t(19, 0));
    let cs2 = lobby_of(&s, "ana@x.io").expect("cs2");
    let drg = planned(&mut s, DRG, "Deep Rock Galactic", t(19, 10), 120);
    apply(
        &mut s,
        cmd(gamer("ana@x.io"), Command::Join { lobby: drg }),
        t(19, 5),
    )
    .expect("join");
    apply(&mut s, Input::Tick, t(19, 11)).expect("tick");
    assert_eq!(lobby_of(&s, "ana@x.io"), Some(cs2), "still in CS2");
    assert!(s.prejoins[&(drg, "ana@x.io".to_string())].is_active());
    assert_eq!(s.presence["ana@x.io"].switch_lobby_id, None);
}

#[test]
fn leave_sticks_until_steam_shows_a_different_game() {
    let mut s = checked_in(&["ana@x.io"]);
    play(&mut s, "ana@x.io", Some((CS2, "CS2")), t(19, 0));
    apply(&mut s, cmd(gamer("ana@x.io"), Command::Leave), t(19, 30)).expect("left");
    assert_eq!(lobby_of(&s, "ana@x.io"), None);
    // CS2 still running in the background doesn't pull them back in.
    poll(
        &mut s,
        vec![steam("ana@x.io", Some((CS2, "CS2")))],
        t(19, 31),
    );
    poll(
        &mut s,
        vec![steam("ana@x.io", Some((CS2, "CS2")))],
        t(19, 32),
    );
    assert_eq!(lobby_of(&s, "ana@x.io"), None);
    // A different game does.
    play(&mut s, "ana@x.io", Some((FAC, "Factorio")), t(19, 40));
    assert!(lobby_of(&s, "ana@x.io").is_some());
    assert_eq!(s.presence["ana@x.io"].ignore_game_id, None);
}

#[test]
fn the_last_one_out_empties_the_lobby_and_it_closes_after_five_minutes() {
    let mut s = checked_in(&["ana@x.io"]);
    play(&mut s, "ana@x.io", Some((CS2, "CS2")), t(19, 0));
    let id = lobby_of(&s, "ana@x.io").expect("lobby");
    let out = play(&mut s, "ana@x.io", None, t(20, 30));
    assert_eq!(s.lobbies[&id].status, LobbyStatus::Empty);
    assert!(out.feed.iter().any(|f| f.kind == "lobby.empty"));
    let left_at = s.lobbies[&id].empty_since.expect("empty since");

    apply(&mut s, Input::Tick, left_at + Duration::minutes(4)).expect("tick");
    assert_eq!(s.lobbies[&id].status, LobbyStatus::Empty);
    let out = apply(&mut s, Input::Tick, left_at + Duration::minutes(5)).expect("tick");
    let lobby = &s.lobbies[&id];
    assert_eq!(lobby.status, LobbyStatus::Done);
    assert_eq!(
        lobby.actual_end,
        Some(left_at),
        "ends when the last person left"
    );
    assert_eq!(lobby.start, lobby.actual_start.expect("start"));
    assert_eq!(lobby.planned_start, Some(t(19, 0) + Duration::seconds(30)));
    assert!(out.feed.iter().any(|f| f.kind == "lobby.ended"));
}

#[test]
fn rejoining_an_empty_lobby_brings_it_back() {
    let mut s = checked_in(&["ana@x.io"]);
    play(&mut s, "ana@x.io", Some((CS2, "CS2")), t(19, 0));
    let id = lobby_of(&s, "ana@x.io").expect("lobby");
    play(&mut s, "ana@x.io", None, t(20, 0));
    assert_eq!(s.lobbies[&id].status, LobbyStatus::Empty);
    play(&mut s, "ana@x.io", Some((CS2, "CS2")), t(20, 2));
    assert_eq!(s.lobbies[&id].status, LobbyStatus::Live);
    assert_eq!(s.lobbies[&id].empty_since, None);
}

#[test]
fn manual_join_needs_check_in_and_a_lobby_that_is_on() {
    let mut s = state();
    let far = planned(&mut s, DRG, "Deep Rock Galactic", t(23, 0), 120);
    let refused = apply(
        &mut s,
        cmd(gamer("ana@x.io"), Command::Join { lobby: far }),
        t(19, 0),
    );
    assert_eq!(refused, Err(Reject::Conflict("Check in first".to_string())));
    let mut s = checked_in(&["ana@x.io"]);
    let far = planned(&mut s, DRG, "Deep Rock Galactic", t(23, 0), 120);
    let refused = apply(
        &mut s,
        cmd(gamer("ana@x.io"), Command::Join { lobby: far }),
        t(19, 0),
    );
    assert!(matches!(refused, Err(Reject::Conflict(_))));
    let soon = planned(&mut s, CS2, "CS2", t(19, 10), 60);
    apply(
        &mut s,
        cmd(gamer("ana@x.io"), Command::Join { lobby: soon }),
        t(19, 0),
    )
    .expect("early");
    assert_eq!(lobby_of(&s, "ana@x.io"), Some(soon));
    let m = s
        .members
        .values()
        .find(|m| m.email == "ana@x.io")
        .expect("member");
    assert_eq!(m.via, Via::Manual);
    assert_eq!(m.manual_expires_at, Some(t(20, 10) + Duration::minutes(30)));
}

#[test]
fn a_manual_now_lapses_unless_still_playing() {
    let mut s = checked_in(&["ana@x.io", "bo@x.io"]);
    let a = planned(&mut s, CS2, "CS2", t(19, 0), 60);
    apply(
        &mut s,
        cmd(gamer("ana@x.io"), Command::Join { lobby: a }),
        t(19, 0),
    )
    .expect("ana");
    apply(
        &mut s,
        cmd(gamer("bo@x.io"), Command::Join { lobby: a }),
        t(19, 0),
    )
    .expect("bo");
    apply(
        &mut s,
        cmd(gamer("bo@x.io"), Command::StillPlaying { lobby: a }),
        t(20, 20),
    )
    .expect("still playing");
    apply(&mut s, Input::Tick, t(20, 31)).expect("tick");
    assert_eq!(lobby_of(&s, "ana@x.io"), None, "lapsed at end + 30");
    assert_eq!(
        lobby_of(&s, "bo@x.io"),
        Some(a),
        "said they're still playing"
    );
}

#[test]
fn food_ignores_a_game_left_running_but_launching_one_ends_the_meal() {
    let mut s = checked_in(&["ana@x.io"]);
    play(&mut s, "ana@x.io", Some((CS2, "CS2")), t(18, 30));
    let id = s.temp_lobby_id();
    let mut food = schedule_lobby(id, t(19, 0), 45);
    food.kind = LobbyKind::Food;
    food.game_id = None;
    food.food = Some(crate::live::model::Food {
        name: "Pizza".to_string(),
        ..Default::default()
    });
    s.lobbies.insert(id, food);
    apply(
        &mut s,
        cmd(gamer("ana@x.io"), Command::Join { lobby: id }),
        t(19, 0),
    )
    .expect("eat");
    // CS2 still running in the background, then closed: still eating.
    poll(
        &mut s,
        vec![steam("ana@x.io", Some((CS2, "CS2")))],
        t(19, 5),
    );
    assert_eq!(lobby_of(&s, "ana@x.io"), Some(id), "still eating");
    play(&mut s, "ana@x.io", None, t(19, 10));
    assert_eq!(lobby_of(&s, "ana@x.io"), Some(id), "still eating");

    // Launching the next game (pre-joined, starting soon) moves them to it.
    let l4d = planned(&mut s, L4D, "L4D2", t(19, 30), 90);
    apply(
        &mut s,
        cmd(
            gamer("ana@x.io"),
            Command::Prejoin {
                lobby: LobbyRef::Stored(l4d),
                team: None,
                random: false,
            },
        ),
        t(19, 12),
    )
    .expect("pre-joined");
    play(&mut s, "ana@x.io", Some((L4D, "L4D2")), t(19, 16));
    assert_eq!(lobby_of(&s, "ana@x.io"), Some(l4d), "done eating");
    assert_eq!(s.lobbies[&l4d].status, LobbyStatus::Grace, "starts early");
}

#[test]
fn when_the_meal_ends_steam_puts_you_in_the_game_it_shows() {
    let mut s = checked_in(&["ana@x.io"]);
    let l4d = planned(&mut s, L4D, "L4D2", t(19, 45), 90);
    apply(
        &mut s,
        cmd(
            gamer("ana@x.io"),
            Command::Prejoin {
                lobby: LobbyRef::Stored(l4d),
                team: None,
                random: false,
            },
        ),
        t(19, 0),
    )
    .expect("pre-joined");
    let id = s.temp_lobby_id();
    let mut food = schedule_lobby(id, t(19, 0), 45);
    food.kind = LobbyKind::Food;
    food.game_id = None;
    food.food = Some(crate::live::model::Food {
        name: "Pizza".to_string(),
        ..Default::default()
    });
    s.lobbies.insert(id, food);
    play(&mut s, "ana@x.io", Some((L4D, "L4D2")), t(19, 31));
    assert_eq!(lobby_of(&s, "ana@x.io"), Some(l4d), "joined early");
    // Back to dinner by hand while Steam still shows L4D2.
    apply(
        &mut s,
        cmd(gamer("ana@x.io"), Command::Join { lobby: id }),
        t(19, 35),
    )
    .expect("eat");
    assert_eq!(lobby_of(&s, "ana@x.io"), Some(id));
    // The same game reported again changes nothing while eating...
    poll(
        &mut s,
        vec![steam("ana@x.io", Some((L4D, "L4D2")))],
        t(19, 40),
    );
    assert_eq!(lobby_of(&s, "ana@x.io"), Some(id), "still eating");
    // ...but once the meal ends, Steam's game counts again.
    tick_at(&mut s, t(19, 46));
    assert_eq!(lobby_of(&s, "ana@x.io"), Some(l4d), "back into L4D2");
    assert_eq!(s.lobbies[&l4d].status, LobbyStatus::Grace);
}

#[test]
fn a_meal_ending_as_the_grace_runs_out_still_lands_in_that_lobby() {
    let mut s = checked_in(&["ana@x.io"]);
    let l4d = planned(&mut s, L4D, "L4D2", t(19, 40), 90);
    apply(
        &mut s,
        cmd(
            gamer("ana@x.io"),
            Command::Prejoin {
                lobby: LobbyRef::Stored(l4d),
                team: None,
                random: false,
            },
        ),
        t(19, 0),
    )
    .expect("pre-joined");
    let id = s.temp_lobby_id();
    let mut food = schedule_lobby(id, t(19, 0), 45);
    food.kind = LobbyKind::Food;
    food.game_id = None;
    food.food = Some(crate::live::model::Food {
        name: "Pizza".to_string(),
        ..Default::default()
    });
    s.lobbies.insert(id, food);
    play(&mut s, "ana@x.io", Some((L4D, "L4D2")), t(19, 31));
    assert_eq!(lobby_of(&s, "ana@x.io"), Some(l4d), "joined early");
    // Back to dinner by hand while Steam still shows L4D2.
    apply(
        &mut s,
        cmd(gamer("ana@x.io"), Command::Join { lobby: id }),
        t(19, 35),
    )
    .expect("eat");
    assert_eq!(lobby_of(&s, "ana@x.io"), Some(id));
    // The same game reported again changes nothing while eating...
    poll(
        &mut s,
        vec![steam("ana@x.io", Some((L4D, "L4D2")))],
        t(19, 40),
    );
    assert_eq!(lobby_of(&s, "ana@x.io"), Some(id), "still eating");
    // ...but once the meal ends, Steam's game counts again.
    tick_at(&mut s, t(19, 46));
    assert_eq!(lobby_of(&s, "ana@x.io"), Some(l4d), "back into L4D2");
    assert_eq!(s.lobbies[&l4d].status, LobbyStatus::Live, "not a new lobby");
}

#[test]
fn an_ended_lobby_is_not_recreated_while_steam_still_shows_its_game() {
    let mut s = checked_in(&["ana@x.io"]);
    play(&mut s, "ana@x.io", Some((CS2, "CS2")), t(19, 0));
    let id = lobby_of(&s, "ana@x.io").expect("lobby");
    apply(&mut s, cmd(admin(), Command::EndLobby { id }), t(20, 0)).expect("ended");
    tick_at(&mut s, t(20, 1));
    assert_eq!(lobby_of(&s, "ana@x.io"), None);
    // A different game later still works.
    play(&mut s, "ana@x.io", Some((L4D, "L4D2")), t(20, 10));
    assert!(lobby_of(&s, "ana@x.io").is_some());
}

fn schedule_lobby(id: i32, start: DateTime<Utc>, minutes: i32) -> crate::live::model::Lobby {
    crate::live::model::Lobby {
        id,
        kind: LobbyKind::Game,
        game_id: Some(CS2),
        name: "CS2".to_string(),
        food: None,
        status: LobbyStatus::Planned,
        source: LobbySource::Plan,
        start,
        minutes,
        planned_start: None,
        planned_minutes: None,
        actual_start: None,
        actual_end: None,
        max_players: None,
        teams: None,
        proposed_by: None,
        created_by_vote: None,
        grace_until: None,
        grace_locked: false,
        hold_remaining_s: None,
        empty_since: None,
        is_pinned: true,
        created_at: start,
        version: 0,
    }
}

#[test]
fn pre_joins_fill_teams_and_respect_capacity() {
    let mut s = checked_in(&["ana@x.io", "bo@x.io", "cy@x.io"]);
    let dbd = planned(&mut s, 381_210, "Dead by Daylight", t(21, 0), 120);
    apply(
        &mut s,
        cmd(
            admin(),
            Command::SetPlayers {
                game_id: 381_210,
                lobby: Some(dbd),
                players: PlayersAndTeams {
                    max_players: None,
                    teams: Some(vec![
                        crate::live::model::Team {
                            name: "Killer".into(),
                            size: 1,
                        },
                        crate::live::model::Team {
                            name: "Survivors".into(),
                            size: 1,
                        },
                    ]),
                },
            },
        ),
        t(19, 0),
    )
    .expect("teams");
    assert!(s.defaults.contains_key(&381_210), "saved for everyone");
    let pj = |s: &mut LiveState, who: &str, team: Option<&str>, random: bool| {
        apply(
            s,
            cmd(
                gamer(who),
                Command::Prejoin {
                    lobby: LobbyRef::Stored(dbd),
                    team: team.map(ToString::to_string),
                    random,
                },
            ),
            t(19, 5),
        )
    };
    pj(&mut s, "ana@x.io", Some("Killer"), false).expect("killer");
    assert!(matches!(
        pj(&mut s, "bo@x.io", Some("Killer"), false),
        Err(Reject::Conflict(_))
    ));
    pj(&mut s, "bo@x.io", None, true).expect("random");
    assert!(
        matches!(pj(&mut s, "cy@x.io", None, true), Err(Reject::Conflict(_))),
        "two seats, two people"
    );
    assert!(matches!(
        pj(&mut s, "ana@x.io", Some("Nope"), false),
        Err(Reject::BadInput(_))
    ));
}

#[test]
fn pre_joining_a_suggestion_stores_it_and_leaving_hands_it_back() {
    let mut s = checked_in(&["ana@x.io"]);
    let suggestion = Suggestion {
        game_id: DRG,
        game_name: "Deep Rock Galactic".to_string(),
        start: t(22, 0),
        minutes: 120,
    };
    apply(
        &mut s,
        cmd(
            gamer("ana@x.io"),
            Command::Prejoin {
                lobby: LobbyRef::Suggested(suggestion),
                team: None,
                random: false,
            },
        ),
        t(19, 0),
    )
    .expect("pre-joined");
    let id = *s.lobbies.keys().next().expect("stored");
    assert_eq!(s.lobbies[&id].source, LobbySource::Suggestion);
    assert_eq!(s.lobbies[&id].status, LobbyStatus::Confirmed);
    apply(
        &mut s,
        cmd(gamer("ana@x.io"), Command::Unprejoin { lobby: id }),
        t(19, 1),
    )
    .expect("left");
    assert!(s.lobbies.is_empty(), "back to the planner's pool");
}

#[test]
fn afk_is_noted_once_and_never_removes_you() {
    let mut s = checked_in(&["ana@x.io"]);
    play(&mut s, "ana@x.io", Some((CS2, "CS2")), t(19, 0));
    let mut away = steam("ana@x.io", Some((CS2, "CS2")));
    away.persona_state = 3;
    poll(&mut s, vec![away.clone()], t(19, 5));
    let out = poll(&mut s, vec![away.clone()], t(19, 16));
    assert!(out.feed.iter().any(|f| f.kind == "presence.afk"));
    let out = poll(&mut s, vec![away], t(19, 20));
    assert!(!out.feed.iter().any(|f| f.kind == "presence.afk"));
    assert!(lobby_of(&s, "ana@x.io").is_some());
}

#[test]
fn private_profiles_get_one_hint() {
    let mut s = checked_in(&["ana@x.io"]);
    let mut private = steam("ana@x.io", None);
    private.visibility = 1;
    let out = poll(&mut s, vec![private.clone()], t(19, 0));
    assert_eq!(out.personal.len(), 1);
    let out = poll(&mut s, vec![private], t(19, 1));
    assert!(out.personal.is_empty());
}

#[test]
fn admin_end_lobby_closes_it_now() {
    let mut s = checked_in(&["ana@x.io"]);
    play(&mut s, "ana@x.io", Some((CS2, "CS2")), t(19, 0));
    let id = lobby_of(&s, "ana@x.io").expect("lobby");
    apply(&mut s, cmd(admin(), Command::EndLobby { id }), t(20, 0)).expect("ended");
    assert_eq!(s.lobbies[&id].status, LobbyStatus::Done);
    assert_eq!(lobby_of(&s, "ana@x.io"), None);
}

// ---- phase 3: start-time machine, proposals and votes ---------------------

const L4D: i64 = 550;
const PHAS: i64 = 739_630;

fn prejoin_cmd(s: &mut LiveState, who: &str, lobby: i32, at: DateTime<Utc>) {
    apply(
        s,
        cmd(
            gamer(who),
            Command::Prejoin {
                lobby: LobbyRef::Stored(lobby),
                team: None,
                random: false,
            },
        ),
        at,
    )
    .expect("pre-joined");
}

fn join_cmd(s: &mut LiveState, who: &str, lobby: i32, at: DateTime<Utc>) {
    apply(s, cmd(gamer(who), Command::Join { lobby }), at).expect("joined");
}

fn tick_at(s: &mut LiveState, at: DateTime<Utc>) -> Outcome {
    apply(s, Input::Tick, at).expect("tick")
}

fn game(id: i64, name: &str) -> OptionSpec {
    OptionSpec::Game {
        game_id: id,
        name: name.to_string(),
    }
}

fn no_players() -> PlayersAndTeams {
    PlayersAndTeams {
        max_players: None,
        teams: None,
    }
}

fn the_vote(s: &LiveState) -> crate::live::model::Vote {
    s.votes.values().next().expect("a vote").clone()
}

fn option_named(s: &LiveState, vote: i64, name: &str) -> i64 {
    s.options
        .values()
        .find(|o| o.vote_id == vote && o.name.contains(name))
        .unwrap_or_else(|| panic!("no option {name}"))
        .id
}

fn vote_for(s: &mut LiveState, who: &str, vote: i64, option: i64, at: DateTime<Utc>) {
    apply(
        s,
        cmd(
            gamer(who),
            Command::Ballot {
                vote,
                option: Some(option),
                split_ok: None,
            },
        ),
        at,
    )
    .expect("voted");
}

#[test]
fn nobody_joins_and_the_lobby_is_booted_after_five_minutes() {
    let mut s = checked_in(&["ana@x.io"]);
    let drg = planned(&mut s, DRG, "DRG", t(20, 0), 120);
    tick_at(&mut s, t(19, 59));
    assert_eq!(s.lobbies[&drg].status, LobbyStatus::Planned);
    tick_at(&mut s, t(20, 0));
    assert_eq!(s.lobbies[&drg].status, LobbyStatus::Waiting);
    assert_eq!(s.lobbies[&drg].grace_until, Some(t(20, 5)));
    tick_at(&mut s, t(20, 5));
    assert_eq!(
        s.lobbies[&drg].status,
        LobbyStatus::Removed,
        "a planned row stays as removed"
    );
}

#[test]
fn a_booted_suggestion_goes_back_to_the_planner() {
    let mut s = checked_in(&["ana@x.io"]);
    apply(
        &mut s,
        Input::Materialise {
            suggestions: vec![Suggestion {
                game_id: DRG,
                game_name: "DRG".into(),
                start: t(20, 0),
                minutes: 120,
            }],
        },
        t(19, 59),
    )
    .expect("stored");
    let id = *s.lobbies.keys().next().expect("stored");
    assert_eq!(s.lobbies[&id].source, LobbySource::Suggestion);
    tick_at(&mut s, t(20, 0));
    tick_at(&mut s, t(20, 5));
    assert!(
        s.lobbies.is_empty(),
        "deleted: the planner can suggest it again"
    );
}

#[test]
fn the_first_join_locks_the_grace_and_stragglers_drop_out() {
    let mut s = checked_in(&["ana@x.io", "bo@x.io"]);
    let drg = planned(&mut s, DRG, "DRG", t(20, 0), 120);
    prejoin_cmd(&mut s, "ana@x.io", drg, t(19, 0));
    prejoin_cmd(&mut s, "bo@x.io", drg, t(19, 0));
    // Bo is still playing CS2.
    play(&mut s, "bo@x.io", Some((CS2, "CS2")), t(19, 30));
    tick_at(&mut s, t(20, 0));
    assert_eq!(s.lobbies[&drg].status, LobbyStatus::Waiting);
    join_cmd(&mut s, "ana@x.io", drg, t(20, 1));
    let l = &s.lobbies[&drg];
    assert_eq!(l.status, LobbyStatus::Grace);
    assert!(l.grace_locked);
    assert_eq!(l.grace_until, Some(t(20, 6)));
    let out = tick_at(&mut s, t(20, 6));
    assert_eq!(s.lobbies[&drg].status, LobbyStatus::Live);
    let bo = &s.prejoins[&(drg, "bo@x.io".to_string())];
    assert_eq!(bo.drop_reason.as_deref(), Some("elsewhere"));
    assert!(out.feed.iter().any(|f| f.kind == "lobby.split"));
    assert!(
        lobby_of(&s, "bo@x.io").is_some_and(|l| l != drg),
        "still in CS2"
    );
}

#[test]
fn joining_early_starts_the_grace_at_the_planned_start() {
    let mut s = checked_in(&["ana@x.io"]);
    let drg = planned(&mut s, DRG, "DRG", t(20, 0), 120);
    join_cmd(&mut s, "ana@x.io", drg, t(19, 50));
    assert_eq!(s.lobbies[&drg].status, LobbyStatus::Grace);
    assert_eq!(s.lobbies[&drg].grace_until, Some(t(20, 5)));
    assert_eq!(s.lobbies[&drg].actual_start, Some(t(19, 50)));
}

fn waiting_drg(s: &mut LiveState) -> i32 {
    let drg = planned(s, DRG, "DRG", t(20, 0), 120);
    prejoin_cmd(s, "ana@x.io", drg, t(19, 0));
    prejoin_cmd(s, "bo@x.io", drg, t(19, 0));
    tick_at(s, t(20, 0));
    drg
}

fn delay(
    s: &mut LiveState,
    who: &str,
    lobby: i32,
    minutes: i32,
    at: DateTime<Utc>,
) -> Result<Outcome, Reject> {
    apply(
        s,
        cmd(
            gamer(who),
            Command::OpenVote(VoteRequest::Delay { lobby, minutes }),
        ),
        at,
    )
}

#[test]
fn a_delay_vote_holds_the_grace_and_moves_the_start() {
    let mut s = checked_in(&["ana@x.io", "bo@x.io"]);
    let drg = waiting_drg(&mut s);
    delay(&mut s, "ana@x.io", drg, 30, t(20, 2)).expect("opened");
    let l = &s.lobbies[&drg];
    assert_eq!(l.status, LobbyStatus::Delayed);
    assert_eq!(l.hold_remaining_s, Some(180));
    assert_eq!(l.grace_until, None);
    let vote = the_vote(&s);
    assert_eq!(vote.deadline, t(20, 5));
    assert_eq!(
        involved(&s, &vote),
        vec!["ana@x.io".to_string(), "bo@x.io".to_string()]
    );
    let yes = option_named(&s, vote.id, "Delay");
    vote_for(&mut s, "bo@x.io", vote.id, yes, t(20, 3));
    assert_eq!(
        s.votes[&vote.id].settle_at,
        Some(t(20, 3) + Duration::seconds(20))
    );
    tick_at(&mut s, t(20, 3) + Duration::seconds(20));
    assert_eq!(s.votes[&vote.id].resolution.as_deref(), Some("unanimous"));
    let l = &s.lobbies[&drg];
    assert_eq!(l.start, t(20, 30));
    assert_eq!(l.planned_start, Some(t(20, 0)));
    assert_eq!(l.status, LobbyStatus::Confirmed);
    // The same alert comes back at the new start.
    tick_at(&mut s, t(20, 30));
    assert_eq!(s.lobbies[&drg].status, LobbyStatus::Waiting);
}

#[test]
fn a_tied_delay_vote_resumes_the_grace() {
    let mut s = checked_in(&["ana@x.io", "bo@x.io"]);
    let drg = waiting_drg(&mut s);
    delay(&mut s, "ana@x.io", drg, 30, t(20, 2)).expect("opened");
    let vote = the_vote(&s);
    let no = option_named(&s, vote.id, "Keep it");
    vote_for(&mut s, "bo@x.io", vote.id, no, t(20, 3));
    tick_at(&mut s, t(20, 5));
    assert_eq!(s.votes[&vote.id].resolution.as_deref(), Some("deadline"));
    let l = &s.lobbies[&drg];
    assert_eq!(l.status, LobbyStatus::Waiting, "a tie goes to the plan");
    assert_eq!(
        l.grace_until,
        Some(t(20, 8)),
        "with the 3 minutes it had left"
    );
}

#[test]
fn joining_cancels_a_delay_vote() {
    let mut s = checked_in(&["ana@x.io", "bo@x.io"]);
    let drg = waiting_drg(&mut s);
    delay(&mut s, "ana@x.io", drg, 30, t(20, 2)).expect("opened");
    join_cmd(&mut s, "bo@x.io", drg, t(20, 3));
    let vote = the_vote(&s);
    assert_eq!(
        s.votes[&vote.id].status,
        crate::live::model::VoteStatus::Lapsed
    );
    assert_eq!(s.lobbies[&drg].status, LobbyStatus::Grace);
}

fn propose(
    s: &mut LiveState,
    who: &str,
    what: OptionSpec,
    start: DateTime<Utc>,
    mode: ProposalMode,
    at: DateTime<Utc>,
) -> Result<Outcome, Reject> {
    apply(
        s,
        cmd(
            gamer(who),
            Command::Propose(Proposal {
                what,
                start,
                minutes: 90,
                players: no_players(),
                mode,
            }),
        ),
        at,
    )
}

#[test]
fn a_proposal_needs_one_backer_in_five_minutes() {
    let mut s = checked_in(&["ana@x.io", "bo@x.io"]);
    let out = propose(
        &mut s,
        "ana@x.io",
        game(PHAS, "Phasmophobia"),
        t(22, 0),
        ProposalMode::Alongside,
        t(19, 40),
    )
    .expect("proposed");
    let id = *s.lobbies.keys().next().expect("lobby");
    assert_eq!(s.lobbies[&id].status, LobbyStatus::Proposed);
    assert!(out
        .feed
        .iter()
        .any(|f| f.kind == "lobby.proposed" && f.key_kind == Some("proposal")));
    let out = apply(
        &mut s,
        cmd(
            gamer("bo@x.io"),
            Command::Prejoin {
                lobby: LobbyRef::Stored(id),
                team: None,
                random: false,
            },
        ),
        t(19, 42),
    )
    .expect("backed");
    assert_eq!(s.lobbies[&id].status, LobbyStatus::Confirmed);
    assert!(out
        .feed
        .iter()
        .any(|f| f.kind == "lobby.backed" && f.tier == 1));
    tick_at(&mut s, t(19, 50));
    assert!(s.lobbies.contains_key(&id), "backed proposals stay");
}

#[test]
fn an_unbacked_proposal_disappears_silently() {
    let mut s = checked_in(&["ana@x.io"]);
    propose(
        &mut s,
        "ana@x.io",
        game(PHAS, "Phasmophobia"),
        t(22, 0),
        ProposalMode::Alongside,
        t(19, 40),
    )
    .expect("proposed");
    let id = *s.lobbies.keys().next().expect("lobby");
    let out = tick_at(&mut s, t(19, 45));
    assert!(s.lobbies.is_empty());
    assert_eq!(
        out.feed_deletes,
        vec![("proposal", id)],
        "and its feed line goes too"
    );
}

#[test]
fn the_proposer_can_give_a_proposal_more_time() {
    let mut s = checked_in(&["ana@x.io", "bo@x.io"]);
    propose(
        &mut s,
        "ana@x.io",
        game(PHAS, "Phasmophobia"),
        t(22, 0),
        ProposalMode::Alongside,
        t(19, 40),
    )
    .expect("proposed");
    let id = *s.lobbies.keys().next().expect("lobby");
    let more = |s: &mut LiveState, who: &str, at| {
        apply(s, cmd(gamer(who), Command::MoreTime { lobby: id }), at)
    };
    assert!(matches!(
        more(&mut s, "bo@x.io", t(19, 43)),
        Err(Reject::Forbidden(_))
    ));
    more(&mut s, "ana@x.io", t(19, 43)).expect("more time");
    assert_eq!(s.lobbies[&id].grace_until, Some(t(19, 50)));
    tick_at(&mut s, t(19, 47));
    assert_eq!(s.lobbies[&id].status, LobbyStatus::Proposed, "still there");
    // Never more than 30 minutes out.
    for _ in 0..10 {
        more(&mut s, "ana@x.io", t(19, 48)).expect("more time");
    }
    assert_eq!(s.lobbies[&id].grace_until, Some(t(20, 18)));
    tick_at(&mut s, t(20, 18));
    assert!(s.lobbies.is_empty(), "then it lapses as before");
}

#[test]
fn an_empty_lobby_can_stay_open_longer() {
    let mut s = checked_in(&["ana@x.io", "bo@x.io"]);
    play(&mut s, "ana@x.io", Some((CS2, "CS2")), t(19, 0));
    let id = lobby_of(&s, "ana@x.io").expect("lobby");
    play(&mut s, "ana@x.io", None, t(20, 30));
    let left_at = s.lobbies[&id].empty_since.expect("empty since");
    assert!(matches!(
        apply(
            &mut s,
            cmd(gamer("bo@x.io"), Command::MoreTime { lobby: id }),
            left_at + Duration::minutes(1),
        ),
        Err(Reject::Forbidden(_))
    ));
    apply(
        &mut s,
        cmd(gamer("ana@x.io"), Command::MoreTime { lobby: id }),
        left_at + Duration::minutes(4),
    )
    .expect("more time");
    tick_at(&mut s, left_at + Duration::minutes(6));
    assert_eq!(s.lobbies[&id].status, LobbyStatus::Empty, "kept open");
    tick_at(&mut s, left_at + Duration::minutes(10));
    let lobby = &s.lobbies[&id];
    assert_eq!(lobby.status, LobbyStatus::Done);
    assert_eq!(lobby.actual_end, Some(left_at), "still ends when they left");
}

#[test]
fn a_challenge_opens_whats_on_and_unanimity_replaces_the_plan() {
    let mut s = checked_in(&["ana@x.io", "bo@x.io", "cy@x.io"]);
    let drg = planned(&mut s, DRG, "DRG", t(22, 0), 120);
    propose(
        &mut s,
        "ana@x.io",
        game(L4D, "L4D2"),
        t(22, 0),
        ProposalMode::Challenge(LobbyRef::Stored(drg)),
        t(20, 0),
    )
    .expect("challenged");
    let vote = the_vote(&s);
    assert_eq!(vote.kind, crate::live::model::VoteType::Slot);
    assert_eq!(vote.deadline, t(21, 45), "15 minutes before the slot");
    assert_eq!(
        title(&s, &vote),
        "What's on at 22:00?".replace(
            "22:00",
            &t(22, 0)
                .with_timezone(&chrono_tz::Europe::London)
                .format("%H:%M")
                .to_string()
        )
    );
    let l4d = option_named(&s, vote.id, "L4D2");
    vote_for(&mut s, "bo@x.io", vote.id, l4d, t(20, 5));
    assert_eq!(s.votes[&vote.id].settle_at, None, "Cy hasn't voted");
    vote_for(&mut s, "cy@x.io", vote.id, l4d, t(20, 6));
    let settle = s.votes[&vote.id].settle_at.expect("settling");
    // A change of mind inside the window cancels it.
    let plan = option_named(&s, vote.id, "DRG");
    vote_for(
        &mut s,
        "cy@x.io",
        vote.id,
        plan,
        t(20, 6) + Duration::seconds(10),
    );
    assert_eq!(s.votes[&vote.id].settle_at, None);
    vote_for(&mut s, "cy@x.io", vote.id, l4d, t(20, 7));
    tick_at(&mut s, settle + Duration::minutes(2));
    assert_eq!(s.votes[&vote.id].resolution.as_deref(), Some("unanimous"));
    assert_eq!(
        s.lobbies[&drg].status,
        LobbyStatus::Removed,
        "the plan lost"
    );
    let new = s
        .lobbies
        .values()
        .find(|l| l.game_id == Some(L4D))
        .expect("L4D2 lobby");
    assert_eq!(new.start, t(22, 0));
    assert_eq!(new.source, LobbySource::Vote);
    assert_eq!(s.lobby_headcount(new.id), 3, "the voters are pre-joined");
}

#[test]
fn checking_in_mid_vote_makes_you_involved() {
    let mut s = checked_in(&["ana@x.io", "bo@x.io"]);
    let drg = planned(&mut s, DRG, "DRG", t(22, 0), 120);
    propose(
        &mut s,
        "ana@x.io",
        game(L4D, "L4D2"),
        t(22, 0),
        ProposalMode::Challenge(LobbyRef::Stored(drg)),
        t(20, 0),
    )
    .expect("challenged");
    let vote = the_vote(&s);
    apply(
        &mut s,
        cmd(
            gamer("cy@x.io"),
            Command::CheckIn {
                email: "cy@x.io".into(),
            },
        ),
        t(20, 1),
    )
    .expect("in");
    let l4d = option_named(&s, vote.id, "L4D2");
    vote_for(&mut s, "bo@x.io", vote.id, l4d, t(20, 2));
    assert_eq!(s.votes[&vote.id].settle_at, None, "Cy is involved now");
    assert_eq!(involved(&s, &s.votes[&vote.id]).len(), 3);
}

#[test]
fn everyone_happy_to_split_splits_the_party() {
    let mut s = checked_in(&["ana@x.io", "bo@x.io"]);
    let drg = planned(&mut s, DRG, "DRG", t(22, 0), 120);
    propose(
        &mut s,
        "ana@x.io",
        game(L4D, "L4D2"),
        t(22, 0),
        ProposalMode::Challenge(LobbyRef::Stored(drg)),
        t(20, 0),
    )
    .expect("challenged");
    let vote = the_vote(&s);
    let plan = option_named(&s, vote.id, "DRG");
    for (who, option) in [("ana@x.io", None), ("bo@x.io", Some(plan))] {
        apply(
            &mut s,
            cmd(
                gamer(who),
                Command::Ballot {
                    vote: vote.id,
                    option,
                    split_ok: Some(true),
                },
            ),
            t(20, 1),
        )
        .expect("ballot");
    }
    tick_at(&mut s, t(20, 2));
    assert_eq!(
        s.votes[&vote.id].resolution.as_deref(),
        Some("everyone_split")
    );
    assert_ne!(
        s.lobbies[&drg].status,
        LobbyStatus::Removed,
        "DRG had a voter"
    );
    assert!(s.prejoins[&(drg, "bo@x.io".to_string())].is_active());
    let l4d = s
        .lobbies
        .values()
        .find(|l| l.game_id == Some(L4D))
        .expect("L4D2");
    assert_eq!(l4d.source, LobbySource::Split);
    assert!(s.prejoins[&(l4d.id, "ana@x.io".to_string())].is_active());
}

#[test]
fn at_the_deadline_the_plurality_wins_and_ties_go_to_the_plan() {
    let mut s = checked_in(&["ana@x.io", "bo@x.io", "cy@x.io"]);
    let drg = planned(&mut s, DRG, "DRG", t(22, 0), 120);
    propose(
        &mut s,
        "ana@x.io",
        game(L4D, "L4D2"),
        t(22, 0),
        ProposalMode::Challenge(LobbyRef::Stored(drg)),
        t(20, 0),
    )
    .expect("challenged");
    let vote = the_vote(&s);
    let plan = option_named(&s, vote.id, "DRG");
    vote_for(&mut s, "bo@x.io", vote.id, plan, t(20, 1));
    tick_at(&mut s, t(21, 45));
    assert_eq!(s.votes[&vote.id].resolution.as_deref(), Some("deadline"));
    assert_eq!(
        s.votes[&vote.id].winner_option_id,
        Some(plan),
        "1-1: the plan"
    );
    assert_ne!(s.lobbies[&drg].status, LobbyStatus::Removed);
}

#[test]
fn admins_can_force_or_veto() {
    let mut s = checked_in(&["ana@x.io", "bo@x.io"]);
    let drg = planned(&mut s, DRG, "DRG", t(22, 0), 120);
    propose(
        &mut s,
        "ana@x.io",
        game(L4D, "L4D2"),
        t(22, 0),
        ProposalMode::Challenge(LobbyRef::Stored(drg)),
        t(20, 0),
    )
    .expect("challenged");
    let vote = the_vote(&s);
    let l4d = option_named(&s, vote.id, "L4D2");
    let refused = apply(
        &mut s,
        cmd(
            gamer("bo@x.io"),
            Command::ResolveVote {
                vote: vote.id,
                how: Resolve::Force(l4d),
            },
        ),
        t(20, 1),
    );
    assert!(matches!(refused, Err(Reject::Forbidden(_))));
    let out = apply(
        &mut s,
        cmd(
            admin(),
            Command::ResolveVote {
                vote: vote.id,
                how: Resolve::Force(l4d),
            },
        ),
        t(20, 1),
    )
    .expect("forced");
    assert_eq!(s.votes[&vote.id].resolution.as_deref(), Some("admin_pick"));
    assert!(out.feed.iter().any(|f| f.tier == 1));
    let again = apply(
        &mut s,
        cmd(
            admin(),
            Command::ResolveVote {
                vote: vote.id,
                how: Resolve::Veto,
            },
        ),
        t(20, 2),
    );
    assert!(matches!(again, Err(Reject::Conflict(_))), "already final");
}

#[test]
fn keep_playing_joins_an_open_slot_vote_instead_of_a_second_card() {
    let mut s = checked_in(&["ana@x.io", "bo@x.io"]);
    play(&mut s, "ana@x.io", Some((CS2, "CS2")), t(19, 0));
    let cs2 = lobby_of(&s, "ana@x.io").expect("cs2");
    let drg = planned(&mut s, DRG, "DRG", t(21, 0), 120);
    propose(
        &mut s,
        "bo@x.io",
        game(L4D, "L4D2"),
        t(21, 0),
        ProposalMode::Challenge(LobbyRef::Stored(drg)),
        t(19, 30),
    )
    .expect("challenged");
    let slot = the_vote(&s).id;
    apply(
        &mut s,
        cmd(
            gamer("ana@x.io"),
            Command::OpenVote(VoteRequest::Extend {
                lobby: cs2,
                minutes: 60,
            }),
        ),
        t(20, 0),
    )
    .expect("extend");
    assert_eq!(s.votes.len(), 1, "no second vote");
    let keep = s
        .options
        .values()
        .find(|o| o.vote_id == slot && o.lobby_id == Some(cs2))
        .expect("keep playing option");
    assert!(keep.name.starts_with("Keep playing"));
}

#[test]
fn rsvp_no_drops_pre_joins_and_delay_arrival_clears_the_block() {
    let mut s = checked_in(&["ana@x.io"]);
    let drg = planned(&mut s, DRG, "DRG", t(22, 0), 120);
    prejoin_cmd(&mut s, "bo@x.io", drg, t(19, 0));
    apply(
        &mut s,
        cmd(
            admin(),
            Command::RsvpNo {
                email: "bo@x.io".into(),
            },
        ),
        t(19, 5),
    )
    .expect("rsvp no");
    assert_eq!(s.people["bo@x.io"].rsvp, Some(Rsvp::No));
    assert!(!s.prejoins[&(drg, "bo@x.io".to_string())].is_active());
    apply(
        &mut s,
        cmd(
            admin(),
            Command::DelayArrival {
                email: "cy@x.io".into(),
            },
        ),
        t(19, 5),
    )
    .expect("delayed");
    assert_eq!(s.people["cy@x.io"].attendance[0], 0, "Fri 18:00 block");
    assert_eq!(s.people["cy@x.io"].attendance[1], 1);
    let out = apply(
        &mut s,
        cmd(
            admin(),
            Command::Nudge {
                email: "cy@x.io".into(),
            },
        ),
        t(19, 5),
    )
    .expect("nudge");
    assert_eq!(out.personal.len(), 1);
}

#[test]
fn kick_off_early_moves_the_first_lobby() {
    let mut s = state();
    let drg = planned(&mut s, DRG, "DRG", t(19, 0), 120);
    apply(
        &mut s,
        cmd(
            gamer("ana@x.io"),
            Command::OpenVote(VoteRequest::Kickoff {
                lobby: drg,
                new_start: t(18, 0),
            }),
        ),
        t(12, 0),
    )
    .expect("kickoff");
    let vote = the_vote(&s);
    assert_eq!(involved(&s, &vote).len(), 3, "everyone attending the start");
    let yes = option_named(&s, vote.id, "Kick off");
    for who in ["bo@x.io", "cy@x.io"] {
        vote_for(&mut s, who, vote.id, yes, t(12, 1));
    }
    tick_at(&mut s, t(12, 2));
    assert_eq!(s.lobbies[&drg].start, t(18, 0));
}
