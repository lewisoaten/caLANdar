use chrono::{DateTime, Utc};
use sqlx::PgPool;

/// A schedule entry. Writes go through the live engine (`controllers::live`),
/// so the schedule page and Live stay one thing (docs/live-event/DESIGN.md §4.5).
#[derive(Clone)]
pub struct GameSchedule {
    pub id: i32,
    pub event_id: i32,
    /// 0 for food.
    pub game_id: i64,
    /// The game's name, or the food's.
    pub game_name: String,
    pub start_time: DateTime<Utc>,
    pub duration_minutes: i32,
    pub is_pinned: bool,
    pub created_at: DateTime<Utc>,
    pub last_modified: DateTime<Utc>,
    pub kind: String,
    pub status: String,
    pub source: String,
    pub planned_start: Option<DateTime<Utc>>,
    pub planned_minutes: Option<i32>,
    pub actual_start: Option<DateTime<Utc>>,
    pub actual_end: Option<DateTime<Utc>>,
    pub max_players: Option<i32>,
}

pub struct Filter {
    pub event_id: Option<i32>,
    pub is_pinned: Option<bool>,
}

/// Scheduled entries for an event (removed ones left out), with game names.
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
            COALESCE(egs.game_id, 0) AS "game_id!",
            COALESCE(sg.name, egs.food->>'name', '') AS "game_name!",
            egs.start_time,
            egs.duration_minutes,
            egs.is_pinned,
            egs.created_at,
            egs.last_modified,
            egs.kind,
            egs.status,
            egs.source,
            egs.planned_start,
            egs.planned_minutes,
            egs.actual_start,
            egs.actual_end,
            egs.max_players
        FROM event_game_schedule egs
        LEFT JOIN steam_game sg ON egs.game_id = sg.appid
        WHERE (egs.event_id = $1 OR $2)
        AND (egs.is_pinned = $3 OR $4)
        AND egs.status <> 'removed'
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
