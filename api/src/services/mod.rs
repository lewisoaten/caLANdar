// Services module - Framework-agnostic business logic
pub mod event;
pub mod auth;
pub mod profile;
pub mod game;

use crate::dto::{ServiceError, ServiceResult};
use sqlx::PgPool;

// Common traits and dependencies for all services
pub trait DatabasePool {
    fn get_pool(&self) -> &PgPool;
}

// Concrete implementation for PgPool
impl DatabasePool for PgPool {
    fn get_pool(&self) -> &PgPool {
        self
    }
}