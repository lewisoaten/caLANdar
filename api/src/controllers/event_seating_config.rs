use sqlx::PgPool;

use crate::{
    controllers::{ensure_user_invited, Error},
    repositories::event_seating_config,
    routes::event_seating::{EventSeatingConfig, EventSeatingConfigSubmit},
};

impl From<crate::repositories::event_seating_config::EventSeatingConfig> for EventSeatingConfig {
    fn from(config: crate::repositories::event_seating_config::EventSeatingConfig) -> Self {
        Self {
            event_id: config.event_id,
            has_seating: config.has_seating,
            allow_unspecified_seat: config.allow_unspecified_seat,
            unspecified_seat_label: config.unspecified_seat_label,
            created_at: config.created_at,
            last_modified: config.last_modified,
        }
    }
}

pub async fn get(pool: &PgPool, event_id: i32) -> Result<Option<EventSeatingConfig>, Error> {
    match event_seating_config::get(pool, event_id).await {
        Ok(Some(config)) => Ok(Some(EventSeatingConfig::from(config))),
        Ok(None) => Ok(None),
        Err(e) => Err(Error::Controller(format!(
            "Unable to get seating config due to: {e}"
        ))),
    }
}

pub async fn get_or_default(pool: &PgPool, event_id: i32) -> Result<EventSeatingConfig, Error> {
    get(pool, event_id)
        .await?
        .map_or_else(|| Ok(default_config(event_id)), Ok)
}

pub async fn get_or_default_for_invited_user(
    pool: &PgPool,
    event_id: i32,
    email: &str,
) -> Result<EventSeatingConfig, Error> {
    ensure_user_invited(pool, event_id, email).await?;
    get_or_default(pool, event_id).await
}

pub async fn upsert(
    pool: &PgPool,
    event_id: i32,
    config: EventSeatingConfigSubmit,
    user_email: String,
) -> Result<EventSeatingConfig, Error> {
    match event_seating_config::upsert(
        pool,
        event_id,
        config.has_seating,
        config.allow_unspecified_seat,
        config.unspecified_seat_label.clone(),
    )
    .await
    {
        Ok(config_result) => {
            // Log audit entry
            let metadata = rocket::serde::json::serde_json::json!({
                "event_id": event_id,
                "has_seating": config.has_seating,
                "allow_unspecified_seat": config.allow_unspecified_seat,
                "unspecified_seat_label": config.unspecified_seat_label,
            });
            crate::util::log_audit(
                pool,
                Some(user_email),
                "event_seating_config.update".to_string(),
                "event_seating_config".to_string(),
                Some(event_id.to_string()),
                Some(metadata),
            )
            .await;

            Ok(EventSeatingConfig::from(config_result))
        }
        Err(e) => Err(Error::Controller(format!(
            "Unable to save seating config due to: {e}"
        ))),
    }
}

fn default_config(event_id: i32) -> EventSeatingConfig {
    EventSeatingConfig {
        event_id,
        has_seating: false,
        allow_unspecified_seat: false,
        unspecified_seat_label: "Unspecified Seat".to_string(),
        created_at: chrono::Utc::now(),
        last_modified: chrono::Utc::now(),
    }
}
