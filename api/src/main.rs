// Crate-wide project settings
#![forbid(unsafe_code)]
#![deny(clippy::pedantic, clippy::nursery, clippy::unwrap_used)]
#![allow(clippy::use_self)]

extern crate rocket;

use anyhow::anyhow;
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
use resend_rs::Resend;
use shuttle_rocket::ShuttleRocket;
use shuttle_runtime::SecretStore;
use sqlx::PgPool;

#[macro_use]
mod error;

mod auth;
mod controllers;
mod repositories;
mod routes;
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

        <p>Alternatively, go to <a href="https://calandar.org/verify_email">https://calandar.org/verify_email</a> and enter the following token:</p>

        <code>{{ token }}</code>

        <p>If you did not request this email, please ignore it.</p>

        <p>Happy hunting,</p>

        <p>Lewis</p>
    {% endblock content %}
    "#,
    ),
];

#[shuttle_runtime::main]
async fn rocket(
    #[shuttle_shared_db::Postgres] pool: PgPool,
    #[shuttle_runtime::Secrets] secret_store: SecretStore,
) -> ShuttleRocket {
    log::info!("Launching application!");
    match sqlx::migrate!().run(&pool).await {
        Ok(()) => log::info!("Migrations ran successfully"),
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

    let resend_api_key = if let Some(resend_api_key) = secret_store.get("RESEND_API_KEY") {
        resend_api_key
    } else {
        return Err(anyhow!("failed to get RESEND_API_KEY from secrets store").into());
    };

    log::info!("RESEND_API_KEY obtained.");

    let email_sender = Resend::new(&resend_api_key);

    log::info!("Resend sender created.");

    let steam_api_key = if let Some(steam_api_key) = secret_store.get("STEAM_API_KEY") {
        steam_api_key
    } else {
        return Err(anyhow!("failed to get STEAM_API_KEY from secrets store").into());
    };

    log::info!("STEAM_API_KEY obtained.");

    let mut tera = Tera::default();
    match tera.add_raw_templates(EMAIL_TEMPLATES) {
        Ok(()) => log::info!("Tera templates added."),
        Err(e) => log::error!("Error adding Tera templates: {}", e),
    };

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
                routes::event_invitations::get,
                routes::event_invitations::get_all_user,
                routes::event_invitations::get_all,
                routes::event_invitations::delete,
                routes::event_invitations::patch,
                routes::games::steam_game_update_v2,
                routes::games::get_steam_game,
                routes::event_games::get_all,
                routes::event_games::get_all_suggested,
                routes::event_games::post,
                routes::event_games::patch,
                routes::profiles::get,
                routes::profiles::put,
                routes::profiles::post_games_update,
                routes::gamers::get_all,
            ],
        )
        .mount(
            "/api/docs/",
            make_swagger_ui(&SwaggerUIConfig {
                url: "../openapi.json".to_owned(),
                ..Default::default()
            }),
        );

    Ok(rocket.into())
}
