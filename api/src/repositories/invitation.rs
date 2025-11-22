use chrono::{DateTime, Utc};
use sqlx::PgPool;

#[derive(sqlx::Type, PartialEq, Eq, Debug)]
#[sqlx(type_name = "invitation_response", rename_all = "lowercase")]
pub enum Response {
    Yes,
    No,
    Maybe,
}

pub struct Invitation {
    pub event_id: i32,
    pub email: String,
    pub avatar_url: Option<String>, // For some reason this has to be optional, even though it is explicitly set in the query
    pub handle: Option<String>,
    #[allow(dead_code)]
    pub invited_at: DateTime<Utc>,
    pub responded_at: Option<DateTime<Utc>>,
    pub response: Option<Response>,
    #[allow(dead_code)]
    pub attendance: Option<Vec<u8>>,
    #[allow(dead_code)]
    pub last_modified: DateTime<Utc>,
}

pub struct Filter {
    pub event_id: Option<i32>,
    pub email: Option<String>,
}

pub async fn filter(pool: &PgPool, filter: Filter) -> Result<Vec<Invitation>, sqlx::Error> {
    let event_id = filter
        .event_id
        .map_or((0, true), |event_id| (event_id, false));

    let email = filter
        .email
        .map_or_else(|| (String::new(), true), |email| (email, false));

    sqlx::query_as!(
        Invitation,
        r#"
        SELECT
            event_id,
            email,
            'https://www.gravatar.com/avatar/' || MD5(LOWER(email)) || '?d=robohash' AS avatar_url,
            handle,
            invited_at,
            responded_at,
            response AS "response: _",
            attendance,
            last_modified
        FROM invitation
        WHERE (event_id = $1 OR $2)
        AND (LOWER(email) = LOWER($3) OR $4)
        "#,
        event_id.0,
        event_id.1,
        email.0,
        email.1,
    )
    .fetch_all(pool)
    .await
}

pub async fn edit(
    pool: &PgPool,
    event_id: i32,
    email: String,
    handle: Option<String>,
    response: Response,
    attendance: Option<Vec<u8>>,
) -> Result<Invitation, sqlx::Error> {
    // Insert new event and return it
    sqlx::query_as!(
        Invitation,
        r#"
        UPDATE invitation
        SET
            handle = $3,
            response = $4,
            attendance = $5,
            responded_at = NOW(),
            last_modified = NOW()
        WHERE event_id = $1
        AND LOWER(email) = LOWER($2)
        RETURNING
            event_id,
            email,
            'https://www.gravatar.com/avatar/' || MD5(LOWER(email)) || '?d=robohash' AS avatar_url,
            handle,
            invited_at,
            responded_at,
            response AS "response: _",
            attendance,
            last_modified
        "#,
        event_id,
        email,
        handle,
        response as _,
        attendance,
    )
    .fetch_one(pool)
    .await
}
