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

use crate::util::{send_preauth_email, PreauthEmailDetails};

#[derive(Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct LoginResponse {}

#[derive(Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct LoginRequest {
    email: String,
    redirect: Option<String>,
}

#[openapi(tag = "Auth")]
#[post("/login", format = "json", data = "<login_request>")]
pub async fn login(
    login_request: Json<LoginRequest>,
    key: &State<PasetoSymmetricKey<V4, Local>>,
    sender: &State<Resend>,
    tera: &State<Tera>,
) -> Result<Json<LoginResponse>, rocket::response::status::BadRequest<String>> {
    let mut context = Context::new();
    context.insert("name", &login_request.email);

    let redirect = login_request
        .redirect
        .as_ref()
        .map_or("", |redirect| redirect);

    let email_details = PreauthEmailDetails {
        address: login_request.email.to_string(),
        subject: "Calandar Email Verification".to_string(),
        template: "email_verification.html.tera".to_string(),
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
        Ok(()) => Ok(Json(LoginResponse {})),
        Err(e) => Err(rocket::response::status::BadRequest(format!(
            "Error sending login email due to: {e}"
        ))),
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
pub fn verify_email(
    verify_email_request: Json<VerifyEmailRequest>,
    key: &State<PasetoSymmetricKey<V4, Local>>,
) -> Result<Json<VerifyEmailResponse>, rocket::response::status::BadRequest<String>> {
    // decode and verify token is a valid email verification token, and has not expired

    let Ok(generic_token) = PasetoParser::<V4, Local>::default()
        .check_claim(IssuerClaim::from("calandar.org"))
        .check_claim(TokenIdentifierClaim::from("ev"))
        .parse(&verify_email_request.token, key)
    else {
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
        .set_claim(SubjectClaim::from(typed_token.sub.as_str()))
        .build(key)
    else {
        return Err(rocket::response::status::BadRequest(
            "Error building token".to_string(),
        ));
    };

    // Also specified in `fn authorise_paseto_header`
    let admins = ["lewis@oaten.name", "marshallx7a@gmail.com"];

    let is_admin = admins.contains(&typed_token.sub.to_lowercase().as_str());

    Ok(Json(VerifyEmailResponse {
        token,
        email: typed_token.sub,
        redirect: typed_token.r.unwrap_or_default(),
        is_admin,
    }))
}
