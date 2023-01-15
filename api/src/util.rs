use chrono::{prelude::Utc, Duration};
use rocket_dyn_templates::tera::{Context, Tera};
use rusty_paseto::prelude::*;
use sendgrid::v3::{Content, Email as SendGridEmail, Message, Personalization, Sender};
use sqlx::PgPool;

use crate::{
    controllers::event,
    routes::{
        event_invitations::{InvitationResponse, InvitationsResponse},
        events::Event,
    },
};

pub async fn send_email(
    sender: &Sender,
    tos: Vec<&str>,
    subject: &str,
    body: &str,
) -> Result<(), String> {
    let personalization = {
        let mut p = Personalization::new(SendGridEmail::new(tos[0].to_string()));
        for to in tos.iter().skip(1) {
            p = p.add_to(SendGridEmail::new(*to));
        }
        p
    };

    let m = Message::new(SendGridEmail::new("lewis+calandar@oaten.name"))
        .set_subject(subject)
        .add_content(Content::new().set_content_type("text/html").set_value(body))
        .add_personalization(personalization);

    match sender.send(&m).await {
        Ok(sendgrid_result) => {
            if sendgrid_result.status().is_success() {
                Ok(())
            } else {
                Err("Sendgrid error".to_string())
            }
        }
        Err(e) => Err(format!("Sendgrid error: {e}")),
    }
}

pub struct PreauthEmailDetails {
    pub email_address: String,
    pub email_subject: String,
    pub email_template: String,
}

pub async fn send_preauth_email(
    email: PreauthEmailDetails,
    template_context: &mut Context,
    redirect: &str,
    token_timeout: Duration,
    key: &PasetoSymmetricKey<V4, Local>,
    sender: &Sender,
    tera: &Tera,
) -> Result<(), String> {
    let expiration_claim =
        match ExpirationClaim::try_from((Utc::now() + token_timeout).to_rfc3339()) {
            Ok(expiration_claim) => expiration_claim,
            Err(_) => {
                return Err("Can't create time for expiration claim".to_string());
            }
        };

    let redirect_claim = match CustomClaim::try_from((String::from("r"), redirect.to_string())) {
        Ok(redirect_claim) => redirect_claim,
        Err(_) => {
            return Err("Can't create redirect claim".to_string());
        }
    };

    // use a default token builder with the same PASETO version and purpose
    let token = match PasetoBuilder::<V4, Local>::default()
        .set_claim(expiration_claim)
        .set_claim(IssuerClaim::from("calandar.org"))
        .set_claim(TokenIdentifierClaim::from("ev"))
        .set_claim(SubjectClaim::from(email.email_address.as_str()))
        .set_claim(redirect_claim)
        .build(key)
    {
        Ok(token) => token,
        Err(_) => {
            return Err("Error building token".to_string());
        }
    };

    template_context.insert("token", &token);

    let body = match tera.render(email.email_template.as_str(), template_context) {
        Ok(body) => body,
        Err(e) => {
            return Err(format!("Error rendering email with: {e}"));
        }
    };

    match send_email(
        sender,
        vec![email.email_address.as_str()],
        email.email_subject.as_str(),
        body.as_str(),
    )
    .await
    {
        Ok(_) => Ok(()),
        Err(_) => Err("Error sending email".to_string()),
    }
}

pub async fn is_attending_event(
    pool: &PgPool,
    event_id: i32,
    email: String,
) -> Result<bool, String> {
    // Check that the user has RSVP'd to this event
    let invitation: InvitationsResponse = match sqlx::query_as!(
        InvitationsResponse,
        r#"SELECT event_id, email, 'https://www.gravatar.com/avatar/' || MD5(LOWER(email)) || '?d=robohash' AS avatar_url, handle, invited_at, responded_at, response AS "response: _", attendance, last_modified
        FROM invitation
        WHERE event_id=$1 AND email=$2"#,
        event_id,
        email,
    )
    .fetch_one(pool)
    .await
    {
        Ok(invitation) => invitation,
        Err(_) => {
            return Err("Can't get logged-in users RSVP for the event".to_string())
        }
    };

    Ok(matches!(
        invitation.response,
        Some(InvitationResponse::Yes | InvitationResponse::Maybe)
    ))
}

pub async fn is_event_active(pool: &PgPool, id: i32) -> Result<(bool, Event), String> {
    // Get the event based on id and return a tuple of Event and the boolean whether it is in the future
    let event = match event::get(pool, id).await {
        Ok(event) => event,
        Err(_) => return Err("Can't get event".to_string()),
    };

    let is_active = event.time_end > Utc::now();

    Ok((is_active, event))
}
