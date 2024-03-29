use chrono::{DateTime, Utc};
use sqlx::PgPool;

#[derive(Clone)]
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
