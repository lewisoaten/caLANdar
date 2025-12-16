// Crate-wide project settings
#![forbid(unsafe_code)]
#![deny(clippy::pedantic, clippy::nursery, clippy::unwrap_used)]
#![allow(clippy::use_self)]

extern crate rocket;

#[cfg(feature = "shuttle")]
use anyhow::anyhow;
use resend_rs::Resend;
use rocket::{
    fairing::{Fairing, Info, Kind},
    get,
    http::Header,
    options, routes,
    serde::{Deserialize, Serialize},
    Request, Response, State,
};
use rocket_dyn_templates::tera::Tera;
use rocket_okapi::okapi::schemars;
use rocket_okapi::okapi::schemars::JsonSchema;
use rocket_okapi::{
    openapi, openapi_get_routes,
    swagger_ui::{make_swagger_ui, SwaggerUIConfig},
};
use rusty_paseto::prelude::*;
use sqlx::PgPool;

#[cfg(feature = "shuttle")]
use shuttle_rocket::ShuttleRocket;
#[cfg(feature = "shuttle")]
use shuttle_runtime::SecretStore;

#[macro_use]
mod error;

mod auth;
mod controllers;
mod repositories;
mod routes;
mod scheduler;
mod util;

#[derive(Serialize, Deserialize, JsonSchema, Debug)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
struct RootResponse {
    value: String,
}

custom_errors!(HealthzError, NotFound);

#[openapi]
#[get("/healthz", format = "json")]
async fn healthz(
    pool: &State<PgPool>,
) -> Result<rocket::response::status::NoContent, HealthzError> {
    // Make a simple query to test connection to the database
    match sqlx::query!("SELECT 1 AS id").fetch_one(pool.inner()).await {
        Ok(_) => Ok(rocket::response::status::NoContent),
        Err(_) => Err(HealthzError::NotFound(
            "Error getting database ID".to_string(),
        )),
    }
}

#[options("/<_..>")]
const fn all_options() -> rocket::response::status::NoContent {
    rocket::response::status::NoContent
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
                    "POST, GET, PUT, PATCH, DELETE, OPTIONS",
                ));
                response.set_header(Header::new("Access-Control-Allow-Headers", "*"));
                response.set_header(Header::new("Access-Control-Allow-Credentials", "true"));
            }
        }
    }
}

const EMAIL_TEMPLATES: [(&str, &str); 4] = [
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

        <p>Alternatively, go to <a href="https://calandar.org/verify_email">https://calandar.org/verify_email</a> and enter the following token:</p>

        <code>{{ token }}</code>

        <p>If you did not request this email, please ignore it.</p>

        <p>Happy hunting,</p>

        <p>Lewis</p>
    {% endblock content %}
    "#,
    ),
    (
        "email_custom.html.tera",
        r#"
    {% extends "email_base.html.tera" %}

    {% block content %}
        <p>Hello,</p>

        <p>This is an update about <strong>{{ title }}</strong>.</p>

        <p>Event details:</p>
        <ul>
            <li><strong>Starts:</strong> {{ time_begin }}</li>
            <li><strong>Ends:</strong> {{ time_end }}</li>
        </ul>

        <p>{{ message | linebreaksbr }}</p>

        <p>You can view more details and manage your RSVP at <a href="https://calandar.org">calandar.org</a>.</p>

        <p>See you there,</p>

        <p>Lewis</p>
    {% endblock content %}
    "#,
    ),
];

// Build the Rocket instance with all configuration
fn build_rocket(
    pool: PgPool,
    paseto_symmetric_key: PasetoSymmetricKey<V4, Local>,
    email_sender: Resend,
    steam_api_key: String,
    tera: Tera,
) -> rocket::Rocket<rocket::Build> {
    log::info!("Building our rocket...");
    #[allow(clippy::no_effect_underscore_binding)]
    let rocket = rocket::build()
        .attach(CORS)
        .manage::<PgPool>(pool)
        .manage::<PasetoSymmetricKey<V4, Local>>(paseto_symmetric_key)
        .manage::<Resend>(email_sender)
        .manage::<String>(steam_api_key)
        .manage::<Tera>(tera)
        .mount("/", routes![all_options])
        .mount(
            "/api",
            openapi_get_routes![
                healthz,
                routes::activity_ticker::get_activity_ticker,
                routes::auth::login,
                routes::auth::verify_email,
                routes::events::get_all,
                routes::events::get_all_user,
                routes::events::get,
                routes::events::get_user,
                routes::events::post,
                routes::events::put,
                routes::events::delete,
                routes::event_invitations::post,
                routes::event_invitations::resend,
                routes::event_invitations::get,
                routes::event_invitations::get_all_user,
                routes::event_invitations::get_all,
                routes::event_invitations::delete,
                routes::event_invitations::patch_admin,
                routes::event_invitations::patch,
                routes::event_invitations::send_custom_email,
                routes::event_seating::get,
                routes::event_seating::get_user,
                routes::event_seating::put,
                routes::rooms::get_all,
                routes::rooms::get_all_user,
                routes::rooms::get,
                routes::rooms::get_user,
                routes::rooms::post,
                routes::rooms::put,
                routes::rooms::delete,
                routes::seats::get_all,
                routes::seats::get_all_user,
                routes::seats::get_user,
                routes::seats::get,
                routes::seats::post,
                routes::seats::put,
                routes::seats::delete,
                routes::seat_reservations::get_all,
                routes::seat_reservations::get_me,
                routes::seat_reservations::post_me,
                routes::seat_reservations::post_admin,
                routes::seat_reservations::put_me,
                routes::seat_reservations::delete_me,
                routes::seat_reservations::put_admin,
                routes::seat_reservations::delete_admin,
                routes::seat_reservations::check_availability,
                routes::games::steam_game_update_v2,
                routes::games::get_steam_game,
                routes::event_games::get_all,
                routes::event_games::get_all_suggested,
                routes::event_games::post,
                routes::event_games::patch,
                routes::event_games::update_comment,
                routes::game_schedule::get_all,
                routes::game_schedule::create,
                routes::game_schedule::update,
                routes::game_schedule::delete,
                routes::game_schedule::pin,
                routes::game_schedule::recalculate_suggested_schedule,
                routes::profiles::get,
                routes::profiles::put,
                routes::profiles::put_admin,
                routes::profiles::post_games_update,
                routes::gamers::get_all_paginated,
                routes::gamers::get_all,
                routes::audit_logs::get_audit_logs,
            ],
        )
        .mount(
            "/api/docs/",
            make_swagger_ui(&SwaggerUIConfig {
                url: "../openapi.json".to_owned(),
                ..Default::default()
            }),
        );

    rocket
}

#[cfg(feature = "shuttle")]
#[allow(clippy::too_many_lines)]
#[shuttle_runtime::main]
async fn rocket(
    #[shuttle_shared_db::Postgres] pool: PgPool,
    #[shuttle_runtime::Secrets] secret_store: SecretStore,
) -> ShuttleRocket {
    log::info!("Launching application!");
    match sqlx::migrate!().run(&pool).await {
        Ok(()) => log::info!("Migrations ran successfully"),
        Err(e) => log::error!("Error running migrations: {e}"),
    }

    // Get the discord token set in `Secrets.toml` from the AWS RDS Postgres database
    let Some(paseto_secret_key) = secret_store.get("PASETO_SECRET_KEY") else {
        return Err(anyhow!("failed to get PASETO_SECRET_KEY from secrets store").into());
    };

    log::info!("PASETO_SECRET_KEY obtained.");

    let paseto_symmetric_key =
        PasetoSymmetricKey::<V4, Local>::from(Key::from(paseto_secret_key.as_bytes()));

    log::info!("Paseto key created.");

    let Some(resend_api_key) = secret_store.get("RESEND_API_KEY") else {
        return Err(anyhow!("failed to get RESEND_API_KEY from secrets store").into());
    };

    log::info!("RESEND_API_KEY obtained.");

    let email_sender = Resend::new(&resend_api_key);

    log::info!("Resend sender created.");

    let Some(steam_api_key) = secret_store.get("STEAM_API_KEY") else {
        return Err(anyhow!("failed to get STEAM_API_KEY from secrets store").into());
    };

    log::info!("STEAM_API_KEY obtained.");

    let mut tera = Tera::default();
    match tera.add_raw_templates(EMAIL_TEMPLATES) {
        Ok(()) => log::info!("Tera templates added."),
        Err(e) => log::error!("Error adding Tera templates: {e}"),
    }

    let rocket = build_rocket(
        pool,
        paseto_symmetric_key,
        email_sender,
        steam_api_key,
        tera,
    );

    Ok(rocket.into())
}

#[cfg(not(feature = "shuttle"))]
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize logging
    env_logger::init();

    log::info!("Starting CaLANdar API in standalone mode");

    // Load environment variables from .env file if present
    dotenvy::dotenv().ok();

    // Get database URL from environment
    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");

    log::info!("Connecting to database...");

    // Create database pool
    let pool = PgPool::connect(&database_url)
        .await
        .expect("Failed to connect to database");

    log::info!("Database connected successfully");

    // Run migrations
    log::info!("Running database migrations...");
    match sqlx::migrate!().run(&pool).await {
        Ok(()) => log::info!("Migrations ran successfully"),
        Err(e) => {
            log::error!("Error running migrations: {e}");
            return Err(e.into());
        }
    }

    // Get secrets from environment variables
    let paseto_secret_key =
        std::env::var("PASETO_SECRET_KEY").expect("PASETO_SECRET_KEY must be set");

    log::info!("PASETO_SECRET_KEY obtained.");

    let paseto_symmetric_key =
        PasetoSymmetricKey::<V4, Local>::from(Key::from(paseto_secret_key.as_bytes()));

    log::info!("Paseto key created.");

    let resend_api_key = std::env::var("RESEND_API_KEY").expect("RESEND_API_KEY must be set");

    log::info!("RESEND_API_KEY obtained.");

    let email_sender = Resend::new(&resend_api_key);

    log::info!("Resend sender created.");

    let steam_api_key = std::env::var("STEAM_API_KEY").expect("STEAM_API_KEY must be set");

    log::info!("STEAM_API_KEY obtained.");

    let mut tera = Tera::default();
    match tera.add_raw_templates(EMAIL_TEMPLATES) {
        Ok(()) => log::info!("Tera templates added."),
        Err(e) => log::error!("Error adding Tera templates: {e}"),
    }

    // Configure Rocket
    let mut config = rocket::Config::default();

    // Get port from environment variable (Cloud Run uses PORT)
    if let Ok(port) = std::env::var("PORT") {
        config.port = port.parse().expect("PORT must be a valid number");
        log::info!("Using PORT from environment: {}", config.port);
    } else {
        config.port = 8080;
        log::info!("Using default PORT: 8080");
    }

    config.address = "0.0.0.0".parse().expect("Failed to parse address");

    // Store values before moving config
    let address = config.address;
    let port = config.port;

    let rocket = build_rocket(
        pool,
        paseto_symmetric_key,
        email_sender,
        steam_api_key,
        tera,
    )
    .configure(config);

    log::info!("Launching Rocket on {}:{}", address, port);

    // Launch Rocket
    let _rocket = rocket.launch().await?;

    Ok(())
}
