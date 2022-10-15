extern crate rocket;

use anyhow::anyhow;
use chrono::{prelude::Utc, DateTime, Duration};
use rocket::{
    delete,
    fairing::{Fairing, Info, Kind},
    get,
    http::Header,
    options, post,
    request::{self, FromRequest, Outcome},
    response::status,
    routes,
    serde::{json, json::Json, Deserialize, Serialize},
    Request, Response, State,
};
use rocket_okapi::okapi::openapi3::{
    Object, SecurityRequirement, SecurityScheme, SecuritySchemeData,
};
use rocket_okapi::okapi::schemars;
use rocket_okapi::okapi::schemars::JsonSchema;
use rocket_okapi::{
    gen::OpenApiGenerator,
    openapi, openapi_get_routes,
    request::{OpenApiFromRequest, RequestHeaderInput},
    swagger_ui::{make_swagger_ui, SwaggerUIConfig},
};
use rusty_paseto::prelude::*;
use sendgrid::v3::{Content, Email as SendGridEmail, Message, Personalization, Sender};
use shuttle_secrets::SecretStore;
use shuttle_service::ShuttleRocket;
use sqlx::postgres::PgPool;

#[derive(Debug)]
pub enum UserError {
    TokenError,
    MissingToken,
    DatabasePoolError,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(crate = "rocket::serde")]
struct PasetoToken {
    exp: String,
    iat: String,
    nbf: String,
    sub: String,
}

fn authorise_paseto_header(
    key: &PasetoSymmetricKey<V4, Local>,
    authorization_header: &str,
    must_be_admin: bool,
) -> Result<String, UserError> {
    match authorization_header.strip_prefix("Bearer ") {
        Some(token) => {
            let generic_token = match PasetoParser::<V4, Local>::default()
                .check_claim(IssuerClaim::from("calandar.org"))
                .check_claim(TokenIdentifierClaim::from("api"))
                .parse(token, key)
            {
                Ok(generic_token) => generic_token,
                Err(_) => {
                    return Err(UserError::TokenError);
                }
            };

            let typed_token: PasetoToken = match json::from_value(generic_token) {
                Ok(typed_token) => typed_token,
                Err(_) => {
                    return Err(UserError::TokenError);
                }
            };

            if must_be_admin && typed_token.sub != "lewis@oaten.name" {
                return Err(UserError::TokenError);
            }

            Ok(typed_token.sub)
        }
        None => Err(UserError::MissingToken),
    }
}

pub struct User {
    email: String,
}

#[rocket::async_trait]
impl<'r> FromRequest<'r> for User {
    type Error = UserError;

    async fn from_request(request: &'r rocket::Request<'_>) -> request::Outcome<Self, Self::Error> {
        let authorization_header = request.headers().get_one("Authorization");

        match authorization_header {
            Some(authorization_header) => {
                let key = request
                    .rocket()
                    .state::<PasetoSymmetricKey<V4, Local>>()
                    .expect("PASETO encryption key found in config.");

                match authorise_paseto_header(key, authorization_header, false) {
                    Ok(email) => Outcome::Success(Self { email }),
                    Err(_) => Outcome::Failure((
                        rocket::http::Status::Unauthorized,
                        UserError::TokenError,
                    )),
                }
            }
            None => request::Outcome::Failure((
                rocket::http::Status::Unauthorized,
                UserError::MissingToken,
            )),
        }
    }
}

impl<'a> OpenApiFromRequest<'a> for User {
    fn from_request_input(
        _gen: &mut OpenApiGenerator,
        _name: String,
        _required: bool,
    ) -> rocket_okapi::Result<RequestHeaderInput> {
        // Setup global requirement for Security scheme
        let security_scheme = SecurityScheme {
            description: Some(
                "Requires an Bearer token to access, token is: `mytoken`.".to_owned(),
            ),
            // Setup data requirements.
            // In this case the header `Authorization: mytoken` needs to be set.
            data: SecuritySchemeData::Http {
                scheme: "bearer".to_owned(), // `basic`, `digest`, ...
                // Just gives use a hint to the format used
                bearer_format: Some("bearer".to_owned()),
            },
            extensions: Object::default(),
        };
        // Add the requirement for this route/endpoint
        // This can change between routes.
        let mut security_req = SecurityRequirement::new();
        // Each security requirement needs to be met before access is allowed.
        security_req.insert("User".to_owned(), Vec::new());
        // These vvvvvvv-----^^^^^^^^ values need to match exactly!
        Ok(RequestHeaderInput::Security(
            "User".to_owned(),
            security_scheme,
            security_req,
        ))
    }
}

pub struct AdminUser {
    #[allow(dead_code)]
    email: String,
}

#[rocket::async_trait]
impl<'r> FromRequest<'r> for AdminUser {
    type Error = UserError;

    async fn from_request(request: &'r rocket::Request<'_>) -> request::Outcome<Self, Self::Error> {
        let authorization_header = request.headers().get_one("Authorization");

        match authorization_header {
            Some(authorization_header) => {
                let key = request
                    .rocket()
                    .state::<PasetoSymmetricKey<V4, Local>>()
                    .expect("PASETO encryption key found in config.");

                match authorise_paseto_header(key, authorization_header, true) {
                    Ok(email) => Outcome::Success(Self { email }),
                    Err(_) => Outcome::Failure((
                        rocket::http::Status::Unauthorized,
                        UserError::TokenError,
                    )),
                }
            }
            None => request::Outcome::Failure((
                rocket::http::Status::Unauthorized,
                UserError::MissingToken,
            )),
        }
    }
}

impl<'a> OpenApiFromRequest<'a> for AdminUser {
    fn from_request_input(
        _gen: &mut OpenApiGenerator,
        _name: String,
        _required: bool,
    ) -> rocket_okapi::Result<RequestHeaderInput> {
        // Setup global requirement for Security scheme
        let security_scheme = SecurityScheme {
            description: Some(
                "Requires an Bearer token to access, token is: `mytoken`.".to_owned(),
            ),
            // Setup data requirements.
            // In this case the header `Authorization: mytoken` needs to be set.
            data: SecuritySchemeData::Http {
                scheme: "bearer".to_owned(), // `basic`, `digest`, ...
                // Just gives use a hint to the format used
                bearer_format: Some("bearer".to_owned()),
            },
            extensions: Object::default(),
        };
        // Add the requirement for this route/endpoint
        // This can change between routes.
        let mut security_req = SecurityRequirement::new();
        // Each security requirement needs to be met before access is allowed.
        security_req.insert("User".to_owned(), Vec::new());
        // These vvvvvvv-----^^^^^^^^ values need to match exactly!
        Ok(RequestHeaderInput::Security(
            "User".to_owned(),
            security_scheme,
            security_req,
        ))
    }
}

#[derive(Serialize, Deserialize, JsonSchema, Debug)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
struct RootResponse {
    value: String,
}

#[openapi]
#[get("/", format = "json")]
async fn index(
    pool: &State<PgPool>,
    user: User,
) -> Result<Json<RootResponse>, rocket::response::status::BadRequest<String>> {
    // Make a simple query to return the given parameter (use a question mark `?` instead of `$1` for MySQL)
    let test_id: i32 = match sqlx::query!("SELECT id FROM test")
        .fetch_one(pool.inner())
        .await
    {
        Ok(test_id) => test_id.id,
        Err(_) => {
            return Err(rocket::response::status::BadRequest(Some(
                "Error getting database ID".to_string(),
            )))
        }
    };

    let output = format!("Hello, {}! id: {}", user.email, test_id);

    Ok(Json(RootResponse { value: output }))
}

#[derive(Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
struct EventsGetResponse {
    id: i32,
    created_at: DateTime<Utc>,
    last_modified: DateTime<Utc>,
    title: String,
    description: String,
    time_begin: DateTime<Utc>,
    time_end: DateTime<Utc>,
}

#[openapi]
#[get("/events", format = "json")]
async fn events_get_all(
    pool: &State<PgPool>,
    _user: User,
) -> Result<Json<Vec<EventsGetResponse>>, rocket::response::status::BadRequest<String>> {
    // Return all events
    let events: Vec<EventsGetResponse> = match sqlx::query_as!(
        EventsGetResponse,
        "SELECT id, created_at, last_modified, title, description, time_begin, time_end FROM event"
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

    Ok(Json(events))
}

#[openapi]
#[get("/events/<id>", format = "json")]
async fn events_get(
    id: i32,
    pool: &State<PgPool>,
    _user: User,
) -> Result<Json<EventsGetResponse>, rocket::response::status::BadRequest<String>> {
    // Return requested event
    let event: EventsGetResponse = match sqlx::query_as!(
        EventsGetResponse,
        "SELECT id, created_at, last_modified, title, description, time_begin, time_end FROM event WHERE id = $1",
        id
    ).fetch_one(pool.inner()).await
    {
        Ok(event) => event,
        Err(_) => {
            return Err(rocket::response::status::BadRequest(Some(
                "Error getting database ID".to_string(),
            )))
        }
    };

    Ok(Json(event))
}

#[openapi]
#[delete("/events/<id>", format = "json")]
async fn events_delete(
    id: i32,
    pool: &State<PgPool>,
    _user: AdminUser,
) -> Result<rocket::response::status::NoContent, rocket::response::status::BadRequest<String>> {
    // Delete the event
    match sqlx::query!("DELETE FROM event WHERE id = $1", id)
        .execute(pool.inner())
        .await
    {
        Ok(_) => Ok(rocket::response::status::NoContent),
        Err(_) => Err(rocket::response::status::BadRequest(Some(
            "Error getting database ID".to_string(),
        ))),
    }
}

#[derive(Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
struct EventsPostRequest {
    title: String,
    description: String,
    time_begin: DateTime<Utc>,
    time_end: DateTime<Utc>,
}

#[derive(Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
struct EventsPostResponse {
    id: i32,
    created_at: DateTime<Utc>,
    last_modified: DateTime<Utc>,
    title: String,
    description: String,
    time_begin: DateTime<Utc>,
    time_end: DateTime<Utc>,
}

#[openapi]
#[post("/events", format = "json", data = "<event_request>")]
async fn events_post(
    event_request: Json<EventsPostRequest>,
    pool: &State<PgPool>,
    _user: AdminUser,
) -> Result<status::Created<Json<EventsPostResponse>>, rocket::response::status::BadRequest<String>>
{
    // Insert new event and return it
    let event: EventsPostResponse = match sqlx::query_as!(
        EventsPostResponse,
        "INSERT INTO event (title, description, time_begin, time_end) VALUES ($1, $2, $3, $4) RETURNING id, created_at, last_modified, title, description, time_begin, time_end",
        event_request.title,
        event_request.description,
        event_request.time_begin,
        event_request.time_end,
    ).fetch_one(pool.inner()).await
    {
        Ok(event) => event,
        Err(_) => {
            return Err(rocket::response::status::BadRequest(Some(
                "Error getting database ID".to_string(),
            )))
        }
    };

    Ok(status::Created::new("/events/".to_string() + &event.id.to_string()).body(Json(event)))
}

#[derive(Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
struct InvitationsPostRequest {
    email: String,
}

#[derive(Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
struct InvitationsResponse {
    event_id: i32,
    email: String,
    handle: Option<String>,
    invited_at: DateTime<Utc>,
    responded_at: Option<DateTime<Utc>>,
    response: Option<bool>,
    attendance: Option<Vec<u8>>,
    last_modified: DateTime<Utc>,
}

#[openapi]
#[post(
    "/events/<event_id>/invitations",
    format = "json",
    data = "<invitation_request>"
)]
async fn invitations_post(
    event_id: i32,
    invitation_request: Json<InvitationsPostRequest>,
    pool: &State<PgPool>,
    _user: AdminUser,
) -> Result<status::Created<Json<InvitationsResponse>>, rocket::response::status::BadRequest<String>>
{
    // Insert new event and return it
    let invitation: InvitationsResponse = match sqlx::query_as!(
        InvitationsResponse,
        "INSERT INTO invitation (event_id, email)
        VALUES ($1, $2)
        RETURNING event_id, email, handle, invited_at, responded_at, response, attendance, last_modified",
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

    Ok(
        status::Created::new("/events/".to_string() + &invitation.event_id.to_string())
            .body(Json(invitation)),
    )
}

#[openapi]
#[get("/events/<event_id>/invitations", format = "json")]
async fn invitations_get_all(
    event_id: i32,
    pool: &State<PgPool>,
    _user: AdminUser,
) -> Result<Json<Vec<InvitationsResponse>>, rocket::response::status::BadRequest<String>> {
    // Return all events
    let invitations: Vec<InvitationsResponse> = match sqlx::query_as!(
        InvitationsResponse,
        "SELECT event_id, email, handle, invited_at, responded_at, response, attendance, last_modified
        FROM invitation
        WHERE event_id=$1",
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

#[openapi]
#[delete("/events/<event_id>/invitations/<email>", format = "json")]
async fn invitations_delete(
    event_id: i32,
    email: String,
    pool: &State<PgPool>,
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

#[derive(Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
struct LoginResponse {}

#[derive(Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
struct LoginRequest {
    email: String,
}

#[openapi]
#[post("/login", format = "json", data = "<login_request>")]
async fn login(
    login_request: Json<LoginRequest>,
    key: &State<PasetoSymmetricKey<V4, Local>>,
    sender: &State<Sender>,
) -> Result<Json<LoginResponse>, rocket::response::status::BadRequest<String>> {
    let expiration_claim =
        match ExpirationClaim::try_from((Utc::now() + Duration::minutes(5)).to_rfc3339()) {
            Ok(expiration_claim) => expiration_claim,
            Err(_) => {
                return Err(rocket::response::status::BadRequest(Some(
                    "Can't create time for expiration claim".to_string(),
                )))
            }
        };

    // use a default token builder with the same PASETO version and purpose
    let token = match PasetoBuilder::<V4, Local>::default()
        .set_claim(expiration_claim)
        .set_claim(IssuerClaim::from("calandar.org"))
        .set_claim(TokenIdentifierClaim::from("email_verification"))
        .set_claim(SubjectClaim::from(login_request.email.as_str()))
        .build(key)
    {
        Ok(token) => token,
        Err(_) => {
            return Err(rocket::response::status::BadRequest(Some(
                "Error building token".to_string(),
            )))
        }
    };

    match _send_email(
        sender,
        vec![&login_request.email],
        "Calandar Email Verification",
        format!("Dear {name},<br />
        <br />
Please confirm your email by visiting the following link in the next 5 minutes: <a href=\"https://calandar.org/verify_email?token={token}\">Validate Email</a><br />
<br />
Alternatively, go to <a href=\"https://calandar.org/verify_email\">https://calandar.org/verify_email</a> and enter the following token:<br />
<br />
{token}<br />
<br />
If you did not request this email, please ignore it.<br />
<br />
Happy hunting,<br />
<br />
Lewis
", name=login_request.email, token=token).as_str(),
    ).await {
        Ok(_) => (),
        Err(_) => {
            return Err(rocket::response::status::BadRequest(Some(
                "Error sending email".to_string(),
            )))
        }
    }

    Ok(Json(LoginResponse {}))
}

#[derive(Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
struct VerifyEmailRequest {
    token: String,
}

#[derive(Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
struct VerifyEmailResponse {
    token: String,
    email: String,
    is_admin: bool,
}

#[allow(clippy::needless_pass_by_value)]
#[openapi]
#[post("/verify-email", format = "json", data = "<verify_email_request>")]
fn verify_email(
    verify_email_request: Json<VerifyEmailRequest>,
    key: &State<PasetoSymmetricKey<V4, Local>>,
) -> Result<Json<VerifyEmailResponse>, rocket::response::status::BadRequest<String>> {
    // decode and verify token is a valid email verification token, and has not expired

    let generic_token = match PasetoParser::<V4, Local>::default()
        .check_claim(IssuerClaim::from("calandar.org"))
        .check_claim(TokenIdentifierClaim::from("email_verification"))
        .parse(&verify_email_request.token, key)
    {
        Ok(generic_token) => generic_token,
        Err(_) => {
            return Err(rocket::response::status::BadRequest(Some(
                "Error parsing token".to_string(),
            )))
        }
    };

    let typed_token: PasetoToken = match json::from_value(generic_token) {
        Ok(typed_token) => typed_token,
        Err(_) => {
            return Err(rocket::response::status::BadRequest(Some(
                "Error parsing token".to_string(),
            )))
        }
    };

    // create a new long-lasting token for the user for subsequent api requests
    let expiration_claim =
        match ExpirationClaim::try_from((Utc::now() + Duration::days(7)).to_rfc3339()) {
            Ok(expiration_claim) => expiration_claim,
            Err(_) => {
                return Err(rocket::response::status::BadRequest(Some(
                    "Can't create time for expiration claim".to_string(),
                )))
            }
        };

    let token = match PasetoBuilder::<V4, Local>::default()
        .set_claim(expiration_claim)
        .set_claim(IssuerClaim::from("calandar.org"))
        .set_claim(TokenIdentifierClaim::from("api"))
        .set_claim(SubjectClaim::from(typed_token.sub.as_str()))
        .build(key)
    {
        Ok(token) => token,
        Err(_) => {
            return Err(rocket::response::status::BadRequest(Some(
                "Error building token".to_string(),
            )))
        }
    };

    let is_admin = typed_token.sub == "lewis@oaten.name";

    Ok(Json(VerifyEmailResponse {
        token,
        email: typed_token.sub,
        is_admin,
    }))
}

#[options("/<_..>")]
const fn all_options() -> rocket::response::status::NoContent {
    rocket::response::status::NoContent
}

async fn _send_email(
    sender: &Sender,
    tos: Vec<&str>,
    subject: &str,
    body: &str,
) -> Result<(), String> {
    let personalization = {
        let mut p = Personalization::new(SendGridEmail::new(&tos[0].to_string()));
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
        Err(e) => Err(format!("Sendgrid error: {}", e)),
    }
}

pub struct CORS;

#[rocket::async_trait]
impl Fairing for CORS {
    fn info(&self) -> Info {
        Info {
            name: "Attaching CORS headers to responses",
            kind: Kind::Response,
        }
    }

    async fn on_response<'r>(&self, request: &'r Request<'_>, response: &mut Response<'r>) {
        if let Some(origin_header) = request.headers().get_one("Origin") {
            if origin_header == "https://calandar.org"
                || origin_header.ends_with("calandar.netlify.app")
                || origin_header == "http://localhost:3000"
            {
                response.set_header(rocket::http::Header::new(
                    "Access-Control-Allow-Origin",
                    origin_header,
                ));
                response.set_header(Header::new(
                    "Access-Control-Allow-Methods",
                    "POST, GET, PATCH, DELETE, OPTIONS",
                ));
                response.set_header(Header::new("Access-Control-Allow-Headers", "*"));
                response.set_header(Header::new("Access-Control-Allow-Credentials", "true"));
            };
        };
    }
}

#[shuttle_service::main]
async fn rocket(
    #[shuttle_shared_db::Postgres] pool: PgPool,
    #[shuttle_secrets::Secrets] secret_store: SecretStore,
) -> ShuttleRocket {
    sqlx::migrate!()
        .run(&pool)
        .await
        .expect("Database migrated to latest version.");

    // Get the discord token set in `Secrets.toml` from the shared Postgres database
    let paseto_secret_key = if let Some(paseto_secret_key) = secret_store.get("PASETO_SECRET_KEY") {
        paseto_secret_key
    } else {
        return Err(anyhow!("failed to get PASETO_SECRET_KEY from secrets store").into());
    };

    let paseto_symmetric_key =
        PasetoSymmetricKey::<V4, Local>::from(Key::from(paseto_secret_key.as_bytes()));

    let sendgrid_api_key = if let Some(sendgrid_api_key) = secret_store.get("SENDGRID_API_KEY") {
        sendgrid_api_key
    } else {
        return Err(anyhow!("failed to get SENDGRID_API_KEY from secrets store").into());
    };

    let email_sender = Sender::new(sendgrid_api_key);

    #[allow(clippy::no_effect_underscore_binding)]
    let rocket = rocket::build()
        .attach(CORS)
        .manage::<PgPool>(pool)
        .manage::<PasetoSymmetricKey<V4, Local>>(paseto_symmetric_key)
        .manage::<Sender>(email_sender)
        .mount("/", routes![all_options])
        .mount(
            "/api",
            openapi_get_routes![
                index,
                login,
                verify_email,
                events_get_all,
                events_get,
                events_post,
                events_delete,
                invitations_post,
                invitations_get_all,
                invitations_delete,
            ],
        )
        .mount(
            "/api/docs/",
            make_swagger_ui(&SwaggerUIConfig {
                url: "../openapi.json".to_owned(),
                ..Default::default()
            }),
        );

    Ok(rocket)
}
