use chrono::{DateTime, Duration, Timelike, Utc};
use sqlx::PgPool;
use std::collections::HashMap;

use crate::{
    controllers::{ensure_user_invited, Error},
    repositories::game_schedule,
    routes::game_schedule::{GameScheduleEntry, GameScheduleRequest},
};

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
            is_suggested: false, // Will be set to true by algorithm in Slice 3
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
    let pinned_games: Vec<GameScheduleEntry> = match game_schedule::filter(
        pool,
        game_schedule::Filter {
            event_id: Some(event_id),
            is_pinned: Some(true),
        },
    )
    .await
    {
        Ok(schedules) => schedules.into_iter().map(GameScheduleEntry::from).collect(),
        Err(e) => {
            return Err(Error::Controller(format!(
                "Unable to get game schedule due to: {e}"
            )))
        }
    };

    // Get suggested games from scheduling algorithm
    let suggested_games = match schedule_suggested_games(pool, event_id).await {
        Ok(suggestions) => suggestions,
        Err(e) => {
            // Log the error but don't fail the whole request
            eprintln!("Warning: Failed to generate suggested games: {e}");
            Vec::new()
        }
    };

    // Combine pinned and suggested games
    let mut all_games = pinned_games;
    all_games.extend(suggested_games);

    Ok(all_games)
}

/// Create a new scheduled game
pub async fn create(
    pool: &PgPool,
    event_id: i32,
    request: GameScheduleRequest,
    email: &str,
) -> Result<GameScheduleEntry, Error> {
    // Note: Admin permission check is handled by AdminUser in routes layer

    // Validate no overlap with existing pinned games
    if game_schedule::has_overlap(
        pool,
        event_id,
        request.start_time,
        request.duration_minutes,
        None, // No existing schedule_id for new entry
    )
    .await
    .map_err(|e| Error::Controller(format!("Unable to check for overlaps due to: {e}")))?
    {
        return Err(Error::Controller(
            "Cannot create game schedule: overlaps with existing pinned game".to_string(),
        ));
    }

    // Create the schedule entry
    let schedule = game_schedule::create(
        pool,
        event_id,
        request.game_id,
        request.start_time,
        request.duration_minutes,
        true, // is_pinned = true for manually created games
    )
    .await
    .map_err(|e| Error::Controller(format!("Unable to create game schedule due to: {e}")))?;

    // Audit log
    crate::util::log_audit(
        pool,
        Some(email.to_string()),
        "game_schedule.create".to_string(),
        "game_schedule".to_string(),
        Some(event_id.to_string()),
        Some(rocket::serde::json::serde_json::json!({
            "schedule_id": schedule.id,
            "game_id": schedule.game_id,
            "game_name": schedule.game_name,
            "start_time": schedule.start_time,
            "duration_minutes": schedule.duration_minutes,
        })),
    )
    .await;

    Ok(GameScheduleEntry::from(schedule))
}

/// Update an existing scheduled game
pub async fn update(
    pool: &PgPool,
    schedule_id: i32,
    request: GameScheduleRequest,
    email: &str,
) -> Result<GameScheduleEntry, Error> {
    // Note: Admin permission check is handled by AdminUser in routes layer

    // Get the existing schedule to find event_id
    let existing = game_schedule::get(pool, schedule_id)
        .await
        .map_err(|e| Error::Controller(format!("Unable to get existing schedule due to: {e}")))?
        .ok_or_else(|| Error::Controller("Schedule entry not found".to_string()))?;

    // Validate no overlap with other pinned games (excluding this one)
    if game_schedule::has_overlap(
        pool,
        existing.event_id,
        request.start_time,
        request.duration_minutes,
        Some(schedule_id), // Exclude this schedule from overlap check
    )
    .await
    .map_err(|e| Error::Controller(format!("Unable to check for overlaps due to: {e}")))?
    {
        return Err(Error::Controller(
            "Cannot update game schedule: new time overlaps with existing pinned game".to_string(),
        ));
    }

    // Update the schedule entry
    let schedule = game_schedule::update(
        pool,
        schedule_id,
        request.start_time,
        request.duration_minutes,
    )
    .await
    .map_err(|e| Error::Controller(format!("Unable to update game schedule due to: {e}")))?;

    // Audit log
    crate::util::log_audit(
        pool,
        Some(email.to_string()),
        "game_schedule.update".to_string(),
        "game_schedule".to_string(),
        Some(existing.event_id.to_string()),
        Some(rocket::serde::json::serde_json::json!({
            "schedule_id": schedule.id,
            "game_id": schedule.game_id,
            "game_name": schedule.game_name,
            "start_time": schedule.start_time,
            "duration_minutes": schedule.duration_minutes,
            "previous_start_time": existing.start_time,
            "previous_duration_minutes": existing.duration_minutes,
        })),
    )
    .await;

    Ok(GameScheduleEntry::from(schedule))
}

/// Delete a scheduled game
pub async fn delete(pool: &PgPool, schedule_id: i32, email: &str) -> Result<(), Error> {
    // Note: Admin permission check is handled by AdminUser in routes layer

    // Get the existing schedule for audit log before deletion
    let existing = game_schedule::get(pool, schedule_id)
        .await
        .map_err(|e| Error::Controller(format!("Unable to get existing schedule due to: {e}")))?
        .ok_or_else(|| Error::Controller("Schedule entry not found".to_string()))?;

    // Delete the schedule entry
    game_schedule::delete(pool, schedule_id)
        .await
        .map_err(|e| Error::Controller(format!("Unable to delete game schedule due to: {e}")))?;

    // Audit log
    crate::util::log_audit(
        pool,
        Some(email.to_string()),
        "game_schedule.delete".to_string(),
        "game_schedule".to_string(),
        Some(existing.event_id.to_string()),
        Some(rocket::serde::json::serde_json::json!({
            "schedule_id": existing.id,
            "game_id": existing.game_id,
            "game_name": existing.game_name,
            "start_time": existing.start_time,
            "duration_minutes": existing.duration_minutes,
        })),
    )
    .await;

    Ok(())
}

// ============================================================================
// Slice 3: Scheduling Algorithm for Suggested Games
// ============================================================================

#[derive(Debug, Clone)]
struct TimeSlot {
    start_time: DateTime<Utc>,
    duration_minutes: i32,
}

/// Build a list of available time slots within the event period,
/// excluding time ranges occupied by pinned games.
/// Each slot is 30 minutes by default, but games can span multiple slots.
async fn build_available_time_slots(
    pool: &PgPool,
    event_id: i32,
    event_start: DateTime<Utc>,
    event_end: DateTime<Utc>,
) -> Result<Vec<TimeSlot>, Error> {
    // Get all pinned games for this event
    let pinned_games = game_schedule::filter(
        pool,
        game_schedule::Filter {
            event_id: Some(event_id),
            is_pinned: Some(true),
        },
    )
    .await
    .map_err(|e| Error::Controller(format!("Unable to get pinned games due to: {e}")))?;

    // Build a list of all 30-minute slots in the event period
    let slot_duration = 30; // minutes
    let mut slots = Vec::new();
    let mut current = event_start;

    while current < event_end {
        // Calculate duration for this slot (might be less than 30 min at the end)
        let next = current + Duration::minutes(slot_duration);
        let actual_duration = if next > event_end {
            (event_end - current).num_minutes() as i32
        } else {
            slot_duration as i32
        };

        if actual_duration > 0 {
            slots.push(TimeSlot {
                start_time: current,
                duration_minutes: actual_duration,
            });
        }

        current = next;
    }

    // Filter out slots that overlap with pinned games
    let available_slots: Vec<TimeSlot> = slots
        .into_iter()
        .filter(|slot| {
            let slot_end = slot.start_time + Duration::minutes(i64::from(slot.duration_minutes));

            // Check if this slot overlaps with any pinned game
            !pinned_games.iter().any(|game| {
                let game_end =
                    game.start_time + Duration::minutes(i64::from(game.duration_minutes));
                // Overlap check: slot starts before game ends AND slot ends after game starts
                slot.start_time < game_end && slot_end > game.start_time
            })
        })
        .collect();

    Ok(available_slots)
}

/// Calculate how many people who voted for a specific game are available during a time slot
/// by checking the attendance byte arrays in the invitation table.
async fn calculate_availability_score(
    pool: &PgPool,
    event_id: i32,
    game_id: i64,
    event_start: DateTime<Utc>,
    slot_start: DateTime<Utc>,
    slot_duration_minutes: i32,
) -> Result<i32, Error> {
    // Get all invitations with attendance data for people who voted YES for this game
    // Include both "yes" and "maybe" responses - if they have attendance data, they're coming!
    let invitations = sqlx::query!(
        r#"
        SELECT i.email, i.attendance
        FROM invitation i
        INNER JOIN event_game_vote v ON i.event_id = v.event_id AND i.email = v.email
        WHERE i.event_id = $1
            AND i.response IN ('yes', 'maybe')
            AND i.attendance IS NOT NULL
            AND v.game_id = $2
            AND v.vote = 'yes'
        "#,
        event_id,
        game_id
    )
    .fetch_all(pool)
    .await
    .map_err(|e| Error::Controller(format!("Unable to get voter invitations due to: {e}")))?;

    if invitations.is_empty() {
        return Ok(0);
    }

    // Calculate which bucket indices this slot covers
    // Attendance buckets are 6-hour blocks: 6am-12pm, 12pm-6pm, 6pm-12am, 12am-6am
    // They are indexed from midnight of the event start date
    const BUCKET_DURATION_MINUTES: i64 = 360; // 6 hours

    // Find midnight on the event start date (this is where bucket indexing begins)
    let event_date = event_start.date_naive();
    let first_midnight = event_date
        .and_hms_opt(0, 0, 0)
        .expect("Valid time")
        .and_utc();

    // Each day has 4 buckets starting at: midnight+6h, midnight+12h, midnight+18h, midnight+24h
    // Which correspond to periods: 6am-12pm (bucket 0), 12pm-6pm (bucket 1), 6pm-12am (bucket 2), 12am-6am (bucket 3)
    // Calculate which bucket(s) this slot falls into
    let minutes_from_midnight = (slot_start - first_midnight).num_minutes();

    // Adjust for the fact that bucket 0 starts at 6am (360 minutes after midnight)
    // So we need to offset by -360 minutes, then divide by 360
    let adjusted_minutes = minutes_from_midnight - 360;
    let start_bucket = if adjusted_minutes >= 0 {
        (adjusted_minutes / BUCKET_DURATION_MINUTES) as usize
    } else {
        // Slot is before first bucket (before 6am on day 0), no buckets match
        0 // Will fail the range check below
    };

    let slot_end_minutes = minutes_from_midnight + i64::from(slot_duration_minutes);
    let adjusted_end_minutes = slot_end_minutes - 360;
    let end_bucket = if adjusted_end_minutes >= 0 {
        ((adjusted_end_minutes + BUCKET_DURATION_MINUTES - 1) / BUCKET_DURATION_MINUTES) as usize
    } else {
        0
    };

    // Log bucket calculation for debugging (only once per function call)
    // Calculate which bucket the event starts in (this is the offset for the attendance array)
    // The attendance array only contains buckets that fall within the event time range,
    // so we need to offset bucket indices by the number of buckets before the event start
    let event_start_minutes_from_midnight = (event_start - first_midnight).num_minutes();
    let event_start_adjusted = event_start_minutes_from_midnight - 360;
    let first_valid_bucket = if event_start_adjusted >= 0 {
        (event_start_adjusted / BUCKET_DURATION_MINUTES) as usize
    } else {
        0
    };

    log::debug!(
        "Game {} slot {}: checking buckets {} to {} (slot duration {} mins, minutes_from_midnight: {}, adjusted: {}, first_valid_bucket: {})",
        game_id,
        slot_start.to_rfc3339(),
        start_bucket,
        end_bucket,
        slot_duration_minutes,
        minutes_from_midnight,
        adjusted_minutes,
        first_valid_bucket
    );

    // Count how many people are available for the entire slot
    let mut available_count = 0;

    for invitation in &invitations {
        if let Some(ref attendance_bytes) = invitation.attendance {
            // Log the attendance data for this voter
            let hex_string: String = attendance_bytes
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect::<Vec<_>>()
                .join(" ");
            log::debug!(
                "Game {} slot {}: voter {} attendance data: {} bytes (hex: {})",
                game_id,
                slot_start.to_rfc3339(),
                invitation.email,
                attendance_bytes.len(),
                hex_string
            );
            // Check if person is available for ALL buckets in this slot
            let mut available_for_slot = true;
            let attendance_vec: &Vec<u8> = attendance_bytes;

            for bucket_index in start_bucket..end_bucket {
                // The attendance array is indexed from the first valid bucket (not from bucket 0)
                // So we need to subtract the offset to get the array index
                let attendance_array_index = bucket_index.saturating_sub(first_valid_bucket);

                if attendance_array_index >= attendance_vec.len() {
                    available_for_slot = false;
                    log::debug!(
                        "Game {} slot {}: voter {} - bucket {} (array index {} after offset {}) out of range (attendance array length: {})",
                        game_id,
                        slot_start.to_rfc3339(),
                        invitation.email,
                        bucket_index,
                        attendance_array_index,
                        first_valid_bucket,
                        attendance_vec.len()
                    );
                    break;
                }

                // Check if the bucket is 1 (attending) or 0 (not attending)
                let is_available = attendance_vec[attendance_array_index] == 1;

                if !is_available {
                    available_for_slot = false;
                    log::debug!(
                        "Game {} slot {}: voter {} - bucket {} (array index {}) is {} (not available)",
                        game_id,
                        slot_start.to_rfc3339(),
                        invitation.email,
                        bucket_index,
                        attendance_array_index,
                        attendance_vec[attendance_array_index]
                    );
                    break;
                }
            }

            if available_for_slot {
                available_count += 1;
            }
        }
    }

    Ok(available_count)
}

/// Check if a time range (start + duration) is fully available (no pinned games overlap)
fn is_time_range_available(
    pinned_games: &[game_schedule::GameSchedule],
    start_time: DateTime<Utc>,
    duration_minutes: i32,
) -> bool {
    let end_time = start_time + Duration::minutes(i64::from(duration_minutes));

    !pinned_games.iter().any(|game| {
        let game_end = game.start_time + Duration::minutes(i64::from(game.duration_minutes));
        // Overlap check
        start_time < game_end && end_time > game.start_time
    })
}

/// Schedule games using a greedy algorithm that maximizes voter availability.
/// Returns a list of suggested game schedule entries.
pub async fn schedule_suggested_games(
    pool: &PgPool,
    event_id: i32,
) -> Result<Vec<GameScheduleEntry>, Error> {
    // Get event details to know the time period
    let event = sqlx::query!(
        r#"
        SELECT time_begin, time_end
        FROM event
        WHERE id = $1
        "#,
        event_id
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| Error::Controller(format!("Unable to get event due to: {e}")))?
    .ok_or_else(|| Error::Controller("Event not found".to_string()))?;

    // Get all game suggestions with their vote counts, sorted by votes descending
    let game_suggestions = sqlx::query!(
        r#"
        SELECT
            event_game.game_id,
            steam_game.name AS game_name,
            COUNT(event_game_vote.vote) FILTER (WHERE event_game_vote.vote = 'yes') AS vote_count
        FROM event_game
        INNER JOIN steam_game ON event_game.game_id = steam_game.appid
        LEFT JOIN event_game_vote ON event_game.event_id = event_game_vote.event_id
            AND event_game.game_id = event_game_vote.game_id
        WHERE event_game.event_id = $1
        GROUP BY event_game.game_id, steam_game.name
        HAVING COUNT(event_game_vote.vote) FILTER (WHERE event_game_vote.vote = 'yes') > 0
        ORDER BY vote_count DESC
        "#,
        event_id
    )
    .fetch_all(pool)
    .await
    .map_err(|e| Error::Controller(format!("Unable to get game suggestions due to: {e}")))?;

    if game_suggestions.is_empty() {
        return Ok(Vec::new());
    }

    // Get pinned games to avoid scheduling conflicts
    let pinned_games = game_schedule::filter(
        pool,
        game_schedule::Filter {
            event_id: Some(event_id),
            is_pinned: Some(true),
        },
    )
    .await
    .map_err(|e| Error::Controller(format!("Unable to get pinned games due to: {e}")))?;

    // Collect game IDs that are already manually scheduled (pinned)
    // We don't want to suggest games that the admin has already manually scheduled
    let pinned_game_ids: std::collections::HashSet<i64> =
        pinned_games.iter().map(|game| game.game_id).collect();

    // Build available time slots
    let available_slots =
        build_available_time_slots(pool, event_id, event.time_begin, event.time_end).await?;

    if available_slots.is_empty() {
        return Ok(Vec::new());
    }

    // Default game duration is 2 hours (120 minutes)
    const DEFAULT_GAME_DURATION: i32 = 120;

    let mut suggested_schedules = Vec::new();
    let mut occupied_slots = HashMap::new();

    let total_game_candidates = game_suggestions.len();

    // For each game (sorted by votes), find the best time slot
    for game in game_suggestions {
        // Skip games that are already manually scheduled (pinned)
        if pinned_game_ids.contains(&game.game_id) {
            log::debug!(
                "Skipping game '{}' (id: {}) - already manually scheduled",
                game.game_name,
                game.game_id
            );
            continue;
        }
        // Get voter count with attendance for debugging
        let voters_with_attendance = sqlx::query!(
            r#"
            SELECT COUNT(*) as count
            FROM invitation i
            INNER JOIN event_game_vote v ON i.event_id = v.event_id AND i.email = v.email
            WHERE i.event_id = $1
                AND i.response IN ('yes', 'maybe')
                AND i.attendance IS NOT NULL
                AND v.game_id = $2
                AND v.vote = 'yes'
            "#,
            event_id,
            game.game_id
        )
        .fetch_one(pool)
        .await
        .map(|r| r.count.unwrap_or(0))
        .unwrap_or(0);

        log::debug!(
            "Evaluating game '{}' (id: {}) with {} votes, {} voters have attendance data",
            game.game_name,
            game.game_id,
            game.vote_count.unwrap_or(0),
            voters_with_attendance
        );

        let mut best_slot: Option<(DateTime<Utc>, i32)> = None;
        let mut best_score = -1;
        let mut slots_evaluated = 0;
        let mut slots_skipped_nighttime = 0;
        let mut slots_skipped_overlap = 0;

        // Try each slot as a potential start time
        for slot in &available_slots {
            slots_evaluated += 1;

            // Skip nighttime slots (1am - 10am) - people are usually sleeping
            let hour = slot.start_time.hour();
            if (1..10).contains(&hour) {
                slots_skipped_nighttime += 1;
                continue;
            }

            // Check if we can fit a game of DEFAULT_GAME_DURATION starting at this slot
            let candidate_end =
                slot.start_time + Duration::minutes(i64::from(DEFAULT_GAME_DURATION));

            // Make sure the game fits within the event
            if candidate_end > event.time_end {
                continue;
            }

            // Check if this time range is available (no pinned games)
            if !is_time_range_available(&pinned_games, slot.start_time, DEFAULT_GAME_DURATION) {
                continue;
            }

            // Check if this time range overlaps with already-suggested games
            let overlaps_with_suggested = occupied_slots.iter().any(|(start, duration)| {
                let occupied_end = *start + Duration::minutes(i64::from(*duration));
                let candidate_start = slot.start_time;
                candidate_start < occupied_end && candidate_end > *start
            });

            if overlaps_with_suggested {
                slots_skipped_overlap += 1;
                continue;
            }

            // Calculate availability score for this slot (only for voters of this game)
            let score = calculate_availability_score(
                pool,
                event_id,
                game.game_id,
                event.time_begin,
                slot.start_time,
                DEFAULT_GAME_DURATION,
            )
            .await?;

            if score > best_score {
                best_score = score;
                best_slot = Some((slot.start_time, DEFAULT_GAME_DURATION));
            }
        }

        log::debug!(
            "Game '{}': evaluated {} slots, skipped {} (nighttime), {} (overlap). Best score: {}, Best slot: {:?}",
            game.game_name,
            slots_evaluated,
            slots_skipped_nighttime,
            slots_skipped_overlap,
            best_score,
            best_slot.as_ref().map(|(t, _)| t.to_rfc3339())
        );

        if best_score == 0 && voters_with_attendance > 0 {
            log::warn!(
                "Game '{}' has {} voter(s) with attendance data but none were available at any valid time slot. Check DEBUG logs for detailed availability checks.",
                game.game_name,
                voters_with_attendance
            );
        }

        // If we found a good slot with at least one voter available, add this game to the suggested schedule
        if let Some((start_time, duration)) = best_slot {
            // Only schedule if at least one voter is available (best_score > 0)
            if best_score > 0 {
                let end_time = start_time + Duration::minutes(i64::from(duration));
                occupied_slots.insert(start_time, duration);

                log::info!(
                    "✓ Scheduling game '{}' (id: {}) at {} to {} ({} minutes) with {} voter(s) available",
                    game.game_name,
                    game.game_id,
                    start_time.to_rfc3339(),
                    end_time.to_rfc3339(),
                    duration,
                    best_score
                );
                log::debug!(
                    "Occupied slots now: {:?}",
                    occupied_slots
                        .iter()
                        .map(|(s, d)| (s.to_rfc3339(), d))
                        .collect::<Vec<_>>()
                );

                suggested_schedules.push(GameScheduleEntry {
                    id: 0, // Suggested games don't have IDs (not persisted)
                    event_id,
                    game_id: game.game_id,
                    game_name: game.game_name,
                    start_time,
                    duration_minutes: duration,
                    is_pinned: false,
                    is_suggested: true,
                    created_at: Utc::now(),
                    last_modified: Utc::now(),
                });
            } else {
                log::warn!(
                    "✗ Skipping game '{}' (id: {}) - no voters available at any time slot (best_score: {})",
                    game.game_name,
                    game.game_id,
                    best_score
                );
            }
        } else {
            log::warn!(
                "✗ Skipping game '{}' (id: {}) - no available time slots",
                game.game_name,
                game.game_id
            );
        }
    }

    log::info!(
        "Scheduling complete: {} games scheduled out of {} candidates",
        suggested_schedules.len(),
        total_game_candidates
    );

    Ok(suggested_schedules)
}
