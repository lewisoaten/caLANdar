// Data Transfer Objects - Framework-agnostic request/response types
use chrono::{prelude::Utc, DateTime};
use rocket::serde::{Deserialize, Serialize};

pub mod event;
pub mod auth;
pub mod profile;
pub mod game;

// Common error types for service layer
#[derive(Debug, Clone)]
pub enum ServiceError {
    BadInput(String),
    NotFound(String),
    Unauthorized(String),
    InternalError(String),
    NotPermitted(String),
}

impl std::fmt::Display for ServiceError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ServiceError::BadInput(msg) => write!(f, "Bad input: {}", msg),
            ServiceError::NotFound(msg) => write!(f, "Not found: {}", msg),
            ServiceError::Unauthorized(msg) => write!(f, "Unauthorized: {}", msg),
            ServiceError::InternalError(msg) => write!(f, "Internal error: {}", msg),
            ServiceError::NotPermitted(msg) => write!(f, "Not permitted: {}", msg),
        }
    }
}

impl std::error::Error for ServiceError {}

// Common result type for service operations
pub type ServiceResult<T> = Result<T, ServiceError>;