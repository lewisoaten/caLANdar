use crate::{auth::AdminUser, controllers::gamer};
use chrono::{prelude::Utc, DateTime};
use rocket::{
    get,
    serde::{json::Json, Serialize},
    State,
};
use rocket_okapi::okapi::schemars;
use rocket_okapi::okapi::schemars::JsonSchema;
use rocket_okapi::openapi;
use sqlx::postgres::PgPool;

use super::{events::Event, SchemaExample};

/// A user of the system with full event details
#[derive(Clone, Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
#[schemars(example = "Self::example")]
pub struct Gamer {
    pub email: String,
    pub avatar_url: String,
    pub handles: Vec<String>,
    pub steam_id: Option<String>,
    pub events_invited: Vec<Event>,
    pub events_accepted: Vec<Event>,
    pub events_tentative: Vec<Event>,
    pub events_declined: Vec<Event>,
    pub events_last_response: Option<DateTime<Utc>>,
    pub games_owned_count: u16,
    pub games_owned_last_modified: Option<DateTime<Utc>>,
}

/// A user of the system with summary data (for pagination)
#[derive(Clone, Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
#[schemars(example = "Self::example")]
pub struct GamerSummary {
    pub email: String,
    pub avatar_url: String,
    pub handles: Vec<String>,
    pub steam_id: Option<String>,
    pub events_invited_count: i64,
    pub events_accepted_count: i64,
    pub events_tentative_count: i64,
    pub events_declined_count: i64,
    pub events_last_response: Option<DateTime<Utc>>,
    pub games_owned_count: i64,
    pub games_owned_last_modified: Option<DateTime<Utc>>,
}

/// Paginated response for gamers
#[derive(Clone, Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct PaginatedGamersResponse {
    pub gamers: Vec<GamerSummary>,
    pub total: i64,
    pub page: i64,
    pub limit: i64,
    pub total_pages: i64,
}

impl SchemaExample for Gamer {
    fn example() -> Self {
        Self {
            email: "test@gamer.example".to_string(),
            avatar_url: "https://www.gravatar.com/avatar/27205e5c51cb03f862138b22bcb5dc20f94a342e744ff6df1b8dc8af3c865109?d=robohash".to_string(),
            handles: vec!["test_gamer".to_string(), "test_gamer2".to_string()],
            steam_id: Some("12345678901234567".to_string()),
            events_invited: vec![Event::example()],
            events_accepted: vec![Event::example()],
            events_tentative: vec![Event::example()],
            events_declined: vec![Event::example()],
            events_last_response: Some(Utc::now()),
            games_owned_count: 12345,
            games_owned_last_modified: Some(Utc::now()),
        }
    }
}

impl SchemaExample for GamerSummary {
    fn example() -> Self {
        Self {
            email: "test@gamer.example".to_string(),
            avatar_url: "https://www.gravatar.com/avatar/27205e5c51cb03f862138b22bcb5dc20f94a342e744ff6df1b8dc8af3c865109?d=robohash".to_string(),
            handles: vec!["test_gamer".to_string(), "test_gamer2".to_string()],
            steam_id: Some("12345678901234567".to_string()),
            events_invited_count: 5,
            events_accepted_count: 3,
            events_tentative_count: 1,
            events_declined_count: 1,
            events_last_response: Some(Utc::now()),
            games_owned_count: 12345,
            games_owned_last_modified: Some(Utc::now()),
        }
    }
}

impl SchemaExample for PaginatedGamersResponse {
    fn example() -> Self {
        Self {
            gamers: vec![GamerSummary::example()],
            total: 100,
            page: 1,
            limit: 20,
            total_pages: 5,
        }
    }
}

custom_errors!(GamersGetError, NotFound, InternalServerError);

/// Get all users across all events as an administrator
/// Will return an empty list if no users are found.
#[openapi(tag = "Gamers")]
#[get("/gamers?<_as_admin>", format = "json", rank = 2)]
pub async fn get_all(
    pool: &State<PgPool>,
    _as_admin: Option<bool>,
    _user: AdminUser,
) -> Result<Json<Vec<Gamer>>, GamersGetError> {
    match gamer::get_all(pool).await {
        Ok(gamers) => Ok(Json(gamers)),
        Err(e) => Err(GamersGetError::InternalServerError(format!(
            "Error getting events, due to: {e}"
        ))),
    }
}

/// Get paginated list of users across all events as an administrator.
/// Supports pagination and search functionality.
///
/// Query parameters:
/// - page: Page number (default: 1, must be >= 1)
/// - limit: Items per page (default: 20, range: 1-100)
/// - search: Optional search string to filter by email or handle
#[openapi(tag = "Gamers")]
#[get("/gamers?<_as_admin>&<page>&<limit>&<search>", format = "json", rank = 1)]
pub async fn get_all_paginated(
    pool: &State<PgPool>,
    _as_admin: Option<bool>,
    page: Option<i64>,
    limit: Option<i64>,
    search: Option<String>,
    _user: AdminUser,
) -> Result<Json<PaginatedGamersResponse>, GamersGetError> {
    let page = page.unwrap_or(1).max(1);
    let limit = limit.unwrap_or(20).clamp(1, 100);

    match gamer::get_all_paginated(pool, page, limit, search).await {
        Ok(response) => Ok(Json(PaginatedGamersResponse {
            gamers: response.gamers,
            total: response.total,
            page: response.page,
            limit: response.limit,
            total_pages: response.total_pages,
        })),
        Err(e) => Err(GamersGetError::InternalServerError(format!(
            "Error getting paginated gamers, due to: {e}"
        ))),
    }
}
