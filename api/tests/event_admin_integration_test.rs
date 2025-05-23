#[cfg(test)]
mod tests {
    use rocket::http::{ContentType, Status};
    use rocket::local::blocking::Client;
    use rocket::serde::json::serde_json;
    use chrono::{Utc, Duration};
    use rusty_paseto::prelude::*;
    use sqlx::PgPool;
    use sendgrid::v3::Sender; // Mock or minimal setup
    use rocket_dyn_templates::tera::Tera;

    // Assuming these structs are accessible from your crate.
    // `crate::` refers to the root of the `api` crate.
    use crate::routes::events::{Event, EventSubmit};
    use crate::auth::PasetoToken; // For generating test token, if needed, though direct generation is simpler
    use crate::{RootResponse, healthz, all_options}; // Import items from main.rs
    use crate::routes; // Import routes module

    use rocket_okapi::{openapi_get_routes, swagger_ui::{make_swagger_ui, SwaggerUIConfig}};
    use crate::CORS; // Import CORS fairing

    // Helper function to create a Rocket instance for testing
    async fn create_test_rocket() -> rocket::Rocket<rocket::Build> {
        let test_paseto_secret = "supersecretsupersecretsupersecret"; // 32 bytes, MUST BE KEPT IN SYNC if used elsewhere
        let paseto_symmetric_key = PasetoSymmetricKey::<V4, Local>::from(
            Key::from(test_paseto_secret.as_bytes())
        );

        let database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://testuser:testpassword@localhost/testdb".to_string());
        
        let pool = PgPool::connect(&database_url)
            .await
            .expect("Failed to connect to test database");

        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .expect("Failed to run migrations on test database");

        let sendgrid_api_key = std::env::var("SENDGRID_API_KEY").unwrap_or_else(|_| "test_sendgrid_key".to_string());
        let email_sender = Sender::new(sendgrid_api_key);
        
        let steam_api_key = std::env::var("STEAM_API_KEY").unwrap_or_else(|_| "test_steam_key".to_string());

        let mut tera = Tera::default();
        // These are the templates from main.rs.
        // In a real scenario, these might be loaded from files or a shared module.
        let email_templates: [(&str, &str); 3] = [
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
            {% block content %}Invite to {{ name }} for {{ title }}{% endblock content %}
            "#, // Simplified for test
            ),
            (
                "email_verification.html.tera",
                r#"
            {% extends "email_base.html.tera" %}
            {% block content %}Verify {{ name }} with token {{ token }}{% endblock content %}
            "#, // Simplified for test
            ),
        ];
        match tera.add_raw_templates(email_templates) {
            Ok(_) => (),
            Err(e) => panic!("Failed to add Tera templates: {}", e),
        };

        rocket::build()
            .attach(CORS)
            .manage(pool)
            .manage(paseto_symmetric_key)
            .manage(email_sender)
            .manage(steam_api_key) // Manage the steam_api_key as String
            .manage(tera)
            .mount("/", routes![all_options]) // Mount options route from main.rs
            .mount( // Mount API routes from main.rs
                "/api",
                openapi_get_routes![
                    healthz, // healthz from main.rs
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
            .mount( // Mount Swagger UI from main.rs
                "/api/docs/",
                make_swagger_ui(&SwaggerUIConfig {
                    url: "../openapi.json".to_owned(),
                    ..Default::default()
                }),
            )
    }
    
    fn setup_client_with_admin_auth() -> Client {
        let test_paseto_secret = "supersecretsupersecretsupersecret"; // Must be the same as in create_test_rocket
        let paseto_key = PasetoSymmetricKey::<V4, Local>::from(
            Key::from(test_paseto_secret.as_bytes())
        );

        let admin_email = "lewis@oaten.name"; 

        let expiration_claim = ExpirationClaim::try_from(
            (Utc::now() + Duration::days(7)).to_rfc3339()
        ).expect("Failed to create expiration claim");

        let api_token_str = PasetoBuilder::<V4, Local>::default()
            .set_claim(expiration_claim)
            .set_claim(IssuerClaim::from("calandar.org")) 
            .set_claim(TokenIdentifierClaim::from("api")) 
            .set_claim(SubjectClaim::from(admin_email))
            .build(&paseto_key)
            .expect("Failed to build admin API token");

        let rocket_instance_future = create_test_rocket();
        let rocket_instance = rocket::tokio::runtime::Runtime::new()
            .unwrap()
            .block_on(rocket_instance_future);

        let client = Client::tracked(rocket_instance).expect("valid rocket instance");
        
        client.header(rocket::http::Header::new("Authorization", format!("Bearer {}", api_token_str)))
        // No longer returning PasetoKey as it's self-contained for token generation here
    }

    #[rocket::async_test] // Changed to rocket::async_test for async client calls if needed, but Client::tracked is blocking.
                           // However, setup might involve async, so this is safer. Or use a plain #[test] and block_on within.
                           // For blocking client, #[test] is fine.
    #[test] // Sticking with #[test] as Client is blocking.
    fn test_admin_event_crud_lifecycle() {
        let client = setup_client_with_admin_auth(); // Client is already configured with auth header
        
        let start_time = Utc::now() + Duration::days(1);
        let end_time = start_time + Duration::hours(3);

        let event_data = EventSubmit {
            title: "Admin Test Event".to_string(),
            description: "An event created by an admin for testing CRUD operations.".to_string(),
            image: None, // Or Some("base64_encoded_image_string".to_string())
            time_begin: start_time,
            time_end: end_time,
        };
        let event_data_json = serde_json::to_string(&event_data).expect("Failed to serialize event data");

        // 1. Create Event
        let create_response = client.post("/api/events?as_admin=true")
            .header(ContentType::JSON)
            .body(&event_data_json)
            .dispatch();
        
        assert_eq!(create_response.status(), Status::Created);
        let created_event: Event = create_response.into_json().expect("Expected event JSON from create");
        let event_id = created_event.id;
        assert_eq!(created_event.title, event_data.title);

        // 2. Retrieve Event
        let get_response = client.get(format!("/api/events/{}?as_admin=true", event_id))
            .dispatch();
        assert_eq!(get_response.status(), Status::Ok);
        let fetched_event: Event = get_response.into_json().expect("Expected event JSON from get");
        assert_eq!(fetched_event.id, event_id);
        assert_eq!(fetched_event.title, event_data.title);

        // 3. Update Event
        let updated_event_data = EventSubmit {
            title: "Admin Test Event [UPDATED]".to_string(),
            description: "Updated description.".to_string(),
            image: None,
            time_begin: start_time, // Keep times or update as needed
            time_end: end_time,
        };
        let updated_event_data_json = serde_json::to_string(&updated_event_data).expect("Failed to serialize updated event data");

        let update_response = client.put(format!("/api/events/{}?as_admin=true", event_id))
            .header(ContentType::JSON)
            .body(&updated_event_data_json)
            .dispatch();
        assert_eq!(update_response.status(), Status::NoContent);

        // 4. Verify Update
        let verify_update_response = client.get(format!("/api/events/{}?as_admin=true", event_id))
            .dispatch();
        assert_eq!(verify_update_response.status(), Status::Ok);
        let verified_event: Event = verify_update_response.into_json().expect("Expected event JSON from verify update");
        assert_eq!(verified_event.title, updated_event_data.title);
        assert_eq!(verified_event.description, updated_event_data.description);

        // 5. Delete Event
        let delete_response = client.delete(format!("/api/events/{}?as_admin=true", event_id))
            .dispatch();
        assert_eq!(delete_response.status(), Status::NoContent);

        // 6. Verify Deletion
        let verify_delete_response = client.get(format!("/api/events/{}?as_admin=true", event_id))
            .dispatch();
        assert_eq!(verify_delete_response.status(), Status::NotFound);
    }
}
