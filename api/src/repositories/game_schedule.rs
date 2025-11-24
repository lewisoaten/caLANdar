use chrono::{DateTime, Utc};
use sqlx::PgPool;

#[derive(Clone)]
pub struct GameSchedule {
    pub id: i32,
    pub event_id: i32,
    pub game_id: i64,
    pub game_name: String,
    pub start_time: DateTime<Utc>,
    pub duration_minutes: i32,
    pub is_pinned: bool,
    pub created_at: DateTime<Utc>,
    pub last_modified: DateTime<Utc>,
}

pub struct Filter {
    pub event_id: Option<i32>,
    pub is_pinned: Option<bool>,
}

/// Get all scheduled games for an event with game details
pub async fn filter(pool: &PgPool, filter: Filter) -> Result<Vec<GameSchedule>, sqlx::Error> {
    let event_id = filter
        .event_id
        .map_or((0, true), |event_id| (event_id, false));

    let is_pinned = filter
        .is_pinned
        .map_or((false, true), |is_pinned| (is_pinned, false));

    sqlx::query_as!(
        GameSchedule,
        r#"
        SELECT
            egs.id,
            egs.event_id,
            egs.game_id,
            sg.name AS game_name,
            egs.start_time,
            egs.duration_minutes,
            egs.is_pinned,
            egs.created_at,
            egs.last_modified
        FROM event_game_schedule egs
        INNER JOIN steam_game sg ON egs.game_id = sg.appid
        WHERE (egs.event_id = $1 OR $2)
        AND (egs.is_pinned = $3 OR $4)
        ORDER BY egs.start_time ASC
        "#,
        event_id.0,
        event_id.1,
        is_pinned.0,
        is_pinned.1,
    )
    .fetch_all(pool)
    .await
}

/// Get a specific scheduled game by ID
#[allow(dead_code)]
pub async fn get(pool: &PgPool, schedule_id: i32) -> Result<Option<GameSchedule>, sqlx::Error> {
    sqlx::query_as!(
        GameSchedule,
        r#"
        SELECT
            egs.id,
            egs.event_id,
            egs.game_id,
            sg.name AS game_name,
            egs.start_time,
            egs.duration_minutes,
            egs.is_pinned,
            egs.created_at,
            egs.last_modified
        FROM event_game_schedule egs
        INNER JOIN steam_game sg ON egs.game_id = sg.appid
        WHERE egs.id = $1
        "#,
        schedule_id
    )
    .fetch_optional(pool)
    .await
}

/// Create a new scheduled game
pub async fn create(
    pool: &PgPool,
    event_id: i32,
    game_id: i64,
    start_time: DateTime<Utc>,
    duration_minutes: i32,
    is_pinned: bool,
) -> Result<GameSchedule, sqlx::Error> {
    sqlx::query_as!(
        GameSchedule,
        r#"
        WITH inserted AS (
            INSERT INTO event_game_schedule (
                event_id,
                game_id,
                start_time,
                duration_minutes,
                is_pinned
            )
            VALUES ($1, $2, $3, $4, $5)
            RETURNING
                id,
                event_id,
                game_id,
                start_time,
                duration_minutes,
                is_pinned,
                created_at,
                last_modified
        )
        SELECT
            inserted.id,
            inserted.event_id,
            inserted.game_id,
            sg.name AS game_name,
            inserted.start_time,
            inserted.duration_minutes,
            inserted.is_pinned,
            inserted.created_at,
            inserted.last_modified
        FROM inserted
        INNER JOIN steam_game sg ON inserted.game_id = sg.appid
        "#,
        event_id,
        game_id,
        start_time,
        duration_minutes,
        is_pinned
    )
    .fetch_one(pool)
    .await
}

/// Update a scheduled game's time and duration
pub async fn update(
    pool: &PgPool,
    schedule_id: i32,
    start_time: DateTime<Utc>,
    duration_minutes: i32,
) -> Result<GameSchedule, sqlx::Error> {
    sqlx::query_as!(
        GameSchedule,
        r#"
        WITH updated AS (
            UPDATE event_game_schedule
            SET
                start_time = $2,
                duration_minutes = $3,
                last_modified = NOW()
            WHERE id = $1
            RETURNING
                id,
                event_id,
                game_id,
                start_time,
                duration_minutes,
                is_pinned,
                created_at,
                last_modified
        )
        SELECT
            updated.id,
            updated.event_id,
            updated.game_id,
            sg.name AS game_name,
            updated.start_time,
            updated.duration_minutes,
            updated.is_pinned,
            updated.created_at,
            updated.last_modified
        FROM updated
        INNER JOIN steam_game sg ON updated.game_id = sg.appid
        "#,
        schedule_id,
        start_time,
        duration_minutes
    )
    .fetch_one(pool)
    .await
}

/// Delete a scheduled game
pub async fn delete(pool: &PgPool, schedule_id: i32) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"
        DELETE FROM event_game_schedule
        WHERE id = $1
        "#,
        schedule_id
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// Check if a time slot overlaps with existing pinned games for an event
/// Returns true if there IS an overlap (slot is not available)
#[allow(dead_code)]
pub async fn has_overlap(
    pool: &PgPool,
    event_id: i32,
    start_time: DateTime<Utc>,
    duration_minutes: i32,
    exclude_schedule_id: Option<i32>,
) -> Result<bool, sqlx::Error> {
    let end_time = start_time + chrono::Duration::minutes(i64::from(duration_minutes));
    let exclude_id = exclude_schedule_id.unwrap_or(-1);

    let result = sqlx::query!(
        r#"
        SELECT EXISTS(
            SELECT 1
            FROM event_game_schedule
            WHERE event_id = $1
            AND is_pinned = true
            AND id != $2
            AND (
                -- New game starts during existing game
                (start_time <= $3 AND (start_time + (duration_minutes || ' minutes')::INTERVAL) > $3)
                -- New game ends during existing game
                OR (start_time < $4 AND (start_time + (duration_minutes || ' minutes')::INTERVAL) >= $4)
                -- New game completely contains existing game
                OR (start_time >= $3 AND (start_time + (duration_minutes || ' minutes')::INTERVAL) <= $4)
            )
        ) AS "exists!"
        "#,
        event_id,
        exclude_id,
        start_time,
        end_time,
    )
    .fetch_one(pool)
    .await?;

    Ok(result.exists)
}
