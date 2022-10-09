#[macro_use]
extern crate rocket;
use rocket::fairing::{Fairing, Info, Kind};
use rocket::http::Header;
use rocket::{Request, Response};
use shuttle_service::ShuttleRocket;
use sqlx::postgres::PgPool;

#[get("/")]
async fn index(pool: &rocket::State<PgPool>) -> String {
    // Make a simple query to return the given parameter (use a question mark `?` instead of `$1` for MySQL)
    let test_id: i32 = match sqlx::query!("SELECT id FROM test")
        .fetch_one(pool.inner())
        .await
    {
        Ok(test_id) => test_id.id,
        Err(e) => {
            // One day we should handle errors better (HTTP return codes)
            println!("Error: {}", e);
            return "Error".to_string();
        }
    };

    let output = format!("Hello {test_id}!");

    output
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

    async fn on_response<'r>(&self, _request: &'r Request<'_>, response: &mut Response<'r>) {
        response.set_header(Header::new("Access-Control-Allow-Origin", "*"));
        response.set_header(Header::new(
            "Access-Control-Allow-Methods",
            "POST, GET, PATCH, OPTIONS",
        ));
        response.set_header(Header::new("Access-Control-Allow-Headers", "*"));
        response.set_header(Header::new("Access-Control-Allow-Credentials", "true"));
    }
}

#[shuttle_service::main]
async fn rocket(#[shared::Postgres] pool: PgPool) -> ShuttleRocket {
    sqlx::migrate!()
        .run(&pool)
        .await
        .expect("Failed to migrate database.");

    #[allow(clippy::no_effect_underscore_binding)]
    let rocket = rocket::build()
        .attach(CORS)
        .manage::<PgPool>(pool)
        .mount("/api", routes![index]);

    Ok(rocket)
}
