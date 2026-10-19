//! Engine tests: one scenario per rule, in the spirit of the storyboard
//! frames (F1-F13) of the design handoff.
#![allow(clippy::unwrap_used)]

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

fn checked_in(emails: &[&str]) -> LiveState {
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
fn play(s: &mut LiveState, email: &str, game: Option<(i64, &str)>, at: DateTime<Utc>) -> Outcome {
    poll(s, vec![steam(email, game)], at);
    poll(s, vec![steam(email, game)], at + Duration::seconds(30))
}

fn lobby_of(s: &LiveState, email: &str) -> Option<i32> {
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
    assert_eq!(s.lobbies[&planned_id].status, LobbyStatus::Live);
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
fn food_ignores_steam() {
    let mut s = checked_in(&["ana@x.io"]);
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
    play(&mut s, "ana@x.io", Some((CS2, "CS2")), t(19, 10));
    assert_eq!(lobby_of(&s, "ana@x.io"), Some(id), "still eating");
    apply(&mut s, Input::Tick, t(19, 46)).expect("tick");
    assert_eq!(s.lobbies[&id].status, LobbyStatus::Done);
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
