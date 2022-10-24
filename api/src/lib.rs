extern crate rocket;

use anyhow::anyhow;
use chrono::{prelude::Utc, DateTime, Duration, NaiveDateTime};
use futures::future::join_all;
use rocket::{
    delete,
    fairing::{Fairing, Info, Kind},
    get,
    http::Header,
    options, patch, post,
    request::{self, FromRequest, Outcome},
    response::status,
    routes,
    serde::{json, json::Json, Deserialize, Serialize},
    Request, Response, State,
};
use rocket_dyn_templates::tera::{Context, Tera};
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
    r: Option<String>,
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
                    Err(_) => Outcome::Forward(()),
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
                    Err(_) => Outcome::Forward(()),
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
#[get("/events?<as_admin>", format = "json")]
async fn events_get_all(
    as_admin: bool,
    pool: &State<PgPool>,
    user: AdminUser,
) -> Result<Json<Vec<EventsGetResponse>>, rocket::response::status::BadRequest<String>> {
    if as_admin {
        // Return all events
        match sqlx::query_as!(
            EventsGetResponse,
            "SELECT id, created_at, last_modified, title, description, time_begin, time_end FROM event"
        ).fetch_all(pool.inner())
        .await
        {
            Ok(events) => return Ok(Json(events)),
            Err(_) => {
                return Err(rocket::response::status::BadRequest(Some(
                    "Error getting database ID".to_string(),
                )))
            }
        };
    }

    // Return all events that the user is invited to
    match sqlx::query_as!(
        EventsGetResponse,
        "SELECT id, created_at, last_modified, title, description, time_begin, time_end
    FROM event
    WHERE id IN (
        SELECT event_id
        FROM invitation
        WHERE email = $1
    )",
        user.email
    )
    .fetch_all(pool.inner())
    .await
    {
        Ok(events) => Ok(Json(events)),
        Err(_) => Err(rocket::response::status::BadRequest(Some(
            "Error getting database ID".to_string(),
        ))),
    }
}

#[openapi]
#[get("/events", format = "json", rank = 2)]
async fn events_get_all_user(
    pool: &State<PgPool>,
    user: User,
) -> Result<Json<Vec<EventsGetResponse>>, rocket::response::status::BadRequest<String>> {
    // Return all events
    let events: Vec<EventsGetResponse> = match sqlx::query_as!(
        EventsGetResponse,
        "SELECT id, created_at, last_modified, title, description, time_begin, time_end
        FROM event
        WHERE id IN (
            SELECT event_id
            FROM invitation
            WHERE email = $1
        )",
        user.email
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
    _user: AdminUser,
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
#[get("/events/<id>", format = "json", rank = 2)]
async fn events_get_user(
    id: i32,
    pool: &State<PgPool>,
    user: User,
) -> Result<Json<EventsGetResponse>, rocket::response::status::BadRequest<String>> {
    // Return requested event
    let event: EventsGetResponse = match sqlx::query_as!(
        EventsGetResponse,
        "SELECT id, created_at, last_modified, title, description, time_begin, time_end
        FROM event
        WHERE id IN (
            SELECT event_id
            FROM invitation
            WHERE email = $1
            AND event_id = $2
        )",
        user.email,
        id
    )
    .fetch_one(pool.inner())
    .await
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

#[derive(Serialize, JsonSchema)]
#[serde(crate = "rocket::serde")]
struct EventGameSuggestionResponse {
    appid: i64,
    name: String,
    last_modified: DateTime<Utc>,
    requested_at: DateTime<Utc>,
    suggestion_last_modified: DateTime<Utc>,
}

#[openapi]
#[get("/events/<event_id>/games", format = "json")]
async fn event_games_get_all(
    event_id: i32,
    pool: &State<PgPool>,
    _user: User,
) -> Result<Json<Vec<EventGameSuggestionResponse>>, rocket::response::status::BadRequest<String>> {
    // Return all games
    let games: Vec<EventGameSuggestionResponse> = match sqlx::query_as!(
        EventGameSuggestionResponse,
        r#"SELECT
            steam_game.appid AS appid,
            steam_game.name AS name,
            steam_game.last_modified AS last_modified,
            event_game.requested_at AS requested_at,
            event_game.last_modified AS suggestion_last_modified
        FROM event_game
        INNER JOIN steam_game ON event_game.game_id = steam_game.appid
        WHERE event_game.event_id = $1"#,
        event_id
    )
    .fetch_all(pool.inner())
    .await
    {
        Ok(games) => games,
        Err(_) => {
            return Err(rocket::response::status::BadRequest(Some(
                "Error getting database ID".to_string(),
            )))
        }
    };

    Ok(Json(games))
}

#[derive(Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde")]
struct EventGameSuggestionRequest {
    appid: i64,
}

#[openapi]
#[post("/events/<event_id>/games", format = "json", data = "<game_request>")]
async fn event_games_post(
    event_id: i32,
    game_request: Json<EventGameSuggestionRequest>,
    pool: &State<PgPool>,
    _user: User,
) -> Result<
    status::Created<Json<EventGameSuggestionResponse>>,
    rocket::response::status::BadRequest<String>,
> {
    // Insert new game suggestion
    let event_game_suggestion: EventGameSuggestionResponse = match sqlx::query_as!(
        EventGameSuggestionResponse,
        r#"WITH event_game_suggestion_response AS (
            INSERT INTO event_game (event_id, game_id)
                VALUES ($1, $2)
                RETURNING event_id, game_id, requested_at, last_modified
        ) SELECT
            steam_game.appid AS appid,
            steam_game.name AS name,
            steam_game.last_modified AS last_modified,
            event_game_suggestion_response.requested_at AS requested_at,
            event_game_suggestion_response.last_modified AS suggestion_last_modified
        FROM event_game_suggestion_response
        INNER JOIN steam_game ON event_game_suggestion_response.game_id = steam_game.appid;"#,
        event_id,
        game_request.appid,
    )
    .fetch_one(pool.inner())
    .await
    {
        Ok(event_game_suggestion) => event_game_suggestion,
        Err(_) => {
            return Err(rocket::response::status::BadRequest(Some(
                "Error getting database ID".to_string(),
            )))
        }
    };

    Ok(status::Created::new(format!(
        "/events/{}/games/{}",
        event_id,
        &game_request.appid.to_string()
    ))
    .body(Json(event_game_suggestion)))
}

#[derive(Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
struct InvitationsPostRequest {
    email: String,
}

#[derive(sqlx::Type, Deserialize, Serialize, JsonSchema)]
#[sqlx(type_name = "invitation_response", rename_all = "lowercase")]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
enum InvitationResponse {
    Yes,
    No,
    Maybe,
}

#[derive(Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
struct InvitationsResponse {
    event_id: i32,
    email: String,
    handle: Option<String>,
    invited_at: DateTime<Utc>,
    responded_at: Option<DateTime<Utc>>,
    response: Option<InvitationResponse>,
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
    key: &State<PasetoSymmetricKey<V4, Local>>,
    sender: &State<Sender>,
    tera: &State<Tera>,
    _user: AdminUser,
) -> Result<status::Created<Json<InvitationsResponse>>, rocket::response::status::BadRequest<String>>
{
    // Insert new event and return it
    let invitation: InvitationsResponse = match sqlx::query_as!(
        InvitationsResponse,
        r#"INSERT INTO invitation (event_id, email)
        VALUES ($1, $2)
        RETURNING event_id, email, handle, invited_at, responded_at, response AS "response: _", attendance, last_modified"#,
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
    let event: EventsGetResponse = match sqlx::query_as!(
        EventsGetResponse,
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

    match _send_preauth_email(
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

#[openapi]
#[get("/events/<event_id>/invitations/<email>", format = "json")]
async fn invitations_get(
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
        r#"SELECT event_id, email, handle, invited_at, responded_at, response AS "response: _", attendance, last_modified
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

#[openapi]
#[get("/events/<event_id>/invitations", format = "json")]
async fn invitations_get_all(
    event_id: i32,
    pool: &State<PgPool>,
    _user: AdminUser,
) -> Result<Json<Vec<InvitationsResponse>>, rocket::response::status::BadRequest<String>> {
    // Return all invitations
    let invitations: Vec<InvitationsResponse> = match sqlx::query_as!(
        InvitationsResponse,
        r#"SELECT event_id, email, handle, invited_at, responded_at, response AS "response: _", attendance, last_modified
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

#[derive(Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde")]
struct InvitationsPatchRequest {
    handle: String,
    response: InvitationResponse,
}

#[openapi]
#[patch(
    "/events/<event_id>/invitations/<email>",
    format = "json",
    data = "<invitation_request>"
)]
async fn invitations_patch(
    event_id: i32,
    email: String,
    invitation_request: Json<InvitationsPatchRequest>,
    pool: &State<PgPool>,
    user: User,
) -> Result<rocket::response::status::NoContent, rocket::response::status::Unauthorized<String>> {
    if user.email != email {
        return Err(rocket::response::status::Unauthorized(Some(
            "You can only respond to invitations for your own email address".to_string(),
        )));
    }

    // let response: InvitationResponse = InvitationResponse::from(invitation_request.response);

    // Insert new event and return it
    match sqlx::query!(
        r#"UPDATE invitation
        SET handle = $1, response = $2, responded_at = NOW(), last_modified = NOW()
        WHERE event_id = $3
        AND email = $4"#,
        invitation_request.handle,
        invitation_request.response as _,
        event_id,
        user.email,
    )
    .execute(pool.inner())
    .await
    {
        Ok(_) => (),
        Err(_) => {
            return Err(rocket::response::status::Unauthorized(Some(
                "Error updating invitation in the database".to_string(),
            )))
        }
    };

    Ok(rocket::response::status::NoContent)
}

#[derive(Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
struct LoginResponse {}

#[derive(Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
struct LoginRequest {
    email: String,
    redirect: Option<String>,
}

#[openapi]
#[post("/login", format = "json", data = "<login_request>")]
async fn login(
    login_request: Json<LoginRequest>,
    key: &State<PasetoSymmetricKey<V4, Local>>,
    sender: &State<Sender>,
    tera: &State<Tera>,
) -> Result<Json<LoginResponse>, rocket::response::status::BadRequest<String>> {
    let mut context = Context::new();
    context.insert("name", &login_request.email);

    let redirect = match login_request.redirect {
        Some(ref redirect) => redirect,
        None => "",
    };

    let email_details = PreauthEmailDetails {
        email_address: login_request.email.to_string(),
        email_subject: "Calandar Email Verification".to_string(),
        email_template: "email_verification.html.tera".to_string(),
    };

    match _send_preauth_email(
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
        Ok(_) => Ok(Json(LoginResponse {})),
        Err(_) => Err(rocket::response::status::BadRequest(Some(
            "Error sending email".to_string(),
        ))),
    }
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
    redirect: String,
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
        .check_claim(TokenIdentifierClaim::from("ev"))
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
                "Can't parse PASETO token to types".to_string(),
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
        redirect: typed_token.r.unwrap_or_else(|| "".to_string()),
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

struct PreauthEmailDetails {
    email_address: String,
    email_subject: String,
    email_template: String,
}

async fn _send_preauth_email(
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
            return Err(format!("Error rendering email with: {}", e));
        }
    };

    match _send_email(
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

#[derive(Serialize, JsonSchema, Debug)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
struct SteamGameUpdate {
    id: i32,
    update_time: DateTime<Utc>,
}

#[derive(Serialize, Deserialize, JsonSchema, Debug)]
#[serde(crate = "rocket::serde")]
struct SteamAPISteamGame {
    appid: i64,
    name: String,
    last_modified: i64,
    price_change_number: Option<i32>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(crate = "rocket::serde")]
struct SteamAPISteamGameResponse {
    apps: Vec<SteamAPISteamGame>,
    have_more_results: Option<bool>,
    last_appid: Option<i64>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(crate = "rocket::serde")]
struct SteamAPISteamGameResponseWrapper {
    response: SteamAPISteamGameResponse,
}

#[openapi]
#[post("/steam-game-update")]
async fn steam_game_update(
    pool: &State<PgPool>,
    steam_api_key: &State<String>,
    _user: AdminUser,
) -> Result<Json<()>, rocket::response::status::BadRequest<String>> {
    let last_update: SteamGameUpdate = match sqlx::query_as!(
        SteamGameUpdate,
        "SELECT id, update_time FROM steam_game_update ORDER BY update_time DESC LIMIT 1",
    )
    .fetch_one(pool.inner())
    .await
    {
        Ok(last_update) => {
            log::info!(
                "Found last update time, checking for updates since {:?}",
                last_update
            );
            last_update
        }
        Err(e) => {
            log::info!("Unable to get last update time: {}", e);
            // Return earliest unix timestamp
            SteamGameUpdate {
                id: 0,
                update_time: DateTime::<Utc>::from_utc(NaiveDateTime::from_timestamp(0, 0), Utc),
            }
        }
    };

    // Insert new event and return it
    let steam_game_update: SteamGameUpdate = match sqlx::query_as!(
        SteamGameUpdate,
        "INSERT INTO steam_game_update DEFAULT VALUES RETURNING id, update_time",
    )
    .fetch_one(pool.inner())
    .await
    {
        Ok(steam_game_update) => steam_game_update,
        Err(_) => {
            return Err(rocket::response::status::BadRequest(Some(
                "Error getting database ID".to_string(),
            )))
        }
    };

    let mut has_more_results = true;
    let mut last_appid = 0;

    while has_more_results {
        let request_url = format!("https://api.steampowered.com/IStoreService/GetAppList/v1/?key={key}&if_modified_since={if_modified_since}&last_appid={last_appid}&max_results={max_results}",
                                key = steam_api_key,
                                if_modified_since = last_update.update_time.timestamp(),
                                last_appid = last_appid,
                                max_results = 10000,
                            );
        log::info!("Requesting games from steam API using url: {}", request_url);
        let response = match reqwest::get(&request_url).await {
            Ok(response) => response,
            Err(e) => {
                return Err(rocket::response::status::BadRequest(Some(format!(
                    "Error getting steam game list: {}",
                    e
                ))))
            }
        };

        let steam_games: SteamAPISteamGameResponseWrapper = match response.json().await {
            Ok(steam_games) => steam_games,
            Err(e) => {
                return Err(rocket::response::status::BadRequest(Some(format!(
                    "Error parsing steam game list: {}",
                    e
                ))))
            }
        };
        log::info!(
            "Parsed steam games response. Last appid: {}, more results: {}, count of results: {}",
            steam_games.response.last_appid.unwrap_or(0),
            steam_games.response.have_more_results.unwrap_or(false),
            steam_games.response.apps.len()
        );

        has_more_results = steam_games.response.have_more_results.unwrap_or(false);
        last_appid = steam_games.response.last_appid.unwrap_or(0);

        let mut insert_promises = vec![];

        for steam_game in &steam_games.response.apps {
            let insert_promise = sqlx::query!(
                "INSERT INTO steam_game (appid, update_id, name, last_modified)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (appid) DO UPDATE SET update_id = $2, name = $3, last_modified = $4",
                steam_game.appid,
                steam_game_update.id,
                steam_game.name,
                DateTime::<Utc>::from_utc(
                    NaiveDateTime::from_timestamp(steam_game.last_modified, 0),
                    Utc
                ),
            )
            .execute(pool.inner());

            insert_promises.push(insert_promise);
        }

        join_all(insert_promises).await;
        log::info!(
            "Inserted or updated {} steam games",
            steam_games.response.apps.len()
        );
    }

    Ok(Json(()))
}

#[derive(Serialize, Deserialize, JsonSchema, Debug)]
#[serde(crate = "rocket::serde")]
struct SteamGameResponse {
    appid: i64,
    name: String,
    last_modified: DateTime<Utc>,
    rank: Option<f32>,
}

#[openapi]
#[get("/steam-game?<query>&<page>")]
async fn get_steam_game(
    query: String,
    page: Option<i64>,
    pool: &State<PgPool>,
    _user: User,
) -> Result<Json<Vec<SteamGameResponse>>, rocket::response::status::BadRequest<String>> {
    const COUNT: i64 = 10;

    let page = page.unwrap_or(0);

    let wrapped_query = format!("'{}'", query);

    // Return games matching search query
    match sqlx::query_as!(
        SteamGameResponse,
        r#"SELECT appid, name, last_modified, ts_rank_cd(to_tsvector('english', name), query, 32 /* rank/(rank+1) */) AS rank
        FROM steam_game, plainto_tsquery('english', $1) query
        WHERE query @@ to_tsvector('english', name)
        ORDER BY rank DESC
        LIMIT $2
        OFFSET $3"#,
        wrapped_query,
        COUNT,
        page * COUNT,
    )
    .fetch_all(pool.inner())
    .await
    {
        Ok(games) => Ok(Json(games)),
        Err(e) => Err(rocket::response::status::BadRequest(Some(format!(
            "Error searching steam games: {}",
            e
        )))),
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

const EMAIL_TEMPLATES: [(&str, &str); 3] = [
    (
        "email_base.html.tera",
        r#"
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
      </head>
      <body>
        {% block content %}{% endblock content %}
      </body>
    </html>
    "#,
    ),
    (
        "email_invitation.html.tera",
        r#"
    {% extends "email_base.html.tera" %}

    {% block content %}
        <p>Dear {{ name }},</p>

        <p>I'm pleased to invite you to the {{ title }}</p>

        <p>It starts at {{ time_begin }} and runs until {{ time_end }}.</p>

        <p>{{ description | linebreaksbr }}</p>

        <p>I've created a new website for these events where you can RSVP and see details about the event. In the future, you will also be able to let me know which times you can attend, reserve seats, suggest and vote for games, as well as a live dashboard for during the event itself. It's a constant work in progress, so please let me know if you have any issues or feedback.</p>

        <p>To RSVP, please <a href="https://calandar.org/verify_email?token={{ token }}">click here</a> within the next 24 hours. After this time you will have to log in again at calandar.org using this email address.</p>

        <p>See you there,</p>

        <p>Lewis</p>
    {% endblock content %}
    "#,
    ),
    (
        "email_verification.html.tera",
        r#"
    {% extends "email_base.html.tera" %}

    {% block content %}
        <p>Dear {{ name }},</p>

        <p>Please confirm your email by visiting the following link in the next 30 minutes: <a href="https://calandar.org/verify_email?token={{ token }}">Validate Email</a></p>

        <p>Alternatively, go to <a href=\"https://calandar.org/verify_email\">https://calandar.org/verify_email</a> and enter the following token:</p>

        <code>{{ token }}</code>

        <p>If you did not request this email, please ignore it.</p>

        <p>Happy hunting,</p>

        <p>Lewis</p>
    {% endblock content %}
    "#,
    ),
];

#[shuttle_service::main]
async fn rocket(
    #[shuttle_shared_db::Postgres] pool: PgPool,
    #[shuttle_secrets::Secrets] secret_store: SecretStore,
) -> ShuttleRocket {
    log::info!("Launching application!");
    match sqlx::migrate!().run(&pool).await {
        Ok(_) => log::info!("Migrations ran successfully"),
        Err(e) => log::error!("Error running migrations: {}", e),
    };

    // Get the discord token set in `Secrets.toml` from the AWS RDS Postgres database
    let paseto_secret_key = if let Some(paseto_secret_key) = secret_store.get("PASETO_SECRET_KEY") {
        paseto_secret_key
    } else {
        return Err(anyhow!("failed to get PASETO_SECRET_KEY from secrets store").into());
    };

    log::info!("PASETO_SECRET_KEY obtained.");

    let paseto_symmetric_key =
        PasetoSymmetricKey::<V4, Local>::from(Key::from(paseto_secret_key.as_bytes()));

    log::info!("Paseto key created.");

    let sendgrid_api_key = if let Some(sendgrid_api_key) = secret_store.get("SENDGRID_API_KEY") {
        sendgrid_api_key
    } else {
        return Err(anyhow!("failed to get SENDGRID_API_KEY from secrets store").into());
    };

    log::info!("SENDGRID_API_KEY obtained.");

    let email_sender = Sender::new(sendgrid_api_key);

    log::info!("Sendgrid sender created.");

    let steam_api_key = if let Some(steam_api_key) = secret_store.get("STEAM_API_KEY") {
        steam_api_key
    } else {
        return Err(anyhow!("failed to get STEAM_API_KEY from secrets store").into());
    };

    log::info!("SENDGRID_API_KEY obtained.");

    let mut tera = Tera::default();
    match tera.add_raw_templates(EMAIL_TEMPLATES) {
        Ok(_) => log::info!("Tera templates added."),
        Err(e) => log::error!("Error adding Tera templates: {}", e),
    };

    log::info!("Building our rocket...");
    #[allow(clippy::no_effect_underscore_binding)]
    let rocket = rocket::build()
        .attach(CORS)
        .manage::<PgPool>(pool)
        .manage::<PasetoSymmetricKey<V4, Local>>(paseto_symmetric_key)
        .manage::<Sender>(email_sender)
        .manage::<String>(steam_api_key)
        .manage::<Tera>(tera)
        .mount("/", routes![all_options])
        .mount(
            "/api",
            openapi_get_routes![
                index,
                login,
                verify_email,
                events_get_all,
                events_get_all_user,
                events_get,
                events_get_user,
                events_post,
                events_delete,
                invitations_post,
                invitations_get,
                invitations_get_all,
                invitations_delete,
                invitations_patch,
                steam_game_update,
                get_steam_game,
                event_games_post,
                event_games_get_all,
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
