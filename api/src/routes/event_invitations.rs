use crate::{
    auth::{AdminUser, User},
    controllers::{event_invitation, Error},
    util::{is_attending_event, send_preauth_email, PreauthEmailDetails},
};
use chrono::{prelude::Utc, DateTime, Duration};
use rocket::{
    delete, get, patch, post,
    response::status,
    serde::{json::Json, Deserialize, Serialize},
    State,
};
use rocket_dyn_templates::tera::{Context, Tera};
use rocket_okapi::okapi::schemars;
use rocket_okapi::okapi::schemars::JsonSchema;
use rocket_okapi::openapi;
use rusty_paseto::prelude::*;
use sendgrid::v3::Sender;
use sqlx::postgres::PgPool;

use crate::routes::events::Event;

use super::SchemaExample;

#[derive(Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct InvitationsPostRequest {
    email: String,
}

#[derive(sqlx::Type, Deserialize, Serialize, JsonSchema, PartialEq, Eq)]
#[sqlx(type_name = "invitation_response", rename_all = "lowercase")]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub enum InvitationResponse {
    Yes,
    No,
    Maybe,
}

#[derive(Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct InvitationsResponse {
    pub event_id: i32,
    pub email: String,
    pub avatar_url: Option<String>,
    pub handle: Option<String>,
    pub invited_at: DateTime<Utc>,
    pub responded_at: Option<DateTime<Utc>>,
    pub response: Option<InvitationResponse>,
    pub attendance: Option<Vec<u8>>,
    pub last_modified: DateTime<Utc>,
}

#[allow(clippy::too_many_arguments)]
#[openapi(tag = "Event Invitations")]
#[post(
    "/events/<event_id>/invitations?<_as_admin>",
    format = "json",
    data = "<invitation_request>"
)]
pub async fn post(
    event_id: i32,
    invitation_request: Json<InvitationsPostRequest>,
    pool: &State<PgPool>,
    key: &State<PasetoSymmetricKey<V4, Local>>,
    sender: &State<Sender>,
    tera: &State<Tera>,
    _as_admin: Option<bool>,
    _user: AdminUser,
) -> Result<status::Created<Json<InvitationsResponse>>, rocket::response::status::BadRequest<String>>
{
    // Insert new event and return it
    let invitation: InvitationsResponse = match sqlx::query_as!(
        InvitationsResponse,
        r#"INSERT INTO invitation (event_id, email)
        VALUES ($1, $2)
        RETURNING event_id, email, 'https://www.gravatar.com/avatar/' || MD5(LOWER(email)) || '?d=robohash' AS avatar_url, handle, invited_at, responded_at, response AS "response: _", attendance, last_modified"#,
        event_id,
        invitation_request.email,
    ).fetch_one(pool.inner()).await
    {
        Ok(event) => event,
        Err(_) => {
            return Err(rocket::response::status::BadRequest(Some(
                "Error getting database ID".to_string(),
            )))
        }
    };

    //Get event details
    let event: Event = match sqlx::query_as!(
        Event,
        "SELECT id, created_at, last_modified, title, description, time_begin, time_end FROM event WHERE id = $1",
        event_id
    ).fetch_one(pool.inner()).await
    {
        Ok(event) => event,
        Err(_) => {
            return Err(rocket::response::status::BadRequest(Some(
                "Error getting database ID".to_string(),
            )))
        }
    };

    let mut context = Context::new();
    context.insert("name", &invitation_request.email);
    context.insert("title", &event.title);
    context.insert(
        "time_begin",
        &event.time_begin.format("%a %e %b %Y %H:%M").to_string(),
    );
    context.insert(
        "time_end",
        &event.time_end.format("%a %e %b %Y %H:%M").to_string(),
    );
    context.insert("description", &event.description);

    let email_details = PreauthEmailDetails {
        email_address: invitation_request.email.to_string(),
        email_subject: format!("{} - caLANdar Invitation", event.title),
        email_template: "email_invitation.html.tera".to_string(),
    };

    match send_preauth_email(
        email_details,
        &mut context,
        format!("/events/{}", event.id).as_str(),
        Duration::hours(24),
        key,
        sender,
        tera,
    )
    .await
    {
        Ok(_) => (),
        Err(_) => {
            return Err(rocket::response::status::BadRequest(Some(
                "Error sending invitation email".to_string(),
            )))
        }
    }

    Ok(
        status::Created::new("/events/".to_string() + &invitation.event_id.to_string())
            .body(Json(invitation)),
    )
}

#[openapi(tag = "Event Invitations")]
#[get("/events/<event_id>/invitations/<email>", format = "json")]
pub async fn get(
    event_id: i32,
    email: String,
    pool: &State<PgPool>,
    user: User,
) -> Result<Json<InvitationsResponse>, rocket::response::status::BadRequest<String>> {
    log::info!("Getting invitation details for email: {}", email);
    if user.email != email {
        return Err(rocket::response::status::BadRequest(Some(
            "You can only respond to invitations for your own email address".to_string(),
        )));
    }

    // Return your invitation for this event
    let invitation: InvitationsResponse = match sqlx::query_as!(
        InvitationsResponse,
        r#"SELECT event_id, email, 'https://www.gravatar.com/avatar/' || MD5(LOWER(email)) || '?d=robohash' AS avatar_url, handle, invited_at, responded_at, response AS "response: _", attendance, last_modified
        FROM invitation
        WHERE event_id=$1 AND email=$2"#,
        event_id,
        user.email,
    )
    .fetch_one(pool.inner())
    .await
    {
        Ok(invitation) => invitation,
        Err(_) => {
            return Err(rocket::response::status::BadRequest(Some(
                "Error getting database ID".to_string(),
            )))
        }
    };

    Ok(Json(invitation))
}

#[openapi(tag = "Event Invitations")]
#[get("/events/<event_id>/invitations?<_as_admin>", format = "json")]
pub async fn get_all(
    event_id: i32,
    pool: &State<PgPool>,
    _as_admin: Option<bool>,
    _user: AdminUser,
) -> Result<Json<Vec<InvitationsResponse>>, rocket::response::status::BadRequest<String>> {
    // Return all invitations
    let invitations: Vec<InvitationsResponse> = match sqlx::query_as!(
        InvitationsResponse,
        r#"SELECT event_id, email, 'https://www.gravatar.com/avatar/' || MD5(LOWER(email)) || '?d=robohash' AS avatar_url, handle, invited_at, responded_at, response AS "response: _", attendance, last_modified
        FROM invitation
        WHERE event_id=$1"#,
        event_id
    )
    .fetch_all(pool.inner())
    .await
    {
        Ok(events) => events,
        Err(_) => {
            return Err(rocket::response::status::BadRequest(Some(
                "Error getting database ID".to_string(),
            )))
        }
    };

    Ok(Json(invitations))
}

#[derive(Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct InvitationsResponseLite {
    event_id: i32,
    avatar_url: Option<String>,
    handle: Option<String>,
    response: Option<InvitationResponse>,
    attendance: Option<Vec<u8>>,
    last_modified: DateTime<Utc>,
}

#[openapi(tag = "Event Invitations")]
#[get("/events/<event_id>/invitations", format = "json", rank = 2)]
pub async fn get_all_user(
    event_id: i32,
    pool: &State<PgPool>,
    user: User,
) -> Result<Json<Vec<InvitationsResponseLite>>, rocket::response::status::BadRequest<String>> {
    match is_attending_event(pool.inner(), event_id, user.email).await {
        Err(e) => Err(rocket::response::status::BadRequest(Some(e))),
        Ok(false) => Err(rocket::response::status::BadRequest(Some(
            "You can only see invitations for events you have RSVP'd to".to_string(),
        ))),
        Ok(true) => {
            // Return all invitations for this event
            let invitations: Vec<InvitationsResponseLite> = match sqlx::query_as!(
                InvitationsResponseLite,
                r#"SELECT event_id, 'https://www.gravatar.com/avatar/' || MD5(LOWER(email)) || '?d=robohash' AS avatar_url, handle, response AS "response: _", attendance, last_modified
                FROM invitation
                WHERE event_id=$1 AND response IN ('yes', 'maybe')"#,
                event_id,
            )
            .fetch_all(pool.inner())
            .await
            {
                Ok(invitations) => invitations,
                Err(_) => {
                    return Err(rocket::response::status::BadRequest(Some(
                        "Error getting database ID".to_string(),
                    )))
                }
            };

            Ok(Json(invitations))
        }
    }
}

#[openapi(tag = "Event Invitations")]
#[delete("/events/<event_id>/invitations/<email>?<_as_admin>", format = "json")]
pub async fn delete(
    event_id: i32,
    email: String,
    pool: &State<PgPool>,
    _as_admin: Option<bool>,
    _user: AdminUser,
) -> Result<rocket::response::status::NoContent, rocket::response::status::BadRequest<String>> {
    // Delete the event
    match sqlx::query!(
        "DELETE FROM invitation
        WHERE event_id = $1
        AND email = $2",
        event_id,
        email,
    )
    .execute(pool.inner())
    .await
    {
        Ok(_) => Ok(rocket::response::status::NoContent),
        Err(_) => Err(rocket::response::status::BadRequest(Some(
            "Error getting database ID".to_string(),
        ))),
    }
}

#[derive(Serialize, Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde")]
#[schemars(example = "Self::example")]
pub struct InvitationsPatchRequest {
    pub handle: String,
    pub response: InvitationResponse,
    pub attendance: Option<Vec<u8>>,
}

impl SchemaExample for InvitationsPatchRequest {
    fn example() -> Self {
        Self {
            handle: "FPS Doug".to_string(),
            response: InvitationResponse::Yes,
            attendance: Some(vec![0, 1, 1, 0]),
        }
    }
}

custom_errors!(InvitationsPatchError, Unauthorized, InternalServerError);

#[openapi(tag = "Event Invitations")]
#[patch(
    "/events/<event_id>/invitations/<email>",
    format = "json",
    data = "<invitation_request>"
)]
pub async fn patch(
    event_id: i32,
    email: String,
    invitation_request: Json<InvitationsPatchRequest>,
    pool: &State<PgPool>,
    user: User,
) -> Result<rocket::response::status::NoContent, InvitationsPatchError> {
    if user.email != email {
        return Err(InvitationsPatchError::Unauthorized(
            "You can only respond to invitations for your own email address".to_string(),
        ));
    }

    match event_invitation::respond(pool, event_id, email, invitation_request.into_inner()).await {
        Ok(()) => Ok(rocket::response::status::NoContent),
        Err(Error::NotPermitted(e)) => Err(InvitationsPatchError::Unauthorized(e)),
        Err(e) => Err(InvitationsPatchError::InternalServerError(format!(
            "Error getting event, due to: {}",
            e
        ))),
    }
}
