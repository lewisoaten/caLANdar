use chrono::{DateTime, Utc};
use sqlx::PgPool;

#[derive(sqlx::Type)]
#[sqlx(type_name = "invitation_response", rename_all = "lowercase")]
pub enum Response {
    Yes,
    No,
    Maybe,
}

pub struct Invitation {
    pub event_id: i32,
    pub email: String,
    pub handle: Option<String>,
    pub invited_at: DateTime<Utc>,
    pub responded_at: Option<DateTime<Utc>>,
    pub response: Option<Response>,
    pub attendance: Option<Vec<u8>>,
    pub last_modified: DateTime<Utc>,
}

pub struct Filter {
    pub event_id: Option<i32>,
    pub email: Option<String>,
}

pub async fn filter(pool: &PgPool, filter: Filter) -> Result<Vec<Invitation>, sqlx::Error> {
    let event_id = match filter.event_id {
        Some(event_id) => (event_id, false),
        None => (0, true),
    };

    let email = match filter.email {
        Some(email) => (email, false),
        None => (String::new(), true),
    };

    sqlx::query_as!(
        Invitation,
        r#"
        SELECT event_id, email, handle, invited_at, responded_at, response AS "response: _", attendance, last_modified
        FROM invitation
        WHERE (event_id = $1 OR $2)
        AND (email = $3 OR $4)
        "#,
        event_id.0,
        event_id.1,
        email.0,
        email.1,
    )
    .fetch_all(pool)
    .await
}
