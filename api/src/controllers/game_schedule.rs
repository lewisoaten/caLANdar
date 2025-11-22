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

/// Create a new scheduled game (Slice 2 - will add validation)
#[allow(dead_code)]
pub async fn create(
    pool: &PgPool,
    event_id: i32,
    request: GameScheduleRequest,
    _email: &str,
) -> Result<GameScheduleEntry, Error> {
    // Slice 2 will add:
    // - Admin permission check
    // - Overlap validation
    // - Audit logging

    match game_schedule::create(
        pool,
        event_id,
        request.game_id,
        request.start_time,
        request.duration_minutes,
        true, // is_pinned = true for manually created games
    )
    .await
    {
        Ok(schedule) => Ok(GameScheduleEntry::from(schedule)),
        Err(e) => Err(Error::Controller(format!(
            "Unable to create game schedule due to: {e}"
        ))),
    }
}

/// Update an existing scheduled game (Slice 2 - will add validation)
#[allow(dead_code)]
pub async fn update(
    pool: &PgPool,
    schedule_id: i32,
    request: GameScheduleRequest,
    _email: &str,
) -> Result<GameScheduleEntry, Error> {
    // Slice 2 will add:
    // - Admin permission check
    // - Overlap validation
    // - Audit logging

    match game_schedule::update(
        pool,
        schedule_id,
        request.start_time,
        request.duration_minutes,
    )
    .await
    {
        Ok(schedule) => Ok(GameScheduleEntry::from(schedule)),
        Err(e) => Err(Error::Controller(format!(
            "Unable to update game schedule due to: {e}"
        ))),
    }
}

/// Delete a scheduled game (Slice 2 - will add validation)
#[allow(dead_code)]
pub async fn delete(pool: &PgPool, schedule_id: i32, _email: &str) -> Result<(), Error> {
    // Slice 2 will add:
    // - Admin permission check
    // - Audit logging

    match game_schedule::delete(pool, schedule_id).await {
        Ok(()) => Ok(()),
        Err(e) => Err(Error::Controller(format!(
            "Unable to delete game schedule due to: {e}"
        ))),
    }
}
