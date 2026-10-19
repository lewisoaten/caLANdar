//! `calandar-api dev-seed-live`: a local test event for Live.
//!
//! Creates an event that is running right now with gamers, games, votes,
//! seats and a couple of planned sessions, then prints how to sign in as
//! each gamer. Local development only: it refuses to run unless
//! `LIVE_DEV_TOOLS=1`.

#![allow(clippy::too_many_lines, clippy::type_complexity)] // A flat, dev-only script.

use chrono::{Duration, DurationRound, Utc};
use sqlx::PgPool;

/// (email, handle, RSVP, fake Steam id, seat)
const GAMERS: [(&str, &str, Option<&str>, Option<i64>, Option<&str>); 10] = [
    (
        "lewis@oaten.name",
        "Lewis",
        Some("yes"),
        Some(76_561_198_000_000_001),
        Some("A1"),
    ),
    (
        "ana@example.com",
        "ProGamer123",
        Some("yes"),
        Some(76_561_198_000_000_002),
        Some("A2"),
    ),
    (
        "bo@example.com",
        "Bo",
        Some("yes"),
        Some(76_561_198_000_000_003),
        Some("A3"),
    ),
    ("cy@example.com", "Cyx", Some("yes"), None, Some("A4")),
    (
        "dee@example.com",
        "DeeDee",
        Some("yes"),
        Some(76_561_198_000_000_005),
        Some("B1"),
    ),
    ("eli@example.com", "Eli", Some("yes"), None, Some("B2")),
    (
        "fox@example.com",
        "Fox",
        Some("maybe"),
        Some(76_561_198_000_000_007),
        Some("B3"),
    ),
    ("gus@example.com", "Gus", Some("yes"), None, None),
    ("hal@example.com", "Hal", Some("no"), None, None),
    ("ivy@example.com", "Ivy", None, None, None),
];

/// (appid, name)
const GAMES: [(i64, &str); 8] = [
    (730, "Counter-Strike 2"),
    (548_430, "Deep Rock Galactic"),
    (550, "Left 4 Dead 2"),
    (739_630, "Phasmophobia"),
    (381_210, "Dead by Daylight"),
    (427_520, "Factorio"),
    (431_240, "Golf With Friends"),
    (945_360, "Among Us"),
];

pub async fn run(pool: &PgPool) -> Result<(), Box<dyn std::error::Error>> {
    if !crate::controllers::live::dev_tools() {
        return Err("dev-seed-live only runs with LIVE_DEV_TOOLS=1 (local development)".into());
    }
    let now = Utc::now().duration_trunc(Duration::hours(1))?;
    let begin = now - Duration::hours(3);
    let end = now + Duration::hours(45);
    let mut tx = pool.begin().await?;

    let event_id: i32 = sqlx::query_scalar(
        r"
        INSERT INTO event (title, description, time_begin, time_end, discord_invite_url)
        VALUES ($1, $2, $3, $4, 'https://discord.gg/example')
        RETURNING id
        ",
    )
    .bind(format!("Live Test LAN {}", now.format("%a %H:%M")))
    .bind("A local event for trying out caLANdar Live. Doors are open.")
    .bind(begin)
    .bind(end)
    .fetch_one(&mut *tx)
    .await?;

    let buckets = crate::controllers::event_invitation::get_day_quarter_buckets(begin, end);
    let attendance = vec![1u8; buckets.len()];

    let update_id: i32 =
        sqlx::query_scalar("INSERT INTO steam_game_update DEFAULT VALUES RETURNING id")
            .fetch_one(&mut *tx)
            .await?;
    for (appid, name) in GAMES {
        sqlx::query(
            "INSERT INTO steam_game (appid, update_id, name) VALUES ($1, $2, $3) ON CONFLICT (appid) DO NOTHING",
        )
        .bind(appid)
        .bind(update_id)
        .bind(name)
        .execute(&mut *tx)
        .await?;
    }

    sqlx::query(
        "INSERT INTO event_seating_config (event_id, has_seating, allow_unspecified_seat) VALUES ($1, true, true)",
    )
    .bind(event_id)
    .execute(&mut *tx)
    .await?;
    let room_id: i32 = sqlx::query_scalar(
        "INSERT INTO room (event_id, name, sort_order, grid_rows, features) VALUES ($1, 'Main Hall', 0, 5, $2) RETURNING id",
    )
    .bind(event_id)
    .bind(rocket::serde::json::json!([
        { "col": 0, "row": 4, "kind": "entrance", "group": 1 },
        { "col": 1, "row": 4, "kind": "entrance", "group": 1 }
    ]))
    .fetch_one(&mut *tx)
    .await?;
    let mut seat_ids = std::collections::HashMap::new();
    for (row, letter) in [(1, 'A'), (3, 'B')] {
        for n in 1..=6 {
            let label = format!("{letter}{n}");
            let id: i32 = sqlx::query_scalar(
                r"
                INSERT INTO seat (event_id, room_id, label, x, y, grid_col, grid_row)
                VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
                ",
            )
            .bind(event_id)
            .bind(room_id)
            .bind(&label)
            .bind(f64::from(n) / 7.0)
            .bind(f64::from(row) / 5.0)
            .bind(n + 2)
            .bind(row)
            .fetch_one(&mut *tx)
            .await?;
            seat_ids.insert(label, id);
        }
    }

    for (email, handle, rsvp, steam_id, seat) in GAMERS {
        sqlx::query(
            r"
            INSERT INTO invitation (event_id, email, handle, response, attendance, responded_at)
            VALUES ($1, $2, $3, $4::invitation_response, $5, CASE WHEN $4 IS NULL THEN NULL ELSE NOW() END)
            ",
        )
        .bind(event_id)
        .bind(email)
        .bind(handle)
        .bind(rsvp)
        .bind(rsvp.map(|_| attendance.clone()))
        .execute(&mut *tx)
        .await?;
        if let Some(steam_id) = steam_id {
            sqlx::query(
                "INSERT INTO profiles (email, steam_id) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING",
            )
            .bind(email)
            .bind(steam_id)
            .execute(&mut *tx)
            .await?;
        }
        if let Some(seat) = seat {
            sqlx::query(
                r"
                INSERT INTO seat_reservation (event_id, seat_id, invitation_email, attendance_buckets)
                VALUES ($1, $2, $3, $4)
                ",
            )
            .bind(event_id)
            .bind(seat_ids.get(seat).copied())
            .bind(email)
            .bind(&attendance)
            .execute(&mut *tx)
            .await?;
        }
    }

    // Suggestions and votes so the planner has something to plan.
    let votes: [(i64, &[&str]); 5] = [
        (
            548_430,
            &[
                "ana@example.com",
                "bo@example.com",
                "dee@example.com",
                "lewis@oaten.name",
            ],
        ),
        (
            550,
            &[
                "ana@example.com",
                "cy@example.com",
                "eli@example.com",
                "fox@example.com",
            ],
        ),
        (
            739_630,
            &["bo@example.com", "dee@example.com", "eli@example.com"],
        ),
        (427_520, &["lewis@oaten.name", "cy@example.com"]),
        (
            431_240,
            &[
                "ana@example.com",
                "bo@example.com",
                "cy@example.com",
                "dee@example.com",
                "eli@example.com",
            ],
        ),
    ];
    for (game_id, voters) in votes {
        sqlx::query("INSERT INTO event_game (event_id, game_id, user_email) VALUES ($1, $2, $3)")
            .bind(event_id)
            .bind(game_id)
            .bind(voters.first().copied().unwrap_or("lewis@oaten.name"))
            .execute(&mut *tx)
            .await?;
        for voter in voters {
            // The planner only suggests games at least two attendees own.
            sqlx::query(
                r"
                INSERT INTO user_game (email, appid, playtime_forever) VALUES ($1, $2, 600)
                ON CONFLICT (email, appid) DO NOTHING
                ",
            )
            .bind(voter)
            .bind(game_id)
            .execute(&mut *tx)
            .await?;
            sqlx::query(
                "INSERT INTO event_game_vote (event_id, game_id, email, vote) VALUES ($1, $2, $3, 'yes')",
            )
            .bind(event_id)
            .bind(game_id)
            .bind(voter)
            .execute(&mut *tx)
            .await?;
        }
    }

    // Two pinned sessions: one starting now, one later tonight.
    for (game_id, start, minutes) in [(548_430_i64, now, 120), (550, now + Duration::hours(3), 90)]
    {
        sqlx::query(
            r"
            INSERT INTO event_game_schedule (event_id, game_id, start_time, duration_minutes, is_pinned)
            VALUES ($1, $2, $3, $4, true)
            ",
        )
        .bind(event_id)
        .bind(game_id)
        .bind(start)
        .bind(minutes)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;

    println!("Seeded event {event_id}: http://localhost:3000/events/{event_id}/live");
    println!("Sign in as any of these (prints a localStorage snippet):");
    for (email, handle, rsvp, steam, _) in GAMERS {
        println!(
            "  {handle:<12} {email:<20} rsvp={:<6} steam={}  →  calandar-api dev-token {email}",
            rsvp.unwrap_or("none"),
            if steam.is_some() { "yes" } else { "no " },
        );
    }
    Ok(())
}
