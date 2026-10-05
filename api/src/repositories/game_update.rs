use chrono::{DateTime, Utc};
use sqlx::PgPool;

#[derive(Clone)]
#[allow(dead_code)]
pub struct SteamGameUpdate {
    pub id: i32,
    pub update_time: DateTime<Utc>,
}

/// A refresh with no result yet is treated as dead after this long (the
/// instance running it was probably shut down), so it can't block forever.
const STALE_AFTER_MINUTES: i32 = 30;

/// Start a refresh unless one is already running. `None` means one is.
pub async fn start(pool: &PgPool) -> Result<Option<SteamGameUpdate>, sqlx::Error> {
    let mut tx = pool.begin().await?;
    // Serialise concurrent starts so two admins can't both pass the check.
    sqlx::query("SELECT pg_advisory_xact_lock(hashtext('steam_game_update'))")
        .execute(&mut *tx)
        .await?;
    let started = sqlx::query_as::<_, (i32, DateTime<Utc>)>(
        r"
        INSERT INTO steam_game_update (update_time)
        SELECT NOW()
        WHERE NOT EXISTS (
            SELECT 1 FROM steam_game_update
            WHERE completed_at IS NULL
              AND error IS NULL
              AND update_time > NOW() - make_interval(mins => $1)
        )
        RETURNING id, update_time
        ",
    )
    .bind(STALE_AFTER_MINUTES)
    .fetch_optional(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(started.map(|(id, update_time)| SteamGameUpdate { id, update_time }))
}

/// Mark a refresh as finished.
pub async fn complete(pool: &PgPool, id: i32, games_added: i64) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE steam_game_update SET completed_at = NOW(), games_added = $2 WHERE id = $1",
    )
    .bind(id)
    .bind(games_added)
    .execute(pool)
    .await?;
    Ok(())
}

/// Mark a refresh as failed. `error` is shown to admins, so keep it safe.
pub async fn fail(pool: &PgPool, id: i32, error: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE steam_game_update SET error = $2 WHERE id = $1")
        .bind(id)
        .bind(error)
        .execute(pool)
        .await?;
    Ok(())
}

#[derive(sqlx::FromRow)]
pub struct Latest {
    pub update_time: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub games_added: Option<i64>,
    pub error: Option<String>,
}

/// The most recent refresh, running, finished or failed.
pub async fn latest(pool: &PgPool) -> Result<Option<Latest>, sqlx::Error> {
    sqlx::query_as::<_, Latest>(
        "SELECT update_time, completed_at, games_added, error \
         FROM steam_game_update ORDER BY id DESC LIMIT 1",
    )
    .fetch_optional(pool)
    .await
}

impl Latest {
    /// Still going: no result yet and not old enough to be presumed dead.
    pub fn is_running(&self) -> bool {
        self.completed_at.is_none()
            && self.error.is_none()
            && Utc::now() - self.update_time < chrono::Duration::minutes(STALE_AFTER_MINUTES.into())
    }
}

#[cfg(test)]
mod tests {
    use super::{Latest, STALE_AFTER_MINUTES};
    use chrono::{Duration, Utc};

    fn latest(age_minutes: i64, completed: bool, error: Option<&str>) -> Latest {
        let update_time = Utc::now() - Duration::minutes(age_minutes);
        Latest {
            update_time,
            completed_at: completed.then_some(update_time),
            games_added: None,
            error: error.map(str::to_string),
        }
    }

    #[test]
    fn running_until_it_is_stale() {
        let stale = i64::from(STALE_AFTER_MINUTES);
        assert!(latest(0, false, None).is_running());
        assert!(latest(stale - 1, false, None).is_running());
        assert!(!latest(stale + 1, false, None).is_running());
    }

    #[test]
    fn finished_or_failed_is_not_running() {
        assert!(!latest(1, true, None).is_running());
        assert!(!latest(1, false, Some("boom")).is_running());
    }
}
