extern crate rocket;

use rocket::{
    get, post,
    request::{self, FromRequest, Outcome},
    serde::{json, json::Json, Deserialize, Serialize},
    State,
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
use sqlx::postgres::PgPool;
use sqlx::postgres::PgPoolOptions;

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
            Some(encrypted_token) => {
                encrypted_token.split_once("Bearer ").map_or(
                    Outcome::Failure((rocket::http::Status::BadRequest, UserError::TokenError)),
                    |(_, token)| {
                        let key = request
                            .rocket()
                            .state::<PasetoSymmetricKey<V4, Local>>()
                            .expect("PASETO encryption key found in config.");

                        let generic_token = match PasetoParser::<V4, Local>::default()
                            // you can check any claim even custom claims
                            // .check_claim(SubjectClaim::from("Get schwifty"))
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
                )
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
struct LoginResponse {
    token: String,
}

#[derive(Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde")]
struct LoginRequest {
    email: String,
}

#[allow(clippy::needless_pass_by_value)]
#[openapi]
#[post("/login", format = "json", data = "<login_request>")]
fn login(
    login_request: Json<LoginRequest>,
    key: &State<PasetoSymmetricKey<V4, Local>>,
) -> Result<Json<LoginResponse>, rocket::response::status::BadRequest<String>> {
    // use a default token builder with the same PASETO version and purpose
    let token = match PasetoBuilder::<V4, Local>::default()
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

    Ok(Json(LoginResponse { token }))
}

#[rocket::main]
async fn main() -> Result<(), rocket::Error> {
    #[derive(Deserialize)]
    #[serde(crate = "rocket::serde")]
    struct Config {
        database_url: String,
        paseto_secret_key: String,
    }

    let rocket = rocket::build();
    let figment = rocket.figment();

    let config: Config = figment
        .extract()
        .expect("Rocket figment should have parsed the config.");

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&config.database_url)
        .await
        .expect("Database connection established and pool created.");

    sqlx::migrate!()
        .run(&pool)
        .await
        .expect("Database migrated to latest version.");

    let key = PasetoSymmetricKey::<V4, Local>::from(Key::from(config.paseto_secret_key.as_bytes()));

    #[allow(clippy::no_effect_underscore_binding)]
    let rocket = rocket
        .manage::<PgPool>(pool)
        .manage::<PasetoSymmetricKey<V4, Local>>(key)
        .mount("/api", openapi_get_routes![index, login])
        .mount(
            "/api/docs/",
            make_swagger_ui(&SwaggerUIConfig {
                url: "../openapi.json".to_owned(),
                ..Default::default()
            }),
        );

    let _rocket = rocket.launch().await?;

    Ok(())
}
