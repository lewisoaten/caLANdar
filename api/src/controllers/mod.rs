use std::fmt::Display;

pub mod event;

// Custom controller error
#[derive(Debug)]
pub enum Error {
    // Custom error type
    ControllerError(String),
    NoDataError(String),
}

impl Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Error::ControllerError(reason) | Error::NoDataError(reason) => reason.fmt(f),
        }
    }
}
