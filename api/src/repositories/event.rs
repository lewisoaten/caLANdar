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

pub struct PaginationParams {
    pub page: i64,
    pub limit: i64,
    pub filter: EventFilter,
}

pub struct PaginatedEvents {
    pub events: Vec<Event>,
    pub total: i64,
    pub page: i64,
    pub limit: i64,
    pub total_pages: i64,
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

pub async fn index_paginated(
    pool: &PgPool,
    params: PaginationParams,
) -> Result<PaginatedEvents, sqlx::Error> {
    let offset = (params.page - 1) * params.limit;
    let now = Utc::now();

    // Build query with proper parameterization based on filter
    let (total, events): (i64, Vec<Event>) = match params.filter {
        EventFilter::Upcoming => {
            let count_result: Option<i64> = sqlx::query_scalar!(
                "SELECT COUNT(*) as count FROM event WHERE time_end > $1",
                now
            )
            .fetch_one(pool)
            .await?;
            let total = count_result.unwrap_or(0);

            let events: Vec<Event> = sqlx::query_as!(
                Event,
                r#"
                SELECT id, created_at, last_modified, title, description, image, time_begin, time_end
                FROM event
                WHERE time_end > $3
                ORDER BY time_begin DESC
                LIMIT $1 OFFSET $2
                "#,
                params.limit,
                offset,
                now
            )
            .fetch_all(pool)
            .await?;

            (total, events)
        }
        EventFilter::Past => {
            let count_result: Option<i64> = sqlx::query_scalar!(
                "SELECT COUNT(*) as count FROM event WHERE time_end <= $1",
                now
            )
            .fetch_one(pool)
            .await?;
            let total = count_result.unwrap_or(0);

            let events: Vec<Event> = sqlx::query_as!(
                Event,
                r#"
                SELECT id, created_at, last_modified, title, description, image, time_begin, time_end
                FROM event
                WHERE time_end <= $3
                ORDER BY time_begin DESC
                LIMIT $1 OFFSET $2
                "#,
                params.limit,
                offset,
                now
            )
            .fetch_all(pool)
            .await?;

            (total, events)
        }
        EventFilter::All => {
            let count_result: Option<i64> =
                sqlx::query_scalar!("SELECT COUNT(*) as count FROM event")
                    .fetch_one(pool)
                    .await?;
            let total = count_result.unwrap_or(0);

            let events: Vec<Event> = sqlx::query_as!(
                Event,
                r#"
                SELECT id, created_at, last_modified, title, description, image, time_begin, time_end
                FROM event
                ORDER BY time_begin DESC
                LIMIT $1 OFFSET $2
                "#,
                params.limit,
                offset
            )
            .fetch_all(pool)
            .await?;

            (total, events)
        }
    };

    let total_pages = (total + params.limit - 1) / params.limit;

    Ok(PaginatedEvents {
        events,
        total,
        page: params.page,
        limit: params.limit,
        total_pages,
    })
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
