use std::fmt::Display;

pub mod event;
pub mod event_invitation;

// Custom controller error
#[derive(Debug)]
pub enum Error {
    // Custom error type
    Controller(String),
    BadInput(String),
    NoData(String),
    NotPermitted(String),
}

impl Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Error::Controller(reason)
            | Error::BadInput(reason)
            | Error::NoData(reason)
            | Error::NotPermitted(reason) => reason.fmt(f),
        }
    }
}
