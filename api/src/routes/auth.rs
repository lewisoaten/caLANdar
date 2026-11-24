use chrono::{prelude::Utc, Duration};
use resend_rs::Resend;
use rocket::{
    post,
    serde::{json, json::Json, Deserialize, Serialize},
    State,
};
use rocket_dyn_templates::tera::{Context, Tera};
use rocket_okapi::okapi::schemars;
use rocket_okapi::okapi::schemars::JsonSchema;
use rocket_okapi::openapi;
use rusty_paseto::prelude::*;

use crate::auth::PasetoToken;
use crate::login_guard::{ClientMeta, LoginLimiter, Turnstile, TurnstileError};
use crate::repositories::login_token;

use crate::util::{send_preauth_email, PreauthEmailDetails};

#[derive(Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct LoginResponse {}

#[derive(Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct LoginRequest {
    email: String,
    redirect: Option<String>,
    /// Cloudflare Turnstile token; required once `TURNSTILE_SECRET_KEY` is set.
    turnstile_token: Option<String>,
}

custom_errors!(LoginError, BadRequest, TooManyRequests);

#[openapi(tag = "Auth")]
#[post("/login", format = "json", data = "<login_request>")]
#[allow(clippy::too_many_arguments)]
pub async fn login(
    login_request: Json<LoginRequest>,
    client: ClientMeta,
    pool: &State<sqlx::PgPool>,
    limiter: &State<LoginLimiter>,
    turnstile: &State<Turnstile>,
    key: &State<PasetoSymmetricKey<V4, Local>>,
    sender: &State<Resend>,
    tera: &State<Tera>,
) -> Result<Json<LoginResponse>, LoginError> {
    let email = crate::util::normalise_email(&login_request.email);
    crate::util::validate_email(&email).map_err(LoginError::BadRequest)?;

    let throttled = |limited: &crate::login_guard::Limited| {
        log::warn!(
            "login throttled for {email} from {:?} ({:?}), retry in {}s",
            client.ip,
            client.user_agent,
            limited.retry_after.as_secs()
        );
        LoginError::TooManyRequests(
            "Too many sign-in attempts. Please wait a while and try again.".to_string(),
        )
    };

    // Turn away callers who are already over a limit before spending a
    // Turnstile round trip. This only looks: quota is spent further down, once
    // the caller has proven they are human, so a script that cannot solve the
    // CAPTCHA can't lock anyone out or use up the shared allowance.
    limiter
        .peek(&email, client.ip.as_deref())
        .map_err(|l| throttled(&l))?;

    match turnstile
        .verify(
            login_request.turnstile_token.as_deref(),
            client.ip.as_deref(),
        )
        .await
    {
        Ok(()) => {}
        Err(TurnstileError::Missing | TurnstileError::Rejected) => {
            log::warn!(
                "login CAPTCHA failed for {email} from {:?} ({:?})",
                client.ip,
                client.user_agent
            );
            return Err(LoginError::BadRequest(
                "Could not verify you are human. Please refresh and try again.".to_string(),
            ));
        }
        Err(TurnstileError::Unavailable) => {
            return Err(LoginError::BadRequest(
                "Could not verify you are human right now. Please try again shortly.".to_string(),
            ));
        }
    }

    // Re-check and record together, so two concurrent requests can't both
    // slip under a limit that only has room for one.
    limiter
        .check(&email, client.ip.as_deref())
        .map_err(|l| throttled(&l))?;

    let mut context = Context::new();
    context.insert("name", &email);

    let redirect = login_request
        .redirect
        .as_ref()
        .map_or("", |redirect| redirect);

    let email_details = PreauthEmailDetails {
        address: email.clone(),
        subject: "Calandar Email Verification".to_string(),
        template: "email_verification.html.tera".to_string(),
        single_use: true,
    };

    match send_preauth_email(
        email_details,
        &mut context,
        redirect,
        Duration::minutes(30),
        key,
        sender,
        tera,
    )
    .await
    {
        Ok(()) => {
            crate::util::log_audit_from(pool, &client, Some(email), "auth.login_requested", None)
                .await;
            Ok(Json(LoginResponse {}))
        }
        Err(e) => {
            // The cause (Resend, templating) is for our logs, not the caller.
            log::error!("Error sending login email: {e}");
            Err(LoginError::BadRequest(
                "Could not send the login email. Please try again.".to_string(),
            ))
        }
    }
}

#[derive(Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct VerifyEmailRequest {
    token: String,
}

#[derive(Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct VerifyEmailResponse {
    token: String,
    email: String,
    redirect: String,
    is_admin: bool,
}

#[allow(clippy::needless_pass_by_value)]
#[openapi(tag = "Auth")]
#[post("/verify-email", format = "json", data = "<verify_email_request>")]
pub async fn verify_email(
    verify_email_request: Json<VerifyEmailRequest>,
    client: ClientMeta,
    key: &State<PasetoSymmetricKey<V4, Local>>,
    pool: &State<sqlx::PgPool>,
) -> Result<Json<VerifyEmailResponse>, rocket::response::status::BadRequest<String>> {
    // decode and verify token is a valid email verification token, and has not expired

    let Ok(generic_token) = PasetoParser::<V4, Local>::default()
        .check_claim(IssuerClaim::from("calandar.org"))
        .check_claim(TokenIdentifierClaim::from("ev"))
        .parse(&verify_email_request.token, key)
    else {
        // Expired or forged: we can't tell whose, so this goes to the logs
        // rather than the audit table, which anyone could otherwise fill.
        log::warn!(
            "sign-in link rejected (invalid or expired) from {:?} ({:?})",
            client.ip,
            client.user_agent
        );
        return Err(rocket::response::status::BadRequest(
            "Error parsing token".to_string(),
        ));
    };

    let typed_token: PasetoToken = match json::from_value(generic_token) {
        Ok(typed_token) => typed_token,
        Err(_) => {
            return Err(rocket::response::status::BadRequest(
                "Can't parse PASETO token to types".to_string(),
            ))
        }
    };

    // Verification links sent before sign-in normalised the address still
    // carry it as typed.
    let email = crate::util::normalise_email(&typed_token.sub);

    // Sign-in links can be spent once. (Invitation links are reusable, and
    // tokens issued before this check carry no flag; both expire on their own.)
    if typed_token.su.as_deref() == Some("1") {
        match login_token::consume(pool, &verify_email_request.token).await {
            Ok(true) => {}
            Ok(false) => {
                log::warn!(
                    "sign-in link for {email} reused from {:?} ({:?})",
                    client.ip,
                    client.user_agent
                );
                crate::util::log_audit_from(
                    pool,
                    &client,
                    Some(email),
                    "auth.login_failed",
                    Some(json::json!({ "reason": "link_already_used" })),
                )
                .await;
                return Err(rocket::response::status::BadRequest(
                    "This sign-in link has already been used. Request a new one.".to_string(),
                ));
            }
            Err(e) => {
                log::error!("Could not record sign-in link use: {e}");
                return Err(rocket::response::status::BadRequest(
                    "Could not complete sign-in. Please try again.".to_string(),
                ));
            }
        }
    }

    // create a new long-lasting token for the user for subsequent api requests
    let Ok(expiration_claim) =
        ExpirationClaim::try_from((Utc::now() + Duration::days(7)).to_rfc3339())
    else {
        return Err(rocket::response::status::BadRequest(
            "Can't create time for expiration claim".to_string(),
        ));
    };

    let Ok(token) = PasetoBuilder::<V4, Local>::default()
        .set_claim(expiration_claim)
        .set_claim(IssuerClaim::from("calandar.org"))
        .set_claim(TokenIdentifierClaim::from("api"))
        .set_claim(SubjectClaim::from(email.as_str()))
        .build(key)
    else {
        return Err(rocket::response::status::BadRequest(
            "Error building token".to_string(),
        ));
    };

    // Also specified in `fn authorise_paseto_header`
    let is_admin = crate::auth::is_admin(&email);

    // Log successful login
    crate::util::log_audit_from(pool, &client, Some(email.clone()), "auth.login", None).await;

    Ok(Json(VerifyEmailResponse {
        token,
        email,
        redirect: typed_token.r.unwrap_or_default(),
        is_admin,
    }))
}
