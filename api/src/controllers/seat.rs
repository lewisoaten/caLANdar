use sqlx::PgPool;

use crate::{
    controllers::Error,
    repositories::seat,
    routes::seats::{Seat, SeatSubmit},
};

impl From<seat::Seat> for Seat {
    fn from(seat: seat::Seat) -> Self {
        Self {
            id: seat.id,
            event_id: seat.event_id,
            room_id: seat.room_id,
            label: seat.label,
            description: seat.description,
            x: seat.x,
            y: seat.y,
            created_at: seat.created_at,
            last_modified: seat.last_modified,
        }
    }
}

pub async fn get_all(pool: &PgPool, event_id: i32) -> Result<Vec<Seat>, Error> {
    match seat::get_all_by_event(pool, event_id).await {
        Ok(seats) => Ok(seats.into_iter().map(Seat::from).collect()),
        Err(e) => Err(Error::Controller(format!(
            "Unable to get seats due to: {e}"
        ))),
    }
}

pub async fn get(pool: &PgPool, seat_id: i32) -> Result<Option<Seat>, Error> {
    match seat::get(pool, seat_id).await {
        Ok(Some(seat)) => Ok(Some(Seat::from(seat))),
        Ok(None) => Ok(None),
        Err(e) => Err(Error::Controller(format!(
            "Unable to get seat due to: {e}"
        ))),
    }
}

pub async fn create(
    pool: &PgPool,
    event_id: i32,
    seat_submit: SeatSubmit,
) -> Result<Seat, Error> {
    if seat_submit.label.trim().is_empty() {
        return Err(Error::BadInput("Seat label cannot be empty".to_string()));
    }

    match seat::create(
        pool,
        event_id,
        seat_submit.room_id,
        seat_submit.label,
        seat_submit.description,
        seat_submit.x,
        seat_submit.y,
    )
    .await
    {
        Ok(seat) => Ok(Seat::from(seat)),
        Err(e) => Err(Error::Controller(format!(
            "Unable to create seat due to: {e}"
        ))),
    }
}

pub async fn update(pool: &PgPool, seat_id: i32, seat_submit: SeatSubmit) -> Result<Seat, Error> {
    if seat_submit.label.trim().is_empty() {
        return Err(Error::BadInput("Seat label cannot be empty".to_string()));
    }

    match seat::update(
        pool,
        seat_id,
        seat_submit.label,
        seat_submit.description,
        seat_submit.x,
        seat_submit.y,
    )
    .await
    {
        Ok(seat) => Ok(Seat::from(seat)),
        Err(e) => Err(Error::Controller(format!(
            "Unable to update seat due to: {e}"
        ))),
    }
}

pub async fn delete(pool: &PgPool, seat_id: i32) -> Result<(), Error> {
    match seat::delete(pool, seat_id).await {
        Ok(()) => Ok(()),
        Err(e) => Err(Error::Controller(format!(
            "Unable to delete seat due to: {e}"
        ))),
    }
}
