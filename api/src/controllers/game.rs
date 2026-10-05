use std::{
    collections::{HashMap, VecDeque},
    fmt::Display,
    sync::{LazyLock, Mutex, PoisonError},
    time::{Duration, Instant},
};

use sqlx::PgPool;

use crate::{
    controllers::Error,
    repositories::{game, game_update, steam_api},
    routes::games::SteamGameResponse,
};

// Implement From for SteamGameResponse from Game
impl From<crate::repositories::game::Game> for SteamGameResponse {
    fn from(game: crate::repositories::game::Game) -> Self {
        Self {
            appid: game.appid,
            name: game.name,
            last_modified: game.last_modified,
            rank: game.rank,
        }
    }
}

pub async fn get(
    pool: &PgPool,
    query: String,
    count: i64,
    page: i64,
) -> Result<Vec<SteamGameResponse>, Error> {
    // Build new game Filter
    let game_filter_values = game::Filter { query, count, page };
    // Return all games
    match game::filter(pool, game_filter_values).await {
        Ok(games) => Ok(games.into_iter().map(SteamGameResponse::from).collect()),
        Err(e) => Err(Error::Controller(format!(
            "Unable to get games due to: {e}"
        ))),
    }
}

/// Result of a Steam game cache refresh.
pub struct CacheRefresh {
    pub games_cached: i64,
    pub games_added: i64,
}

/// Rows per batched upsert; keeps each statement well under Postgres' limits.
const UPSERT_BATCH_SIZE: usize = 5000;

pub async fn cache_stats(pool: &PgPool) -> Result<game::CacheStats, Error> {
    game::cache_stats(pool)
        .await
        .map_err(|e| Error::Controller(format!("Unable to get Steam game cache stats: {e}")))
}

/// Shown to admins when Steam's app list can't be fetched. The underlying
/// error (often Steam's HTML error page) is logged, never returned.
pub const REFRESH_STEAM_UNAVAILABLE: &str =
    "Couldn't fetch the game list from Steam. The cache was not changed; try again later.";
/// Shown to admins when saving the fetched list fails part-way.
pub const REFRESH_SAVE_FAILED: &str =
    "Couldn't save the Steam game list. Some games may not have been updated; try again.";

/// Log `detail` and return a controller error carrying only `message`.
fn refresh_failed(message: &str, detail: impl Display) -> Error {
    log::error!("Steam game cache refresh failed: {detail}");
    Error::Controller(message.to_string())
}

/// Log `detail` and return an upstream (Steam) error carrying only `message`.
fn steam_unavailable(detail: impl Display) -> Error {
    log::error!("Steam game cache refresh failed: {detail}");
    Error::Upstream(REFRESH_STEAM_UNAVAILABLE.to_string())
}

/// Begin a refresh in the background. Returns `false` if one is already
/// running. The work outlives the request (Netlify's proxy gives up on
/// requests after ~26s); poll [`refresh_status`] for the outcome.
pub async fn start_update(
    pool: &PgPool,
    steam_api_key: &str,
    started_by: String,
) -> Result<bool, Error> {
    let Some(steam_game_update) = game_update::start(pool)
        .await
        .map_err(|e| refresh_failed(REFRESH_SAVE_FAILED, format!("creating update log: {e}")))?
    else {
        return Ok(false);
    };

    let pool = pool.clone();
    let steam_api_key = steam_api_key.to_string();
    tokio::spawn(async move {
        let update_id = steam_game_update.id;
        match run_update(&pool, &steam_api_key, update_id).await {
            Ok(refresh) => {
                crate::util::log_audit(
                    &pool,
                    Some(started_by),
                    "steam_games.update".to_string(),
                    "steam_games".to_string(),
                    None,
                    Some(rocket::serde::json::serde_json::json!({
                        "games_cached": refresh.games_cached,
                        "games_added": refresh.games_added,
                    })),
                )
                .await;
            }
            Err(e) => {
                let (Error::Controller(message) | Error::Upstream(message)) = e else {
                    return;
                };
                if let Err(e) = game_update::fail(&pool, update_id, &message).await {
                    log::error!("Unable to record Steam game cache refresh failure: {e}");
                }
            }
        }
    });
    Ok(true)
}

async fn run_update(
    pool: &PgPool,
    steam_api_key: &String,
    update_id: i32,
) -> Result<CacheRefresh, Error> {
    let steam_games = steam_api::get_app_list(steam_api_key)
        .await
        .map_err(steam_unavailable)?;

    log::info!("Retrieved {} games from Steam API", steam_games.len());

    let mut games_added = 0;
    for chunk in steam_games.chunks(UPSERT_BATCH_SIZE) {
        let appids: Vec<i64> = chunk.iter().map(|g| g.appid).collect();
        let names: Vec<String> = chunk.iter().map(|g| g.name.clone()).collect();

        games_added += game::upsert_many(pool, update_id, &appids, &names)
            .await
            .map_err(|e| refresh_failed(REFRESH_SAVE_FAILED, format!("inserting games: {e}")))?;

        log::info!("Upserted {} games.", chunk.len());
    }

    game_update::complete(pool, update_id, games_added)
        .await
        .map_err(|e| refresh_failed(REFRESH_SAVE_FAILED, format!("completing update log: {e}")))?;

    let stats = cache_stats(pool).await?;

    Ok(CacheRefresh {
        games_cached: stats.games_cached,
        games_added,
    })
}

/// Where the most recent refresh got to.
pub struct RefreshStatus {
    pub running: bool,
    pub started_at: Option<chrono::DateTime<chrono::Utc>>,
    /// Games added by the latest refresh, once it has finished.
    pub games_added: Option<i64>,
    /// Why the latest refresh failed, if it did. Safe to show.
    pub error: Option<String>,
}

pub async fn refresh_status(pool: &PgPool) -> Result<RefreshStatus, Error> {
    let latest = game_update::latest(pool)
        .await
        .map_err(|e| Error::Controller(format!("Unable to get Steam refresh status: {e}")))?;
    Ok(match latest {
        None => RefreshStatus {
            running: false,
            started_at: None,
            games_added: None,
            error: None,
        },
        Some(l) => RefreshStatus {
            running: l.is_running(),
            started_at: Some(l.update_time),
            games_added: l.games_added,
            error: l.error,
        },
    })
}

/// How long a found cover URL is cached.
const COVER_HIT_TTL: Duration = Duration::from_hours(24);
/// How long "Steam has no cover" and "Steam failed" are cached.
const COVER_MISS_TTL: Duration = Duration::from_mins(15);
/// Most appids remembered at once.
const COVER_CACHE_CAP: usize = 5000;
/// Most Steam store lookups made per minute across all users, so the
/// endpoint can't be used to hammer Steam with distinct appids.
const COVER_LOOKUPS_PER_MINUTE: usize = 60;
const COVER_LOOKUP_WINDOW: Duration = Duration::from_secs(60);

/// Shown when Steam can't be reached and nothing is cached.
pub const COVER_STEAM_UNAVAILABLE: &str = "Couldn't reach Steam for this game's cover art.";

#[derive(Clone, Debug, PartialEq, Eq)]
enum CoverLookup {
    Found(String),
    Missing,
    Failed,
}

struct CoverEntry {
    lookup: CoverLookup,
    expires: Instant,
}

#[derive(Default)]
struct CoverCache {
    entries: HashMap<u32, CoverEntry>,
    recent_lookups: VecDeque<Instant>,
}

impl CoverCache {
    /// The unexpired cached result for `appid`.
    fn fresh(&self, appid: u32, now: Instant) -> Option<CoverLookup> {
        self.entries
            .get(&appid)
            .filter(|entry| entry.expires > now)
            .map(|entry| entry.lookup.clone())
    }

    /// The last successful answer (`Found` or `Missing`) for `appid`,
    /// even if expired.
    fn stale(&self, appid: u32) -> Option<CoverLookup> {
        self.entries
            .get(&appid)
            .map(|entry| entry.lookup.clone())
            .filter(|lookup| *lookup != CoverLookup::Failed)
    }

    fn insert(&mut self, appid: u32, lookup: CoverLookup, ttl: Duration, now: Instant) {
        if self.entries.len() >= COVER_CACHE_CAP && !self.entries.contains_key(&appid) {
            self.entries.retain(|_, entry| entry.expires > now);
            if self.entries.len() >= COVER_CACHE_CAP {
                if let Some(oldest) = self
                    .entries
                    .iter()
                    .min_by_key(|(_, entry)| entry.expires)
                    .map(|(id, _)| *id)
                {
                    self.entries.remove(&oldest);
                }
            }
        }
        self.entries.insert(
            appid,
            CoverEntry {
                lookup,
                expires: now + ttl,
            },
        );
    }

    /// Record an upstream lookup if the per-minute budget allows one.
    fn try_reserve_lookup(&mut self, now: Instant) -> bool {
        while self
            .recent_lookups
            .front()
            .is_some_and(|t| now.duration_since(*t) >= COVER_LOOKUP_WINDOW)
        {
            self.recent_lookups.pop_front();
        }
        if self.recent_lookups.len() >= COVER_LOOKUPS_PER_MINUTE {
            return false;
        }
        self.recent_lookups.push_back(now);
        true
    }
}

static COVER_CACHE: LazyLock<Mutex<CoverCache>> =
    LazyLock::new(|| Mutex::new(CoverCache::default()));

fn cover_cache() -> std::sync::MutexGuard<'static, CoverCache> {
    COVER_CACHE.lock().unwrap_or_else(PoisonError::into_inner)
}

/// Turn a cached lookup into the endpoint's answer.
fn cover_answer(lookup: CoverLookup) -> Result<Option<String>, Error> {
    match lookup {
        CoverLookup::Found(url) => Ok(Some(url)),
        CoverLookup::Missing => Ok(None),
        CoverLookup::Failed => Err(Error::Upstream(COVER_STEAM_UNAVAILABLE.to_string())),
    }
}

/// A game's Steam store header image URL (a Steam CDN URL), or `None` when
/// Steam has none. `Error::Upstream` only when Steam is unreachable and
/// nothing usable is cached.
pub async fn steam_cover(appid: u32) -> Result<Option<String>, Error> {
    {
        let mut cache = cover_cache();
        let now = Instant::now();
        if let Some(lookup) = cache.fresh(appid, now) {
            return cover_answer(lookup);
        }
        if !cache.try_reserve_lookup(now) {
            log::warn!("Steam cover lookup budget exhausted; not looking up {appid}");
            return cover_answer(cache.stale(appid).unwrap_or(CoverLookup::Failed));
        }
    }

    let result = steam_api::get_header_image(appid).await;
    if let Err(e) = &result {
        log::warn!("Steam cover lookup for {appid} failed: {e}");
    }

    let mut cache = cover_cache();
    let (lookup, ttl) = match result {
        Ok(Some(url)) => (CoverLookup::Found(url), COVER_HIT_TTL),
        Ok(None) => (CoverLookup::Missing, COVER_MISS_TTL),
        // Keep serving the last good answer while Steam is down.
        Err(_) => (
            cache.stale(appid).unwrap_or(CoverLookup::Failed),
            COVER_MISS_TTL,
        ),
    };
    cache.insert(appid, lookup.clone(), ttl, Instant::now());
    drop(cache);
    cover_answer(lookup)
}

#[cfg(test)]
mod tests {
    use super::{
        CoverCache, CoverLookup, Duration, Instant, COVER_CACHE_CAP, COVER_HIT_TTL,
        COVER_LOOKUPS_PER_MINUTE, COVER_LOOKUP_WINDOW, COVER_MISS_TTL,
    };

    #[test]
    fn cached_results_expire() {
        let mut cache = CoverCache::default();
        let now = Instant::now();
        cache.insert(1, CoverLookup::Found("u".into()), COVER_HIT_TTL, now);
        cache.insert(2, CoverLookup::Missing, COVER_MISS_TTL, now);
        assert_eq!(cache.fresh(1, now), Some(CoverLookup::Found("u".into())));
        assert_eq!(cache.fresh(2, now), Some(CoverLookup::Missing));
        let later = now + COVER_MISS_TTL + Duration::from_secs(1);
        assert_eq!(cache.fresh(2, later), None);
        assert!(cache.fresh(1, later).is_some());
        assert_eq!(cache.fresh(1, now + COVER_HIT_TTL), None);
        // Expired answers still back up a failed refresh.
        assert_eq!(cache.stale(1), Some(CoverLookup::Found("u".into())));
        assert_eq!(cache.stale(2), Some(CoverLookup::Missing));
        assert_eq!(cache.stale(3), None);
    }

    #[test]
    fn failures_are_not_stale_answers() {
        let mut cache = CoverCache::default();
        let now = Instant::now();
        cache.insert(1, CoverLookup::Failed, COVER_MISS_TTL, now);
        assert_eq!(cache.fresh(1, now), Some(CoverLookup::Failed));
        assert_eq!(cache.stale(1), None);
    }

    #[test]
    fn cache_is_bounded() {
        let mut cache = CoverCache::default();
        let now = Instant::now();
        let cap = u32::try_from(COVER_CACHE_CAP).unwrap_or(u32::MAX);
        for appid in 0..cap {
            cache.insert(appid, CoverLookup::Missing, COVER_MISS_TTL, now);
        }
        // The soonest-expiring entry makes room.
        cache.insert(0, CoverLookup::Missing, Duration::from_secs(1), now);
        cache.insert(cap + 1, CoverLookup::Missing, COVER_MISS_TTL, now);
        assert_eq!(cache.entries.len(), COVER_CACHE_CAP);
        assert!(!cache.entries.contains_key(&0));
        assert!(cache.entries.contains_key(&(cap + 1)));
        // Expired entries are purged first.
        let later = now + COVER_MISS_TTL + Duration::from_secs(1);
        cache.insert(cap + 2, CoverLookup::Missing, COVER_MISS_TTL, later);
        assert_eq!(cache.entries.len(), 1);
    }

    #[test]
    fn upstream_lookups_are_rate_limited() {
        let mut cache = CoverCache::default();
        let now = Instant::now();
        for _ in 0..COVER_LOOKUPS_PER_MINUTE {
            assert!(cache.try_reserve_lookup(now));
        }
        assert!(!cache.try_reserve_lookup(now));
        assert!(cache.try_reserve_lookup(now + COVER_LOOKUP_WINDOW));
    }
}
