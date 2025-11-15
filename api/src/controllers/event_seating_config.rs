use sqlx::PgPool;

use crate::{
    controllers::Error,
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

pub async fn upsert(
    pool: &PgPool,
    event_id: i32,
    config: EventSeatingConfigSubmit,
) -> Result<EventSeatingConfig, Error> {
    match event_seating_config::upsert(
        pool,
        event_id,
        config.has_seating,
        config.allow_unspecified_seat,
        config.unspecified_seat_label,
    )
    .await
    {
        Ok(config) => Ok(EventSeatingConfig::from(config)),
        Err(e) => Err(Error::Controller(format!(
            "Unable to save seating config due to: {e}"
        ))),
    }
}
