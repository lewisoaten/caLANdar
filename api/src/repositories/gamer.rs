use chrono::{DateTime, Utc};
use sqlx::PgPool;

#[derive(Clone, Debug)]
pub struct GamerSummary {
    pub email: String,
    pub avatar_url: String,
    pub handles: Vec<String>,
    pub callsign: Option<String>,
    pub steam_id: Option<String>,
    pub steam_linked: bool,
    pub events_invited_count: i64,
    pub events_accepted_count: i64,
    pub events_tentative_count: i64,
    pub events_declined_count: i64,
    pub events_last_response: Option<DateTime<Utc>>,
    pub games_owned_count: i64,
    pub games_owned_last_modified: Option<DateTime<Utc>>,
}

/// Server-side filter for the gamers list.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GamerFilter {
    All,
    Steam,
    NoSteam,
    StaleLibrary,
}

impl GamerFilter {
    pub fn parse(value: Option<&str>) -> Result<Self, String> {
        match value {
            None | Some("all") => Ok(Self::All),
            Some("steam") => Ok(Self::Steam),
            Some("no_steam") => Ok(Self::NoSteam),
            Some("stale_library") => Ok(Self::StaleLibrary),
            Some(other) => Err(format!(
                "Unknown filter \"{other}\", expected all, steam, no_steam or stale_library"
            )),
        }
    }

    const fn as_str(self) -> &'static str {
        match self {
            Self::All => "all",
            Self::Steam => "steam",
            Self::NoSteam => "no_steam",
            Self::StaleLibrary => "stale_library",
        }
    }
}

/// Server-side sort for the gamers list.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GamerSort {
    Email,
    LastRsvp,
    GamesUpdated,
    Callsign,
}

impl GamerSort {
    pub fn parse(value: Option<&str>) -> Result<Self, String> {
        match value {
            None | Some("email") => Ok(Self::Email),
            Some("last_rsvp") => Ok(Self::LastRsvp),
            Some("games_updated") => Ok(Self::GamesUpdated),
            Some("callsign") => Ok(Self::Callsign),
            Some(other) => Err(format!(
                "Unknown sort \"{other}\", expected email, last_rsvp, games_updated or callsign"
            )),
        }
    }

    const fn as_str(self) -> &'static str {
        match self {
            Self::Email => "email",
            Self::LastRsvp => "last_rsvp",
            Self::GamesUpdated => "games_updated",
            Self::Callsign => "callsign",
        }
    }
}

pub struct PaginationParams {
    pub page: i64,
    pub limit: i64,
    pub search: Option<String>,
    pub filter: GamerFilter,
    pub sort: GamerSort,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct GamerCounts {
    pub all: i64,
    pub steam: i64,
    pub no_steam: i64,
    pub stale_library: i64,
}

pub struct PaginatedGamers {
    pub gamers: Vec<GamerSummary>,
    pub total: i64,
    pub page: i64,
    pub limit: i64,
    pub total_pages: i64,
    pub counts: GamerCounts,
}

/// Libraries not synced for this long are "stale" on the Gamers screen.
const STALE_LIBRARY_DAYS: i32 = 30;

#[allow(clippy::too_many_lines)]
pub async fn index_paginated(
    pool: &PgPool,
    params: PaginationParams,
) -> Result<PaginatedGamers, sqlx::Error> {
    let offset = (params.page - 1) * params.limit;
    let search_pattern = params
        .search
        .as_deref()
        .map(|s| crate::util::like_pattern(&s.to_lowercase()));

    // One CTE builds the (small) full gamer list with every aggregate; the
    // outer query filters, sorts, paginates and also reports per-filter
    // counts via window functions so the UI can show them on the chips.
    let rows = sqlx::query!(
        r#"
        WITH gamer_events AS (
            SELECT
                LOWER(i.email) AS email,
                ARRAY_AGG(DISTINCT i.handle) FILTER (WHERE i.handle IS NOT NULL) AS handles,
                (ARRAY_AGG(i.handle ORDER BY e.time_begin DESC) FILTER (WHERE i.handle IS NOT NULL AND i.handle <> ''))[1] AS callsign,
                MAX(i.responded_at) AS events_last_response,
                COUNT(*) AS events_invited_count,
                COUNT(*) FILTER (WHERE i.response = 'yes') AS events_accepted_count,
                COUNT(*) FILTER (WHERE i.response = 'maybe') AS events_tentative_count,
                COUNT(*) FILTER (WHERE i.response = 'no') AS events_declined_count,
                BOOL_OR($1::text IS NULL OR LOWER(i.email) LIKE $1 OR LOWER(i.handle) LIKE $1) AS matches_search
            FROM invitation i
            INNER JOIN event e ON e.id = i.event_id
            GROUP BY LOWER(i.email)
        ),
        gamer_games AS (
            SELECT
                LOWER(ug.email) AS email,
                COUNT(*) AS games_owned_count,
                MAX(ug.last_modified) AS games_owned_last_modified
            FROM user_game ug
            GROUP BY LOWER(ug.email)
        ),
        gamers AS (
            SELECT
                ge.*,
                p.steam_id,
                COALESCE(p.steam_id, 0) <> 0 AS steam_linked,
                COALESCE(gg.games_owned_count, 0) AS games_owned_count,
                gg.games_owned_last_modified
            FROM gamer_events ge
            LEFT JOIN profiles p ON LOWER(p.email) = ge.email
            LEFT JOIN gamer_games gg ON gg.email = ge.email
            WHERE ge.matches_search
        ),
        classified AS (
            SELECT
                g.*,
                (g.steam_linked AND (g.games_owned_last_modified IS NULL
                    OR g.games_owned_last_modified < NOW() - make_interval(days => $6::int))) AS stale_library
            FROM gamers g
        ),
        counted AS (
            SELECT
                c.*,
                COUNT(*) OVER () AS count_all,
                COUNT(*) FILTER (WHERE c.steam_linked) OVER () AS count_steam,
                COUNT(*) FILTER (WHERE NOT c.steam_linked) OVER () AS count_no_steam,
                COUNT(*) FILTER (WHERE c.stale_library) OVER () AS count_stale
            FROM classified c
        ),
        filtered AS (
            SELECT c.*, COUNT(*) OVER () AS total
            FROM counted c
            WHERE CASE $2::text
                WHEN 'steam' THEN c.steam_linked
                WHEN 'no_steam' THEN NOT c.steam_linked
                WHEN 'stale_library' THEN c.stale_library
                ELSE TRUE
            END
        )
        SELECT
            f.email AS "email!",
            'https://www.gravatar.com/avatar/' || MD5(f.email) || '?d=robohash' AS "avatar_url!",
            f.handles,
            f.callsign,
            f.steam_id AS "steam_id?",
            f.steam_linked AS "steam_linked!",
            f.events_invited_count AS "events_invited_count!",
            f.events_accepted_count AS "events_accepted_count!",
            f.events_tentative_count AS "events_tentative_count!",
            f.events_declined_count AS "events_declined_count!",
            f.events_last_response,
            f.games_owned_count AS "games_owned_count!",
            f.games_owned_last_modified,
            f.total AS "total!",
            f.count_all AS "count_all!",
            f.count_steam AS "count_steam!",
            f.count_no_steam AS "count_no_steam!",
            f.count_stale AS "count_stale!"
        FROM filtered f
        ORDER BY
            CASE WHEN $3::text = 'last_rsvp' THEN f.events_last_response END DESC NULLS LAST,
            CASE WHEN $3::text = 'games_updated' THEN f.games_owned_last_modified END DESC NULLS LAST,
            CASE WHEN $3::text = 'callsign' THEN f.callsign IS NULL END,
            CASE WHEN $3::text = 'callsign' THEN LOWER(f.callsign) END,
            f.email
        LIMIT $4 OFFSET $5
        "#,
        search_pattern,
        params.filter.as_str(),
        params.sort.as_str(),
        params.limit,
        offset,
        STALE_LIBRARY_DAYS,
    )
    .fetch_all(pool)
    .await?;

    // Totals come from window functions, so an out-of-range page has no row
    // to read them from; fall back to a cheap count-only pass in that case.
    let (total, counts) = if let Some(first) = rows.first() {
        (
            first.total,
            GamerCounts {
                all: first.count_all,
                steam: first.count_steam,
                no_steam: first.count_no_steam,
                stale_library: first.count_stale,
            },
        )
    } else if offset > 0 {
        let fallback = Box::pin(index_paginated(
            pool,
            PaginationParams {
                page: 1,
                limit: 1,
                search: params.search.clone(),
                filter: params.filter,
                sort: params.sort,
            },
        ))
        .await?;
        (fallback.total, fallback.counts)
    } else {
        // Page 1 is empty for this filter; the chip counts may still be non-zero.
        let unfiltered = if params.filter == GamerFilter::All {
            None
        } else {
            Some(
                Box::pin(index_paginated(
                    pool,
                    PaginationParams {
                        page: 1,
                        limit: 1,
                        search: params.search.clone(),
                        filter: GamerFilter::All,
                        sort: params.sort,
                    },
                ))
                .await?,
            )
        };
        (0, unfiltered.map(|u| u.counts).unwrap_or_default())
    };

    let gamer_summaries: Vec<GamerSummary> = rows
        .into_iter()
        .map(|row| GamerSummary {
            email: row.email,
            avatar_url: row.avatar_url,
            handles: row.handles.unwrap_or_default(),
            callsign: row.callsign,
            steam_id: row.steam_id.map(|id| id.to_string()),
            steam_linked: row.steam_linked,
            events_invited_count: row.events_invited_count,
            events_accepted_count: row.events_accepted_count,
            events_tentative_count: row.events_tentative_count,
            events_declined_count: row.events_declined_count,
            events_last_response: row.events_last_response,
            games_owned_count: row.games_owned_count,
            games_owned_last_modified: row.games_owned_last_modified,
        })
        .collect();

    let total_pages = if total > 0 {
        (total + params.limit - 1) / params.limit
    } else {
        0
    };

    Ok(PaginatedGamers {
        gamers: gamer_summaries,
        total,
        page: params.page,
        limit: params.limit,
        total_pages,
        counts,
    })
}

#[cfg(test)]
mod tests {
    use super::{GamerFilter, GamerSort};

    #[test]
    fn parses_filters_and_defaults_to_all() {
        assert_eq!(GamerFilter::parse(None), Ok(GamerFilter::All));
        assert_eq!(GamerFilter::parse(Some("steam")), Ok(GamerFilter::Steam));
        assert_eq!(
            GamerFilter::parse(Some("no_steam")),
            Ok(GamerFilter::NoSteam)
        );
        assert_eq!(
            GamerFilter::parse(Some("stale_library")),
            Ok(GamerFilter::StaleLibrary)
        );
        assert!(GamerFilter::parse(Some("linked")).is_err());
    }

    #[test]
    fn parses_sorts_and_defaults_to_email() {
        assert_eq!(GamerSort::parse(None), Ok(GamerSort::Email));
        assert_eq!(GamerSort::parse(Some("last_rsvp")), Ok(GamerSort::LastRsvp));
        assert_eq!(
            GamerSort::parse(Some("games_updated")),
            Ok(GamerSort::GamesUpdated)
        );
        assert_eq!(GamerSort::parse(Some("callsign")), Ok(GamerSort::Callsign));
        assert!(GamerSort::parse(Some("rsvp")).is_err());
    }
}
