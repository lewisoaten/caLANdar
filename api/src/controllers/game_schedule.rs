use sqlx::PgPool;

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

/// Get all scheduled games for an event (pinned only for now, suggested games in Slice 3)
pub async fn get_all(
    pool: &PgPool,
    event_id: i32,
    email: &str,
) -> Result<Vec<GameScheduleEntry>, Error> {
    // Ensure user is invited to the event
    ensure_user_invited(pool, event_id, email).await?;

    // For Slice 1: Only return pinned games
    // Slice 3 will add suggested games from the algorithm
    match game_schedule::filter(
        pool,
        game_schedule::Filter {
            event_id: Some(event_id),
            is_pinned: Some(true), // Only pinned for now
        },
    )
    .await
    {
        Ok(schedules) => Ok(schedules.into_iter().map(GameScheduleEntry::from).collect()),
        Err(e) => Err(Error::Controller(format!(
            "Unable to get game schedule due to: {e}"
        ))),
    }
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
