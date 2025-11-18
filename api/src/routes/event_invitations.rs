use crate::{
    auth::{AdminUser, User},
    controllers::{event_invitation, Error},
    util::{is_attending_event, send_email_bcc, send_preauth_email, PreauthEmailDetails},
};
use chrono::{prelude::Utc, DateTime, Duration};
use resend_rs::Resend;
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
use sqlx::postgres::PgPool;

use crate::repositories::event;

use super::SchemaExample;

#[derive(Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct InvitationsPostRequest {
    email: String,
}

#[derive(Debug, Clone, sqlx::Type, Deserialize, Serialize, JsonSchema, PartialEq, Eq)]
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
    sender: &State<Resend>,
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
            return Err(rocket::response::status::BadRequest(
                "Error getting database ID".to_string(),
            ))
        }
    };

    //Get event details
    let event = match event::filter(
        pool.inner(),
        event::Filter {
            ids: Some(vec![event_id]),
        },
    )
    .await
    {
        Ok(event) => {
            if event.len() != 1 {
                return Err(rocket::response::status::BadRequest(
                    "Too many events returned for ID".to_string(),
                ));
            }

            event[0].clone()
        }
        Err(_) => {
            return Err(rocket::response::status::BadRequest(
                "Error getting database ID".to_string(),
            ))
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
        address: invitation_request.email.to_string(),
        subject: format!("{} - caLANdar Invitation", event.title),
        template: "email_invitation.html.tera".to_string(),
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
        Ok(()) => (),
        Err(_) => {
            return Err(rocket::response::status::BadRequest(
                "Error sending invitation email".to_string(),
            ))
        }
    }

    Ok(
        status::Created::new("/events/".to_string() + &invitation.event_id.to_string())
            .body(Json(invitation)),
    )
}

#[allow(clippy::too_many_arguments)]
#[openapi(tag = "Event Invitations")]
#[post(
    "/events/<event_id>/invitations/<email>/resend?<_as_admin>",
    format = "json"
)]
pub async fn resend(
    event_id: i32,
    email: String,
    pool: &State<PgPool>,
    key: &State<PasetoSymmetricKey<V4, Local>>,
    sender: &State<Resend>,
    tera: &State<Tera>,
    _as_admin: Option<bool>,
    _user: AdminUser,
) -> Result<rocket::response::status::NoContent, rocket::response::status::BadRequest<String>> {
    // Check that the invitation exists and hasn't been responded to
    let invitation: InvitationsResponse = match sqlx::query_as!(
        InvitationsResponse,
        r#"SELECT event_id, email, 'https://www.gravatar.com/avatar/' || MD5(LOWER(email)) || '?d=robohash' AS avatar_url, handle, invited_at, responded_at, response AS "response: _", attendance, last_modified
        FROM invitation
        WHERE event_id=$1 AND LOWER(email) = LOWER($2)"#,
        event_id,
        email,
    )
    .fetch_one(pool.inner())
    .await
    {
        Ok(invitation) => invitation,
        Err(_) => {
            return Err(rocket::response::status::BadRequest(
                "Invitation not found".to_string(),
            ))
        }
    };

    // Check if the user has already responded
    if invitation.response.is_some() {
        return Err(rocket::response::status::BadRequest(
            "Cannot resend invitation to someone who has already responded".to_string(),
        ));
    }

    // Get event details
    let event = match event::filter(
        pool.inner(),
        event::Filter {
            ids: Some(vec![event_id]),
        },
    )
    .await
    {
        Ok(event) => {
            if event.len() != 1 {
                return Err(rocket::response::status::BadRequest(
                    "Too many events returned for ID".to_string(),
                ));
            }

            event[0].clone()
        }
        Err(_) => {
            return Err(rocket::response::status::BadRequest(
                "Error getting event details".to_string(),
            ))
        }
    };

    let mut context = Context::new();
    context.insert("name", &email);
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
        address: email.to_string(),
        subject: format!("{} - caLANdar Invitation", event.title),
        template: "email_invitation.html.tera".to_string(),
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
        Ok(()) => Ok(rocket::response::status::NoContent),
        Err(_) => Err(rocket::response::status::BadRequest(
            "Error sending invitation email".to_string(),
        )),
    }
}

#[openapi(tag = "Event Invitations")]
#[get("/events/<event_id>/invitations/<email>", format = "json")]
pub async fn get(
    event_id: i32,
    email: String,
    pool: &State<PgPool>,
    user: User,
) -> Result<Json<InvitationsResponse>, rocket::response::status::BadRequest<String>> {
    log::info!("Getting invitation details for email: {email}");
    if user.email != email {
        return Err(rocket::response::status::BadRequest(
            "You can only respond to invitations for your own email address".to_string(),
        ));
    }

    // Return your invitation for this event
    let invitation: InvitationsResponse = match sqlx::query_as!(
        InvitationsResponse,
        r#"SELECT event_id, email, 'https://www.gravatar.com/avatar/' || MD5(LOWER(email)) || '?d=robohash' AS avatar_url, handle, invited_at, responded_at, response AS "response: _", attendance, last_modified
        FROM invitation
        WHERE event_id=$1 AND LOWER(email) = LOWER($2)"#,
        event_id,
        user.email,
    )
    .fetch_one(pool.inner())
    .await
    {
        Ok(invitation) => invitation,
        Err(_) => {
            return Err(rocket::response::status::BadRequest(
                "Error getting database ID".to_string(),
            ))
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
            return Err(rocket::response::status::BadRequest(
                "Error getting database ID".to_string(),
            ))
        }
    };

    Ok(Json(invitations))
}

#[derive(Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct InvitationsResponseLite {
    pub event_id: i32,
    pub avatar_url: Option<String>,
    pub handle: Option<String>,
    pub response: Option<InvitationResponse>,
    pub attendance: Option<Vec<u8>>,
    pub seat_id: Option<i32>,
    pub last_modified: DateTime<Utc>,
}

#[openapi(tag = "Event Invitations")]
#[get("/events/<event_id>/invitations", format = "json", rank = 2)]
pub async fn get_all_user(
    event_id: i32,
    pool: &State<PgPool>,
    user: User,
) -> Result<Json<Vec<InvitationsResponseLite>>, rocket::response::status::BadRequest<String>> {
    match is_attending_event(pool.inner(), event_id, user.email).await {
        Err(e) => Err(rocket::response::status::BadRequest(e)),
        Ok(false) => Err(rocket::response::status::BadRequest(
            "You can only see invitations for events you have RSVP'd to".to_string(),
        )),
        Ok(true) => {
            // Return all invitations for this event with their seat reservations
            let invitations: Vec<InvitationsResponseLite> = match sqlx::query_as!(
                InvitationsResponseLite,
                r#"SELECT
                    i.event_id,
                    'https://www.gravatar.com/avatar/' || MD5(LOWER(i.email)) || '?d=robohash' AS avatar_url,
                    i.handle,
                    i.response AS "response: _",
                    i.attendance,
                    sr.seat_id,
                    i.last_modified
                FROM invitation i
                LEFT JOIN seat_reservation sr ON i.event_id = sr.event_id AND i.email = sr.invitation_email
                WHERE i.event_id=$1 AND i.response IN ('yes', 'maybe')"#,
                event_id,
            )
            .fetch_all(pool.inner())
            .await
            {
                Ok(invitations) => invitations,
                Err(_) => {
                    return Err(rocket::response::status::BadRequest(
                        "Error getting database ID".to_string(),
                    ))
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
        AND LOWER(email) = LOWER($2)",
        event_id,
        email,
    )
    .execute(pool.inner())
    .await
    {
        Ok(_) => Ok(rocket::response::status::NoContent),
        Err(_) => Err(rocket::response::status::BadRequest(
            "Error getting database ID".to_string(),
        )),
    }
}

#[derive(Serialize, Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde")]
#[schemars(example = "Self::example")]
pub struct InvitationsPatchRequest {
    pub handle: Option<String>,
    pub response: InvitationResponse,
    pub attendance: Option<Vec<u8>>,
}

impl SchemaExample for InvitationsPatchRequest {
    fn example() -> Self {
        Self {
            handle: Some("FPS Doug".to_string()),
            response: InvitationResponse::Yes,
            attendance: Some(vec![0, 1, 1, 0]),
        }
    }
}

custom_errors!(InvitationsPatchError, Unauthorized, InternalServerError);

#[openapi(tag = "Event Invitations")]
#[patch(
    "/events/<event_id>/invitations/<email>?<_as_admin>",
    format = "json",
    data = "<invitation_request>",
    rank = 1
)]
pub async fn patch_admin(
    event_id: i32,
    email: String,
    invitation_request: Json<InvitationsPatchRequest>,
    pool: &State<PgPool>,
    _as_admin: Option<bool>, // Required for route matching but unused - triggers AdminUser guard
    _user: AdminUser,
) -> Result<rocket::response::status::NoContent, InvitationsPatchError> {
    match event_invitation::respond(pool, event_id, email, invitation_request.into_inner(), true)
        .await
    {
        Ok(()) => Ok(rocket::response::status::NoContent),
        Err(Error::NotPermitted(e)) => Err(InvitationsPatchError::Unauthorized(e)),
        Err(e) => Err(InvitationsPatchError::InternalServerError(format!(
            "Error responding to invitation, due to: {e}"
        ))),
    }
}

#[openapi(tag = "Event Invitations")]
#[patch(
    "/events/<event_id>/invitations/<email>",
    format = "json",
    data = "<invitation_request>",
    rank = 2
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

    match event_invitation::respond(
        pool,
        event_id,
        email,
        invitation_request.into_inner(),
        false,
    )
    .await
    {
        Ok(()) => Ok(rocket::response::status::NoContent),
        Err(Error::NotPermitted(e)) => Err(InvitationsPatchError::Unauthorized(e)),
        Err(e) => Err(InvitationsPatchError::InternalServerError(format!(
            "Error responding to invitation, due to: {e}"
        ))),
    }
}

#[derive(Deserialize, Serialize, JsonSchema, Debug)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub enum EmailRecipientFilter {
    All,
    RsvpYes,
    RsvpYesMaybe,
    NotResponded,
}

#[derive(Deserialize, Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
#[schemars(example = "Self::example")]
pub struct SendCustomEmailRequest {
    pub filter: EmailRecipientFilter,
    pub subject: String,
    pub message: String,
}

impl SchemaExample for SendCustomEmailRequest {
    fn example() -> Self {
        Self {
            filter: EmailRecipientFilter::RsvpYes,
            subject: "Event Update".to_string(),
            message: "Just a reminder about the upcoming event!".to_string(),
        }
    }
}

custom_errors!(
    SendCustomEmailError,
    Unauthorized,
    BadRequest,
    InternalServerError
);

#[openapi(tag = "Event Invitations")]
#[post(
    "/events/<event_id>/email?<_as_admin>",
    format = "json",
    data = "<email_request>"
)]
pub async fn send_custom_email(
    event_id: i32,
    email_request: Json<SendCustomEmailRequest>,
    pool: &State<PgPool>,
    sender: &State<Resend>,
    tera: &State<Tera>,
    _as_admin: Option<bool>,
    _user: AdminUser,
) -> Result<rocket::response::status::NoContent, SendCustomEmailError> {
    // Get the event details
    let event = match event::filter(
        pool.inner(),
        event::Filter {
            ids: Some(vec![event_id]),
        },
    )
    .await
    {
        Ok(events) => {
            if events.len() != 1 {
                return Err(SendCustomEmailError::BadRequest(
                    "Event not found".to_string(),
                ));
            }
            events[0].clone()
        }
        Err(_) => {
            return Err(SendCustomEmailError::InternalServerError(
                "Error getting event".to_string(),
            ))
        }
    };

    // Get all invitations for this event
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
        Ok(invitations) => invitations,
        Err(_) => {
            return Err(SendCustomEmailError::InternalServerError(
                "Error getting invitations".to_string(),
            ))
        }
    };

    // Filter invitations based on the requested filter
    let filtered_invitations: Vec<&InvitationsResponse> = invitations
        .iter()
        .filter(|invitation| match &email_request.filter {
            EmailRecipientFilter::All => true,
            EmailRecipientFilter::RsvpYes => invitation.response == Some(InvitationResponse::Yes),
            EmailRecipientFilter::RsvpYesMaybe => matches!(
                invitation.response,
                Some(InvitationResponse::Yes | InvitationResponse::Maybe)
            ),
            EmailRecipientFilter::NotResponded => invitation.response.is_none(),
        })
        .collect();

    if filtered_invitations.is_empty() {
        return Err(SendCustomEmailError::BadRequest(format!(
            "No invitations match the selected filter: {:?}",
            email_request.filter
        )));
    }

    // Prepare the email context
    let mut context = Context::new();
    context.insert("title", &event.title);
    context.insert(
        "time_begin",
        &event.time_begin.format("%a %e %b %Y %H:%M").to_string(),
    );
    context.insert(
        "time_end",
        &event.time_end.format("%a %e %b %Y %H:%M").to_string(),
    );
    context.insert("message", &email_request.message);
    context.insert("subject", &email_request.subject);

    // Render the email body
    let body = match tera.render("email_custom.html.tera", &context) {
        Ok(body) => body,
        Err(e) => {
            return Err(SendCustomEmailError::InternalServerError(format!(
                "Error rendering email: {e}"
            )))
        }
    };

    // Send emails to all filtered recipients using BCC
    // This ensures recipients don't see each other's email addresses
    let recipient_emails: Vec<&str> = filtered_invitations
        .iter()
        .map(|inv| inv.email.as_str())
        .collect();

    match send_email_bcc(
        sender,
        recipient_emails,
        email_request.subject.as_str(),
        body.as_str(),
    )
    .await
    {
        Ok(()) => Ok(rocket::response::status::NoContent),
        Err(e) => Err(SendCustomEmailError::InternalServerError(format!(
            "Error sending email: {e}"
        ))),
    }
}
