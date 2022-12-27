use std::fmt::Display;

pub mod event;

// Custom controller error
#[derive(Debug)]
pub enum Error {
    // Custom error type
    Controller(String),
    BadInput(String),
    NoData(String),
}

impl Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Error::Controller(reason) | Error::BadInput(reason) | Error::NoData(reason) => {
                reason.fmt(f)
            }
        }
    }
}
