use crate::{
    auth::{AdminUser, User},
    controllers::{seat_reservation, Error},
};
use chrono::{prelude::Utc, DateTime};
use rocket::{
    delete, get, post, put,
    serde::{json::Json, Deserialize, Serialize},
    State,
};
use rocket_okapi::okapi::schemars;
use rocket_okapi::okapi::schemars::JsonSchema;
use rocket_okapi::openapi;
use sqlx::postgres::PgPool;

use super::SchemaExample;

/// The response for seat reservation endpoints.
#[derive(Clone, Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
#[schemars(example = "Self::example")]
pub struct SeatReservation {
    /// The reservation ID.
    pub id: i32,

    /// The event ID this reservation belongs to.
    pub event_id: i32,

    /// The seat ID (None for unspecified seat).
    pub seat_id: Option<i32>,

    /// The email of the invited user who made the reservation.
    pub invitation_email: String,

    /// Attendance buckets (1=attending, 0=not attending) for each time period.
    pub attendance_buckets: Vec<u8>,

    /// The date the reservation was created.
    pub created_at: DateTime<Utc>,

    /// The last time this reservation was modified.
    pub last_modified: DateTime<Utc>,
}

impl SchemaExample for SeatReservation {
    fn example() -> Self {
        Self {
            id: 1,
            event_id: 1,
            seat_id: Some(5),
            invitation_email: "user@example.com".to_string(),
            attendance_buckets: vec![1, 1, 0, 1],
            created_at: Utc::now(),
            last_modified: Utc::now(),
        }
    }
}

/// The request body for creating/updating a seat reservation.
#[derive(Deserialize, Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
#[schemars(example = "Self::example")]
pub struct SeatReservationSubmit {
    /// The seat ID to reserve (None for unspecified seat).
    pub seat_id: Option<i32>,

    /// Attendance buckets indicating which time periods the user will attend.
    pub attendance_buckets: Vec<u8>,
}

impl SchemaExample for SeatReservationSubmit {
    fn example() -> Self {
        Self {
            seat_id: Some(5),
            attendance_buckets: vec![1, 1, 0, 1],
        }
    }
}

/// The request body for creating a seat reservation as admin (includes email).
#[derive(Deserialize, Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
#[schemars(example = "Self::example")]
pub struct SeatReservationAdminSubmit {
    /// The email of the user to create the reservation for.
    pub invitation_email: String,

    /// The seat ID to reserve (None for unspecified seat).
    pub seat_id: Option<i32>,

    /// Attendance buckets indicating which time periods the user will attend.
    pub attendance_buckets: Vec<u8>,
}

impl SchemaExample for SeatReservationAdminSubmit {
    fn example() -> Self {
        Self {
            invitation_email: "user@example.com".to_string(),
            seat_id: Some(5),
            attendance_buckets: vec![1, 1, 0, 1],
        }
    }
}

custom_errors!(
    SeatReservationGetAllError,
    Unauthorized,
    InternalServerError
);

/// Get all seat reservations for an event (admin only).
#[openapi(tag = "Seat Reservations")]
#[get("/events/<event_id>/seat-reservations?<_as_admin>", format = "json")]
pub async fn get_all(
    event_id: i32,
    pool: &State<PgPool>,
    _as_admin: Option<bool>,
    _user: AdminUser,
) -> Result<Json<Vec<SeatReservation>>, SeatReservationGetAllError> {
    match seat_reservation::get_all(pool, event_id).await {
        Ok(reservations) => Ok(Json(reservations)),
        Err(e) => Err(SeatReservationGetAllError::InternalServerError(format!(
            "Error getting seat reservations, due to: {e}"
        ))),
    }
}

custom_errors!(SeatReservationGetMeError, NotFound, InternalServerError);

/// Get the current user's seat reservation for an event.
#[openapi(tag = "Seat Reservations")]
#[get("/events/<event_id>/seat-reservations/me", format = "json")]
pub async fn get_me(
    event_id: i32,
    pool: &State<PgPool>,
    user: User,
) -> Result<Json<SeatReservation>, SeatReservationGetMeError> {
    match seat_reservation::get_by_email(pool, event_id, &user.email).await {
        Ok(Some(reservation)) => Ok(Json(reservation)),
        Ok(None) => Err(SeatReservationGetMeError::NotFound(
            "No seat reservation found for this event".to_string(),
        )),
        Err(e) => Err(SeatReservationGetMeError::InternalServerError(format!(
            "Error getting seat reservation, due to: {e}"
        ))),
    }
}

custom_errors!(
    SeatReservationPostError,
    Unauthorized,
    BadRequest,
    Conflict,
    InternalServerError
);

/// Create a new seat reservation for the current user.
#[openapi(tag = "Seat Reservations")]
#[post(
    "/events/<event_id>/seat-reservations/me",
    format = "json",
    data = "<reservation_submit>"
)]
pub async fn post_me(
    event_id: i32,
    reservation_submit: Json<SeatReservationSubmit>,
    pool: &State<PgPool>,
    user: User,
) -> Result<Json<SeatReservation>, SeatReservationPostError> {
    match seat_reservation::create(
        pool,
        event_id,
        user.email,
        reservation_submit.into_inner(),
        false,
    )
    .await
    {
        Ok(reservation) => Ok(Json(reservation)),
        Err(Error::BadInput(e)) => Err(SeatReservationPostError::BadRequest(format!(
            "Invalid request: {e}"
        ))),
        Err(Error::NotPermitted(e)) => Err(SeatReservationPostError::Unauthorized(e)),
        Err(Error::Conflict(e)) => Err(SeatReservationPostError::Conflict(e)),
        Err(e) => Err(SeatReservationPostError::InternalServerError(format!(
            "Error creating seat reservation, due to: {e}"
        ))),
    }
}

custom_errors!(
    SeatReservationPostAdminError,
    Unauthorized,
    BadRequest,
    Conflict,
    InternalServerError
);

/// Create a new seat reservation for a specific user (admin only).
#[openapi(tag = "Seat Reservations")]
#[post(
    "/events/<event_id>/seat-reservations?<_as_admin>",
    format = "json",
    data = "<reservation_submit>",
    rank = 1
)]
pub async fn post_admin(
    event_id: i32,
    reservation_submit: Json<SeatReservationAdminSubmit>,
    pool: &State<PgPool>,
    _as_admin: Option<bool>,
    _user: AdminUser,
) -> Result<Json<SeatReservation>, SeatReservationPostAdminError> {
    let submit_data = reservation_submit.into_inner();
    match seat_reservation::create(
        pool,
        event_id,
        submit_data.invitation_email,
        SeatReservationSubmit {
            seat_id: submit_data.seat_id,
            attendance_buckets: submit_data.attendance_buckets,
        },
        true,
    )
    .await
    {
        Ok(reservation) => Ok(Json(reservation)),
        Err(Error::BadInput(e)) => Err(SeatReservationPostAdminError::BadRequest(format!(
            "Invalid request: {e}"
        ))),
        Err(Error::NotPermitted(e)) => Err(SeatReservationPostAdminError::Unauthorized(e)),
        Err(Error::Conflict(e)) => Err(SeatReservationPostAdminError::Conflict(e)),
        Err(e) => Err(SeatReservationPostAdminError::InternalServerError(format!(
            "Error creating seat reservation, due to: {e}"
        ))),
    }
}

custom_errors!(
    SeatReservationPutError,
    Unauthorized,
    BadRequest,
    NotFound,
    Conflict,
    InternalServerError
);

/// Update the current user's seat reservation.
#[openapi(tag = "Seat Reservations")]
#[put(
    "/events/<event_id>/seat-reservations/me",
    format = "json",
    data = "<reservation_submit>"
)]
pub async fn put_me(
    event_id: i32,
    reservation_submit: Json<SeatReservationSubmit>,
    pool: &State<PgPool>,
    user: User,
) -> Result<Json<SeatReservation>, SeatReservationPutError> {
    match seat_reservation::update(
        pool,
        event_id,
        user.email,
        reservation_submit.into_inner(),
        false,
    )
    .await
    {
        Ok(reservation) => Ok(Json(reservation)),
        Err(Error::BadInput(e)) => Err(SeatReservationPutError::BadRequest(format!(
            "Invalid request: {e}"
        ))),
        Err(Error::NotPermitted(e)) => Err(SeatReservationPutError::Unauthorized(e)),
        Err(Error::NotFound(e)) => Err(SeatReservationPutError::NotFound(e)),
        Err(Error::Conflict(e)) => Err(SeatReservationPutError::Conflict(e)),
        Err(e) => Err(SeatReservationPutError::InternalServerError(format!(
            "Error updating seat reservation, due to: {e}"
        ))),
    }
}

custom_errors!(
    SeatReservationDeleteError,
    Unauthorized,
    InternalServerError
);

/// Delete the current user's seat reservation.
#[openapi(tag = "Seat Reservations")]
#[delete("/events/<event_id>/seat-reservations/me")]
pub async fn delete_me(
    event_id: i32,
    pool: &State<PgPool>,
    user: User,
) -> Result<rocket::response::status::NoContent, SeatReservationDeleteError> {
    match seat_reservation::delete(pool, event_id, &user.email, false).await {
        Ok(()) => Ok(rocket::response::status::NoContent),
        Err(Error::NotPermitted(e)) => Err(SeatReservationDeleteError::Unauthorized(e)),
        Err(e) => Err(SeatReservationDeleteError::InternalServerError(format!(
            "Error deleting seat reservation, due to: {e}"
        ))),
    }
}

custom_errors!(
    SeatReservationPutAdminError,
    Unauthorized,
    BadRequest,
    NotFound,
    Conflict,
    InternalServerError
);

/// Update a specific user's seat reservation (admin only).
#[openapi(tag = "Seat Reservations")]
#[put(
    "/events/<event_id>/seat-reservations/<email>?<_as_admin>",
    format = "json",
    data = "<reservation_submit>"
)]
pub async fn put_admin(
    event_id: i32,
    email: String,
    reservation_submit: Json<SeatReservationSubmit>,
    pool: &State<PgPool>,
    _as_admin: Option<bool>,
    _user: AdminUser,
) -> Result<Json<SeatReservation>, SeatReservationPutAdminError> {
    match seat_reservation::update(pool, event_id, email, reservation_submit.into_inner(), true)
        .await
    {
        Ok(reservation) => Ok(Json(reservation)),
        Err(Error::BadInput(e)) => Err(SeatReservationPutAdminError::BadRequest(format!(
            "Invalid request: {e}"
        ))),
        Err(Error::NotFound(e)) => Err(SeatReservationPutAdminError::NotFound(e)),
        Err(Error::Conflict(e)) => Err(SeatReservationPutAdminError::Conflict(e)),
        Err(e) => Err(SeatReservationPutAdminError::InternalServerError(format!(
            "Error updating seat reservation, due to: {e}"
        ))),
    }
}

custom_errors!(
    SeatReservationDeleteAdminError,
    Unauthorized,
    InternalServerError
);

/// Delete a specific user's seat reservation (admin only).
#[openapi(tag = "Seat Reservations")]
#[delete("/events/<event_id>/seat-reservations/<email>?<_as_admin>")]
pub async fn delete_admin(
    event_id: i32,
    email: String,
    pool: &State<PgPool>,
    _as_admin: Option<bool>,
    _user: AdminUser,
) -> Result<rocket::response::status::NoContent, SeatReservationDeleteAdminError> {
    match seat_reservation::delete(pool, event_id, &email, true).await {
        Ok(()) => Ok(rocket::response::status::NoContent),
        Err(e) => Err(SeatReservationDeleteAdminError::InternalServerError(
            format!("Error deleting seat reservation, due to: {e}"),
        )),
    }
}

/// Request body for checking seat availability
#[derive(Deserialize, Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
#[schemars(example = "Self::example")]
pub struct SeatAvailabilityRequest {
    /// Attendance buckets to check availability for
    pub attendance_buckets: Vec<u8>,
}

impl SchemaExample for SeatAvailabilityRequest {
    fn example() -> Self {
        Self {
            attendance_buckets: vec![1, 1, 0, 0],
        }
    }
}

/// Response for seat availability check
#[derive(Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
#[schemars(example = "Self::example")]
pub struct SeatAvailabilityResponse {
    /// List of available seat IDs for the requested time buckets
    pub available_seat_ids: Vec<i32>,
}

impl SchemaExample for SeatAvailabilityResponse {
    fn example() -> Self {
        Self {
            available_seat_ids: vec![1, 2, 3, 5, 7],
        }
    }
}

custom_errors!(SeatAvailabilityCheckError, BadRequest, InternalServerError);

/// Check seat availability for given attendance buckets
///
/// Returns a list of seat IDs that are available (no conflicts) for the requested time buckets.
/// This helps users see which seats are free before updating their attendance or creating a reservation.
#[openapi(tag = "Seat Reservations")]
#[post(
    "/events/<event_id>/seat-reservations/check-availability",
    format = "json",
    data = "<request>"
)]
pub async fn check_availability(
    event_id: i32,
    request: Json<SeatAvailabilityRequest>,
    pool: &State<PgPool>,
    _user: User,
) -> Result<Json<SeatAvailabilityResponse>, SeatAvailabilityCheckError> {
    match seat_reservation::check_availability(pool, event_id, &request.attendance_buckets).await {
        Ok(available_seats) => Ok(Json(SeatAvailabilityResponse {
            available_seat_ids: available_seats,
        })),
        Err(e) => Err(SeatAvailabilityCheckError::InternalServerError(format!(
            "Error checking seat availability: {e}"
        ))),
    }
}
