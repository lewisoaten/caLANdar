use chrono::{prelude::Utc, Duration};
use resend_rs::{types::CreateEmailBaseOptions, Resend};
use rocket_dyn_templates::tera::{Context, Tera};
use rusty_paseto::prelude::*;
use sqlx::PgPool;

use crate::{
    controllers::event,
    routes::{
        event_invitations::{InvitationResponse, InvitationsResponse},
        events::Event,
    },
};

pub async fn send_email(
    sender: &Resend,
    tos: Vec<&str>,
    subject: &str,
    body: &str,
) -> Result<(), String> {
    let from = "CaLANdar <lewis+calandar@updates.oaten.name>";
    let reply_to = "lewis+calandar@oaten.name";

    let email = CreateEmailBaseOptions::new(from, tos.clone(), subject)
        .with_reply(reply_to)
        .with_html(body);

    match sender.emails.send(email).await {
        Ok(_response) => Ok(()),
        Err(e) => {
            // Try to log more details if possible
            eprintln!("Resend error: {e:?}");
            Err(format!("Resend error: {e}"))
        }
    }
}

pub async fn send_email_bcc(
    sender: &Resend,
    bccs: Vec<&str>,
    subject: &str,
    body: &str,
) -> Result<(), String> {
    let from = "CaLANdar <lewis+calandar@updates.oaten.name>";
    let reply_to = "lewis+calandar@oaten.name";

    // Send to the from address so there's a valid "to" recipient
    // All actual recipients are in BCC to hide email addresses from each other
    let mut email = CreateEmailBaseOptions::new(from, vec![from], subject)
        .with_reply(reply_to)
        .with_html(body);

    // Add each BCC recipient individually
    for bcc in bccs {
        email = email.with_bcc(bcc);
    }

    match sender.emails.send(email).await {
        Ok(_response) => Ok(()),
        Err(e) => {
            // Try to log more details if possible
            eprintln!("Resend error: {e:?}");
            Err(format!("Resend error: {e}"))
        }
    }
}

pub struct PreauthEmailDetails {
    pub address: String,
    pub subject: String,
    pub template: String,
}

pub async fn send_preauth_email(
    email: PreauthEmailDetails,
    template_context: &mut Context,
    redirect: &str,
    token_timeout: Duration,
    key: &PasetoSymmetricKey<V4, Local>,
    sender: &Resend,
    tera: &Tera,
) -> Result<(), String> {
    let Ok(expiration_claim) = ExpirationClaim::try_from((Utc::now() + token_timeout).to_rfc3339())
    else {
        return Err("Can't create time for expiration claim".to_string());
    };

    let Ok(redirect_claim) = CustomClaim::try_from((String::from("r"), redirect.to_string()))
    else {
        return Err("Can't create redirect claim".to_string());
    };

    // use a default token builder with the same PASETO version and purpose
    let Ok(token) = PasetoBuilder::<V4, Local>::default()
        .set_claim(expiration_claim)
        .set_claim(IssuerClaim::from("calandar.org"))
        .set_claim(TokenIdentifierClaim::from("ev"))
        .set_claim(SubjectClaim::from(email.address.as_str()))
        .set_claim(redirect_claim)
        .build(key)
    else {
        return Err("Error building token".to_string());
    };

    template_context.insert("token", &token);

    let body = match tera.render(email.template.as_str(), template_context) {
        Ok(body) => body,
        Err(e) => {
            return Err(format!("Error rendering email with: {e}"));
        }
    };

    match send_email(
        sender,
        vec![email.address.as_str()],
        email.subject.as_str(),
        body.as_str(),
    )
    .await
    {
        Ok(()) => Ok(()),
        Err(e) => Err(format!("Error sending email: {e}")),
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
        WHERE event_id = $1 AND LOWER(email) = LOWER($2)"#,
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
    let Ok(event) = event::get(pool, id).await else {
        return Err("Can't get event".to_string());
    };

    let is_active = event.time_end > Utc::now();

    Ok((is_active, event))
}
