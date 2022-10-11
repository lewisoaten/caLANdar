extern crate rocket;

use chrono::{prelude::Utc, Duration};
use rocket::{
    fairing::{Fairing, Info, Kind},
    get,
    http::Header,
    options, post,
    request::{self, FromRequest, Outcome},
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
use shuttle_service::{error::CustomError, SecretStore, ShuttleRocket};
use sqlx::postgres::PgPool;

pub struct User {
    email: String,
}

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

#[rocket::async_trait]
impl<'r> FromRequest<'r> for User {
    type Error = UserError;

    async fn from_request(request: &'r rocket::Request<'_>) -> request::Outcome<Self, Self::Error> {
        let authorization_header = request.headers().get_one("Authorization");

        match authorization_header {
            Some(encrypted_token) => encrypted_token.split_once("Bearer ").map_or(
                Outcome::Failure((rocket::http::Status::BadRequest, UserError::TokenError)),
                |(_, token)| {
                    let key = request
                        .rocket()
                        .state::<PasetoSymmetricKey<V4, Local>>()
                        .expect("PASETO encryption key found in config.");

                    let generic_token = match PasetoParser::<V4, Local>::default()
                        .check_claim(IssuerClaim::from("calandar.org"))
                        .check_claim(TokenIdentifierClaim::from("api"))
                        .parse(token, key)
                    {
                        Ok(generic_token) => generic_token,
                        Err(_) => {
                            return Outcome::Failure((
                                rocket::http::Status::Unauthorized,
                                UserError::TokenError,
                            ))
                        }
                    };

                    let typed_token: PasetoToken = match json::from_value(generic_token) {
                        Ok(typed_token) => typed_token,
                        Err(_) => {
                            return Outcome::Failure((
                                rocket::http::Status::Unauthorized,
                                UserError::TokenError,
                            ))
                        }
                    };

                    Outcome::Success(Self {
                        email: typed_token.sub,
                    })
                },
            ),
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

#[derive(Serialize, JsonSchema)]
#[serde(crate = "rocket::serde")]
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
#[serde(crate = "rocket::serde")]
struct LoginResponse {}

#[derive(Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde")]
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
#[serde(crate = "rocket::serde")]
struct VerifyEmailRequest {
    token: String,
}

#[derive(Serialize, JsonSchema)]
#[serde(crate = "rocket::serde")]
struct VerifyEmailResponse {
    token: String,
    email: String,
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

    Ok(Json(VerifyEmailResponse {
        token,
        email: typed_token.sub,
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
                    "POST, GET, PATCH, OPTIONS",
                ));
                response.set_header(Header::new("Access-Control-Allow-Headers", "*"));
                response.set_header(Header::new("Access-Control-Allow-Credentials", "true"));
            };
        };
    }
}

#[shuttle_service::main]
async fn rocket(#[shared::Postgres] pool: PgPool) -> ShuttleRocket {
    sqlx::migrate!()
        .run(&pool)
        .await
        .expect("Database migrated to latest version.");

    // Get the discord token set in `Secrets.toml` from the shared Postgres database
    let paseto_secret_key = pool
        .get_secret("PASETO_SECRET_KEY")
        .await
        .map_err(CustomError::new)?;

    let paseto_symmetric_key =
        PasetoSymmetricKey::<V4, Local>::from(Key::from(paseto_secret_key.as_bytes()));

    let sendgrid_api_key = pool
        .get_secret("SENDGRID_API_KEY")
        .await
        .map_err(CustomError::new)?;

    let email_sender = Sender::new(sendgrid_api_key);

    #[allow(clippy::no_effect_underscore_binding)]
    let rocket = rocket::build()
        .attach(CORS)
        .manage::<PgPool>(pool)
        .manage::<PasetoSymmetricKey<V4, Local>>(paseto_symmetric_key)
        .manage::<Sender>(email_sender)
        .mount("/api", routes![all_options])
        .mount("/api", openapi_get_routes![index, login, verify_email])
        .mount(
            "/api/docs/",
            make_swagger_ui(&SwaggerUIConfig {
                url: "../openapi.json".to_owned(),
                ..Default::default()
            }),
        );

    Ok(rocket)
}
