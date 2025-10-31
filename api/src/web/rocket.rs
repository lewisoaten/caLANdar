// Rocket-specific implementations of web framework abstractions
use crate::auth::{AdminUser, User};
use crate::dto::{ServiceError, ServiceResult};
use crate::error;
use crate::web::{Dependencies, ResponseBuilder, UserExtractor};
use rocket::response::status;
use rocket::serde::json::Json;
use rocket::{State};
use sqlx::PgPool;

// Rocket implementation of UserExtractor
impl UserExtractor for User {
    fn extract_user(&self) -> Result<String, ServiceError> {
        Ok(self.email.clone())
    }

    fn extract_admin_user(&self) -> Result<String, ServiceError> {
        Err(ServiceError::Unauthorized("Admin access required".to_string()))
    }
}

impl UserExtractor for AdminUser {
    fn extract_user(&self) -> Result<String, ServiceError> {
        Ok(self.email.clone())
    }

    fn extract_admin_user(&self) -> Result<String, ServiceError> {
        Ok(self.email.clone())
    }
}

// Rocket implementation of ResponseBuilder
pub struct RocketResponseBuilder;

impl ResponseBuilder for RocketResponseBuilder {
    type Response = status::NoContent;
    type JsonResponse<T> = Json<T>;
    type ErrorResponse = RocketError;

    fn ok<T>(data: T) -> Self::JsonResponse<T> {
        Json(data)
    }

    fn created<T>(data: T) -> Self::JsonResponse<T> {
        Json(data)
    }

    fn no_content() -> Self::Response {
        status::NoContent
    }

    fn bad_request(message: String) -> Self::ErrorResponse {
        RocketError::BadRequest(error::BadRequest(message))
    }

    fn unauthorized(message: String) -> Self::ErrorResponse {
        RocketError::Unauthorized(error::Unauthorized(message))
    }

    fn not_found(message: String) -> Self::ErrorResponse {
        RocketError::NotFound(error::NotFound(message))
    }

    fn internal_error(message: String) -> Self::ErrorResponse {
        RocketError::InternalServerError(error::InternalServerError(message))
    }
}

// Wrapper enum for Rocket error types
pub enum RocketError {
    BadRequest(error::BadRequest),
    Unauthorized(error::Unauthorized),
    NotFound(error::NotFound),
    InternalServerError(error::InternalServerError),
}

// Rocket implementation of Dependencies
impl Dependencies for State<PgPool> {
    type Pool = PgPool;
    
    fn get_pool(&self) -> &Self::Pool {
        self.inner()
    }
}