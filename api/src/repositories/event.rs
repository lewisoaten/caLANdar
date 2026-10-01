use chrono::{DateTime, Utc};
use sqlx::{FromRow, PgPool};

#[derive(Clone, FromRow)]
pub struct Event {
    pub id: i32,
    pub created_at: DateTime<Utc>,
    pub last_modified: DateTime<Utc>,
    pub title: String,
    pub description: String,
    pub image: Option<Vec<u8>>,
    pub time_begin: DateTime<Utc>,
    pub time_end: DateTime<Utc>,
}

pub struct Filter {
    pub ids: Option<Vec<i32>>,
}

#[derive(Clone, Debug)]
pub enum EventFilter {
    All,
    Upcoming,
    Past,
}

pub async fn create(
    pool: &PgPool,
    title: String,
    description: String,
    image: Option<Vec<u8>>,
    time_begin: DateTime<Utc>,
    time_end: DateTime<Utc>,
) -> Result<Event, sqlx::Error> {
    // Insert new event and return it
    sqlx::query_as!(
        Event,
        r#"
        INSERT INTO event (
            title,
            description,
            image,
            time_begin,
            time_end
        )
        VALUES (
            $1,
            $2,
            $3,
            $4,
            $5
        )
        RETURNING
            id,
            created_at,
            last_modified,
            title,
            description,
            image,
            time_begin,
            time_end
        "#,
        title,
        description,
        image,
        time_begin,
        time_end,
    )
    .fetch_one(pool)
    .await
}

#[allow(dead_code)]
pub async fn index(pool: &PgPool) -> Result<Vec<Event>, sqlx::Error> {
    sqlx::query_as!(
        Event,
        r#"
        SELECT
            id,
            created_at,
            last_modified,
            title,
            description,
            image,
            time_begin,
            time_end
        FROM event
        "#
    )
    .fetch_all(pool)
    .await
}

/// An event the user is invited to, with their own RSVP.
pub struct UserEvent {
    pub event: Event,
    pub my_response: Option<crate::repositories::invitation::Response>,
}

/// All events `email` is invited to, with the caller's RSVP, in one query.
pub async fn index_for_user(pool: &PgPool, email: &str) -> Result<Vec<UserEvent>, sqlx::Error> {
    let rows = sqlx::query!(
        r#"
        SELECT
            e.id,
            e.created_at,
            e.last_modified,
            e.title,
            e.description,
            e.image,
            e.time_begin,
            e.time_end,
            i.response AS "my_response: crate::repositories::invitation::Response"
        FROM event e
        INNER JOIN invitation i ON i.event_id = e.id
        WHERE LOWER(i.email) = LOWER($1)
        "#,
        email
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| UserEvent {
            event: Event {
                id: r.id,
                created_at: r.created_at,
                last_modified: r.last_modified,
                title: r.title,
                description: r.description,
                image: r.image,
                time_begin: r.time_begin,
                time_end: r.time_end,
            },
            my_response: r.my_response,
        })
        .collect())
}

pub async fn filter(pool: &PgPool, filter: Filter) -> Result<Vec<Event>, sqlx::Error> {
    let ids = filter
        .ids
        .map_or_else(|| (vec![], true), |ids| (ids, false));

    sqlx::query_as!(
        Event,
        r#"
        SELECT
            id,
            created_at,
            last_modified,
            title,
            description,
            image,
            time_begin,
            time_end
        FROM event
        WHERE (id = ANY($1) OR $2)
        "#,
        &ids.0[..],
        ids.1
    )
    .fetch_all(pool)
    .await
}

pub async fn delete(pool: &PgPool, filter: Filter) -> Result<(), sqlx::Error> {
    let ids = filter
        .ids
        .map_or_else(|| (vec![], true), |ids| (ids, false));

    match sqlx::query!(
        r#"
        DELETE
        FROM event
        WHERE (id = ANY($1) OR $2)
        "#,
        &ids.0[..],
        ids.1
    )
    .execute(pool)
    .await
    {
        Ok(_) => Ok(()),
        Err(e) => Err(e),
    }
}

pub async fn edit(
    pool: &PgPool,
    id: i32,
    title: String,
    description: String,
    image: Option<Vec<u8>>,
    time_begin: DateTime<Utc>,
    time_end: DateTime<Utc>,
) -> Result<Event, sqlx::Error> {
    // Insert new event and return it
    sqlx::query_as!(
        Event,
        r#"
        UPDATE event
        SET
            title = $2,
            description = $3,
            image = $4,
            time_begin = $5,
            time_end = $6,
            last_modified = NOW()
        WHERE id = $1
        RETURNING
            id,
            created_at,
            last_modified,
            title,
            description,
            image,
            time_begin,
            time_end
        "#,
        id,
        title,
        description,
        image,
        time_begin,
        time_end,
    )
    .fetch_one(pool)
    .await
}

/// Derived status of an event on the admin list.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EventStatus {
    All,
    Live,
    Draft,
    Ended,
}

impl EventStatus {
    /// Unknown values fall back to `All`, matching how `filter` is handled.
    pub fn parse(value: Option<&str>) -> Self {
        match value {
            Some("live") => Self::Live,
            Some("draft") => Self::Draft,
            Some("ended") => Self::Ended,
            _ => Self::All,
        }
    }

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::All => "all",
            Self::Live => "live",
            Self::Draft => "draft",
            Self::Ended => "ended",
        }
    }
}

const fn event_filter_str(filter: &EventFilter) -> &'static str {
    match filter {
        EventFilter::All => "all",
        EventFilter::Upcoming => "upcoming",
        EventFilter::Past => "past",
    }
}

pub struct AdminListParams {
    pub page: i64,
    pub limit: i64,
    pub filter: EventFilter,
    pub search: Option<String>,
    pub status: EventStatus,
}

pub struct AdminEventRow {
    pub event: Event,
    pub status: String,
    pub invited: i64,
    pub yes: i64,
    pub maybe: i64,
    pub no: i64,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct StatusCounts {
    pub all: i64,
    pub live: i64,
    pub draft: i64,
    pub ended: i64,
}

pub struct AdminEventPage {
    pub events: Vec<AdminEventRow>,
    pub total: i64,
    pub page: i64,
    pub limit: i64,
    pub total_pages: i64,
    pub counts: StatusCounts,
}

/// Admin event list with search, derived status filter, RSVP totals and
/// per-status counts. Status: `ended` once `time_end` has passed, otherwise
/// `draft` while no invitations have been sent, otherwise `live`.
#[allow(clippy::too_many_lines)]
pub async fn index_admin(
    pool: &PgPool,
    params: AdminListParams,
) -> Result<AdminEventPage, sqlx::Error> {
    let offset = (params.page - 1) * params.limit;
    let now = Utc::now();
    let pattern = params.search.as_deref().map(crate::util::like_pattern);
    let filter = event_filter_str(&params.filter);

    let count_rows = sqlx::query!(
        r#"
        SELECT status AS "status!", COUNT(*) AS "count!"
        FROM (
            SELECT CASE
                WHEN e.time_end <= $1 THEN 'ended'
                WHEN NOT EXISTS (SELECT 1 FROM invitation i WHERE i.event_id = e.id) THEN 'draft'
                ELSE 'live'
            END AS status
            FROM event e
            WHERE ($2::text IS NULL OR e.title ILIKE $2)
            AND CASE $3::text
                WHEN 'upcoming' THEN e.time_end > $1
                WHEN 'past' THEN e.time_end <= $1
                ELSE TRUE
            END
        ) s
        GROUP BY status
        "#,
        now,
        pattern,
        filter,
    )
    .fetch_all(pool)
    .await?;

    let mut counts = StatusCounts::default();
    for row in count_rows {
        counts.all += row.count;
        match row.status.as_str() {
            "live" => counts.live = row.count,
            "draft" => counts.draft = row.count,
            _ => counts.ended = row.count,
        }
    }
    let total = match params.status {
        EventStatus::All => counts.all,
        EventStatus::Live => counts.live,
        EventStatus::Draft => counts.draft,
        EventStatus::Ended => counts.ended,
    };

    let rows = sqlx::query!(
        r#"
        WITH stats AS (
            SELECT
                e.id,
                COUNT(i.email) AS invited,
                COUNT(*) FILTER (WHERE i.response = 'yes') AS yes,
                COUNT(*) FILTER (WHERE i.response = 'maybe') AS maybe,
                COUNT(*) FILTER (WHERE i.response = 'no') AS no
            FROM event e
            LEFT JOIN invitation i ON i.event_id = e.id
            GROUP BY e.id
        ),
        classified AS (
            SELECT
                e.*,
                s.invited, s.yes, s.maybe, s.no,
                CASE
                    WHEN e.time_end <= $1 THEN 'ended'
                    WHEN s.invited = 0 THEN 'draft'
                    ELSE 'live'
                END AS status
            FROM event e
            INNER JOIN stats s ON s.id = e.id
            WHERE ($2::text IS NULL OR e.title ILIKE $2)
            AND CASE $3::text
                WHEN 'upcoming' THEN e.time_end > $1
                WHEN 'past' THEN e.time_end <= $1
                ELSE TRUE
            END
        )
        SELECT
            id AS "id!", created_at AS "created_at!", last_modified AS "last_modified!",
            title AS "title!", description AS "description!", image,
            time_begin AS "time_begin!", time_end AS "time_end!",
            status AS "status!", invited AS "invited!", yes AS "yes!", maybe AS "maybe!", no AS "no!"
        FROM classified
        WHERE $4::text = 'all' OR status = $4
        ORDER BY time_begin DESC
        LIMIT $5 OFFSET $6
        "#,
        now,
        pattern,
        filter,
        params.status.as_str(),
        params.limit,
        offset,
    )
    .fetch_all(pool)
    .await?;

    let events = rows
        .into_iter()
        .map(|row| AdminEventRow {
            event: Event {
                id: row.id,
                created_at: row.created_at,
                last_modified: row.last_modified,
                title: row.title,
                description: row.description,
                image: row.image,
                time_begin: row.time_begin,
                time_end: row.time_end,
            },
            status: row.status,
            invited: row.invited,
            yes: row.yes,
            maybe: row.maybe,
            no: row.no,
        })
        .collect();

    Ok(AdminEventPage {
        events,
        total,
        page: params.page,
        limit: params.limit,
        total_pages: (total + params.limit - 1) / params.limit,
        counts,
    })
}

#[cfg(test)]
mod tests {
    use super::EventStatus;

    #[test]
    fn parses_status_and_falls_back_to_all() {
        assert_eq!(EventStatus::parse(Some("live")), EventStatus::Live);
        assert_eq!(EventStatus::parse(Some("draft")), EventStatus::Draft);
        assert_eq!(EventStatus::parse(Some("ended")), EventStatus::Ended);
        assert_eq!(EventStatus::parse(Some("bogus")), EventStatus::All);
        assert_eq!(EventStatus::parse(None), EventStatus::All);
    }
}
