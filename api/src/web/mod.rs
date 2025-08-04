// Web framework abstractions - Traits to abstract away web framework specifics
use crate::dto::{ServiceError, ServiceResult};

pub mod rocket;

/// Trait for extracting authenticated user information from requests
pub trait UserExtractor {
    fn extract_user(&self) -> Result<String, ServiceError>;
    fn extract_admin_user(&self) -> Result<String, ServiceError>;
}

/// Trait for handling HTTP responses in a framework-agnostic way
pub trait ResponseBuilder {
    type Response;
    type JsonResponse<T>;
    type ErrorResponse;
    
    fn ok<T>(data: T) -> Self::JsonResponse<T>;
    fn created<T>(data: T) -> Self::JsonResponse<T>;
    fn no_content() -> Self::Response;
    fn bad_request(message: String) -> Self::ErrorResponse;
    fn unauthorized(message: String) -> Self::ErrorResponse;
    fn not_found(message: String) -> Self::ErrorResponse;
    fn internal_error(message: String) -> Self::ErrorResponse;
}

/// Helper function to map service errors to HTTP responses
pub fn map_service_error_to_response<R: ResponseBuilder>(error: ServiceError) -> R::ErrorResponse {
    match error {
        ServiceError::BadInput(msg) => R::bad_request(msg),
        ServiceError::NotFound(msg) => R::not_found(msg),
        ServiceError::Unauthorized(msg) => R::unauthorized(msg),
        ServiceError::NotPermitted(msg) => R::unauthorized(msg),
        ServiceError::InternalError(msg) => R::internal_error(msg),
    }
}

/// Trait for dependency injection of database and other dependencies
pub trait Dependencies {
    type Pool;
    
    fn get_pool(&self) -> &Self::Pool;
}