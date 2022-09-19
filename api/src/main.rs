#[macro_use]
extern crate rocket;
use sqlx::postgres::PgPool;
use sqlx::postgres::PgPoolOptions;

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

#[launch]
async fn rocket() -> _ {
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect("postgres://postgres:password@db/calandar")
        .await
        .expect("Failed to create pool.");

    sqlx::migrate!()
        .run(&pool)
        .await
        .expect("Failed to migrate database.");

    rocket::build()
        .manage::<PgPool>(pool)
        .mount("/api", routes![index])
}
