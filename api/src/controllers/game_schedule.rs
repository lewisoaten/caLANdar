use chrono::{DateTime, Datelike, Utc};
use sqlx::PgPool;
use std::collections::HashMap;

use crate::{
    controllers::{ensure_user_invited, Error},
    repositories::{event, game_schedule, game_suggestion, invitation},
    routes::game_schedule::{GameScheduleEntry, GameScheduleRequest},
    scheduler::{self, Game, OccupiedSlot, SchedulerInput, Voter},
};

/// Helper function to format date with ordinal suffix (1st, 2nd, 3rd, 4th, etc.)
fn format_date_with_ordinal(dt: DateTime<Utc>) -> String {
    let day = dt.day();
    let suffix = match day {
        1 | 21 | 31 => "st",
        2 | 22 => "nd",
        3 | 23 => "rd",
        _ => "th",
    };
    format!("{}{} {}", day, suffix, dt.format("%b"))
}

impl From<game_schedule::GameSchedule> for GameScheduleEntry {
    fn from(schedule: game_schedule::GameSchedule) -> Self {
        Self {
            id: schedule.id,
            event_id: schedule.event_id,
            game_id: schedule.game_id,
            game_name: schedule.game_name,
            start_time: schedule.start_time,
            duration_minutes: schedule.duration_minutes,
            is_pinned: schedule.is_pinned,
            is_suggested: false,
            created_at: schedule.created_at,
            last_modified: schedule.last_modified,
        }
    }
}

/// Get all scheduled games for an event (pinned + suggested)
pub async fn get_all(
    pool: &PgPool,
    event_id: i32,
    email: &str,
) -> Result<Vec<GameScheduleEntry>, Error> {
    // Ensure user is invited to the event
    ensure_user_invited(pool, event_id, email).await?;

    // Get pinned games from database
    let pinned_games = game_schedule::filter(
        pool,
        game_schedule::Filter {
            event_id: Some(event_id),
            is_pinned: Some(true),
        },
    )
    .await
    .map_err(|e| Error::Controller(format!("Unable to get pinned games due to: {e}")))?;

    // Get suggested games from scheduling algorithm
    let suggested_games = schedule_suggested_games(pool, event_id).await?;

    // Combine pinned and suggested games
    let mut all_games: Vec<GameScheduleEntry> = pinned_games
        .into_iter()
        .map(GameScheduleEntry::from)
        .collect();

    all_games.extend(suggested_games);

    Ok(all_games)
}

/// Create a new scheduled game (admin only)
pub async fn create(
    pool: &PgPool,
    event_id: i32,
    request: GameScheduleRequest,
    _email: &str,
) -> Result<GameScheduleEntry, Error> {
    let schedule = game_schedule::create(
        pool,
        event_id,
        request.game_id,
        request.start_time,
        request.duration_minutes,
        true, // Always pinned when manually created
    )
    .await
    .map_err(|e| Error::Controller(format!("Unable to create game schedule due to: {e}")))?;

    Ok(GameScheduleEntry::from(schedule))
}

/// Update an existing scheduled game (admin only)
pub async fn update(
    pool: &PgPool,
    schedule_id: i32,
    request: GameScheduleRequest,
    _email: &str,
) -> Result<GameScheduleEntry, Error> {
    let schedule = game_schedule::update(
        pool,
        schedule_id,
        request.start_time,
        request.duration_minutes,
    )
    .await
    .map_err(|e| Error::Controller(format!("Unable to update game schedule due to: {e}")))?;

    Ok(GameScheduleEntry::from(schedule))
}

/// Delete a scheduled game (admin only)
pub async fn delete(pool: &PgPool, schedule_id: i32, _email: &str) -> Result<(), Error> {
    game_schedule::delete(pool, schedule_id)
        .await
        .map_err(|e| Error::Controller(format!("Unable to delete game schedule due to: {e}")))?;

    Ok(())
}

/// Pin a suggested game to the schedule (admin only)
pub async fn pin(
    pool: &PgPool,
    event_id: i32,
    request: GameScheduleRequest,
    email: &str,
) -> Result<GameScheduleEntry, Error> {
    // Same as create - converts suggested game to pinned
    create(pool, event_id, request, email).await
}

/// Schedule games using the scheduling algorithm
#[allow(clippy::too_many_lines)]
pub async fn schedule_suggested_games(
    pool: &PgPool,
    event_id: i32,
) -> Result<Vec<GameScheduleEntry>, Error> {
    // Get event details
    let events = event::filter(
        pool,
        event::Filter {
            ids: Some(vec![event_id]),
        },
    )
    .await
    .map_err(|e| Error::Controller(format!("Unable to get event due to: {e}")))?;

    let event = events
        .into_iter()
        .next()
        .ok_or_else(|| Error::Controller("Event not found".to_string()))?;

    let event_start = event.time_begin;
    let event_end = event.time_end;

    // Get all games for this event with votes
    let games_with_votes = game_suggestion::get_games_with_votes(pool, event_id)
        .await
        .map_err(|e| Error::Controller(format!("Unable to get games due to: {e}")))?;

    // Get pinned games to exclude from scheduling and use as occupied slots
    let pinned_games = game_schedule::filter(
        pool,
        game_schedule::Filter {
            event_id: Some(event_id),
            is_pinned: Some(true),
        },
    )
    .await
    .map_err(|e| Error::Controller(format!("Unable to get pinned games due to: {e}")))?;

    // Create a HashSet of pinned game IDs for filtering
    let pinned_game_ids: std::collections::HashSet<i64> =
        pinned_games.iter().map(|g| g.game_id).collect();

    // Filter out pinned games from the games to schedule
    let games_to_schedule: Vec<_> = games_with_votes
        .into_iter()
        .filter(|g| !pinned_game_ids.contains(&g.game_id))
        .collect();

    if games_to_schedule.is_empty() {
        return Ok(Vec::new());
    }

    // Get voters and their availability for each game
    let mut voters_map: HashMap<String, Voter> = HashMap::new();
    let mut games: Vec<Game> = Vec::new();

    for game_record in games_to_schedule {
        // Get voters for this game with their attendance
        let voters = invitation::get_voters_for_game(pool, event_id, game_record.game_id)
            .await
            .map_err(|e| Error::Controller(format!("Unable to get voters due to: {e}")))?;

        let mut voter_ids = Vec::new();

        for voter_record in voters {
            voter_ids.push(voter_record.email.clone());

            // Add voter to map if not already present
            if !voters_map.contains_key(&voter_record.email) {
                if let Some(attendance_bytes) = voter_record.attendance {
                    voters_map.insert(
                        voter_record.email.clone(),
                        Voter {
                            id: voter_record.email,
                            attendance: attendance_bytes,
                        },
                    );
                }
            }
        }

        games.push(Game {
            id: game_record.game_id,
            name: game_record.game_name,
            votes: game_record.vote_count.unwrap_or(0),
            voter_ids,
        });
    }

    // Convert pinned games to occupied slots
    let pinned_slots: Vec<OccupiedSlot> = pinned_games
        .iter()
        .map(|schedule| OccupiedSlot {
            start_time: schedule.start_time,
            duration_minutes: schedule.duration_minutes,
        })
        .collect();

    // Call the scheduler
    let scheduler_input = SchedulerInput {
        games,
        voters: voters_map,
        event_start,
        event_end,
        pinned_slots,
        default_game_duration: 120, // 2 hours default
    };

    let scheduler_output = scheduler::schedule_games(&scheduler_input);

    // Convert scheduler output to GameScheduleEntry
    let suggested_entries: Vec<GameScheduleEntry> = scheduler_output
        .suggested_schedules
        .into_iter()
        .map(|schedule| GameScheduleEntry {
            id: 0, // Suggested games don't have IDs yet
            event_id,
            game_id: schedule.game_id,
            game_name: schedule.game_name,
            start_time: schedule.start_time,
            duration_minutes: schedule.duration_minutes,
            is_pinned: false,
            is_suggested: true,
            created_at: Utc::now(),
            last_modified: Utc::now(),
        })
        .collect();

    // Log suggested schedule
    log::info!(
        "Scheduling algorithm suggested {} games for event '{}' ({})",
        suggested_entries.len(),
        event.title,
        event_id
    );

    for (i, entry) in suggested_entries.iter().enumerate() {
        let day_str = format_date_with_ordinal(entry.start_time);
        log::info!(
            "  {}. {} - {} at {}",
            i + 1,
            entry.game_name,
            day_str,
            entry.start_time.format("%I:%M%p")
        );
    }

    Ok(suggested_entries)
}
