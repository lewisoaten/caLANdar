use std::fmt::Display;

use sqlx::PgPool;

use crate::repositories::invitation;

pub mod event;
pub mod event_invitation;
pub mod event_seating_config;
pub mod game;
pub mod game_suggestion;
pub mod gamer;
pub mod profile;
pub mod room;
pub mod seat;
pub mod seat_reservation;

// Custom controller error
#[derive(Debug)]
pub enum Error {
    // Custom error type
    Controller(String),
    BadInput(String),
    NoData(String),
    NotPermitted(String),
    Conflict(String),
    NotFound(String),
}

pub async fn ensure_user_invited(pool: &PgPool, event_id: i32, email: &str) -> Result<(), Error> {
    match invitation::filter(
        pool,
        invitation::Filter {
            event_id: Some(event_id),
            email: Some(email.to_string()),
        },
    )
    .await
    {
        Ok(invitations) if invitations.is_empty() => Err(Error::NotPermitted(format!(
            "No invitation found for {email} at event {event_id}"
        ))),
        Ok(_) => Ok(()),
        Err(e) => Err(Error::Controller(format!(
            "Unable to verify invitation for {email}: {e}"
        ))),
    }
}

impl Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Error::Controller(reason)
            | Error::BadInput(reason)
            | Error::NoData(reason)
            | Error::NotPermitted(reason)
            | Error::Conflict(reason)
            | Error::NotFound(reason) => reason.fmt(f),
        }
    }
}
