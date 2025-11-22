use sqlx::PgPool;

use crate::{
    controllers::{ensure_user_invited, Error},
    repositories::{room, seat, seat_reservation},
    routes::rooms::{Room, RoomSubmit},
};

impl From<room::Room> for Room {
    fn from(room: room::Room) -> Self {
        Self {
            id: room.id,
            event_id: room.event_id,
            name: room.name,
            description: room.description,
            image: room.image,
            sort_order: room.sort_order,
            created_at: room.created_at,
            last_modified: room.last_modified,
        }
    }
}

pub async fn get_all(pool: &PgPool, event_id: i32) -> Result<Vec<Room>, Error> {
    match room::get_all(pool, event_id).await {
        Ok(rooms) => Ok(rooms.into_iter().map(Room::from).collect()),
        Err(e) => Err(Error::Controller(format!(
            "Unable to get rooms due to: {e}"
        ))),
    }
}

pub async fn get_all_for_invited_user(
    pool: &PgPool,
    event_id: i32,
    user_email: &str,
) -> Result<Vec<Room>, Error> {
    ensure_user_invited(pool, event_id, user_email).await?;
    get_all(pool, event_id).await
}

pub async fn get(pool: &PgPool, room_id: i32) -> Result<Option<Room>, Error> {
    match room::get(pool, room_id).await {
        Ok(Some(room)) => Ok(Some(Room::from(room))),
        Ok(None) => Ok(None),
        Err(e) => Err(Error::Controller(format!("Unable to get room due to: {e}"))),
    }
}

pub async fn get_reserved_room_for_user(
    pool: &PgPool,
    event_id: i32,
    room_id: i32,
    email: &str,
) -> Result<Room, Error> {
    ensure_user_invited(pool, event_id, email).await?;

    let room = match room::get(pool, room_id).await {
        Ok(Some(room)) => {
            if room.event_id != event_id {
                return Err(Error::NotFound(format!(
                    "Room with ID {room_id} does not belong to event {event_id}",
                )));
            }
            Room::from(room)
        }
        Ok(None) => return Err(Error::NotFound(format!("Room with ID {room_id} not found"))),
        Err(e) => return Err(Error::Controller(format!("Unable to get room due to: {e}"))),
    };

    let reservation = match seat_reservation::get_by_email(pool, event_id, email).await {
        Ok(Some(reservation)) => reservation,
        Ok(None) => {
            return Err(Error::NotFound(format!(
                "No seat reservation found for {email} at event {event_id}"
            )))
        }
        Err(e) => {
            return Err(Error::Controller(format!(
                "Unable to get seat reservation for {email}: {e}"
            )))
        }
    };

    let seat_id = reservation.seat_id.ok_or_else(|| {
        Error::NotFound("You have not selected a specific seat for this event".to_string())
    })?;

    let seat = match seat::get(pool, seat_id).await {
        Ok(Some(seat)) => seat,
        Ok(None) => return Err(Error::NotFound(format!("Seat with ID {seat_id} not found"))),
        Err(e) => return Err(Error::Controller(format!("Unable to get seat due to: {e}"))),
    };

    if seat.room_id != room_id {
        return Err(Error::NotFound(
            "You have not reserved a seat in this room for this event".to_string(),
        ));
    }

    Ok(room)
}

pub async fn create(
    pool: &PgPool,
    event_id: i32,
    room_submit: RoomSubmit,
    user_email: String,
) -> Result<Room, Error> {
    if room_submit.name.trim().is_empty() {
        return Err(Error::BadInput("Room name cannot be empty".to_string()));
    }

    match room::create(
        pool,
        event_id,
        room_submit.name.clone(),
        room_submit.description.clone(),
        room_submit.image.clone(),
        room_submit.sort_order,
    )
    .await
    {
        Ok(room) => {
            // Log audit entry
            let metadata = rocket::serde::json::serde_json::json!({
                "event_id": event_id,
                "room_id": room.id,
                "name": room_submit.name,
                "sort_order": room_submit.sort_order,
            });
            crate::util::log_audit(
                pool,
                Some(user_email),
                "room.create".to_string(),
                "room".to_string(),
                Some(room.id.to_string()),
                Some(metadata),
            )
            .await;

            Ok(Room::from(room))
        }
        Err(e) => Err(Error::Controller(format!(
            "Unable to create room due to: {e}"
        ))),
    }
}

pub async fn update(
    pool: &PgPool,
    room_id: i32,
    room_submit: RoomSubmit,
    user_email: String,
) -> Result<Room, Error> {
    if room_submit.name.trim().is_empty() {
        return Err(Error::BadInput("Room name cannot be empty".to_string()));
    }

    match room::update(
        pool,
        room_id,
        room_submit.name.clone(),
        room_submit.description.clone(),
        room_submit.image.clone(),
        room_submit.sort_order,
    )
    .await
    {
        Ok(room) => {
            // Log audit entry
            let metadata = rocket::serde::json::serde_json::json!({
                "room_id": room_id,
                "name": room_submit.name,
                "sort_order": room_submit.sort_order,
            });
            crate::util::log_audit(
                pool,
                Some(user_email),
                "room.update".to_string(),
                "room".to_string(),
                Some(room_id.to_string()),
                Some(metadata),
            )
            .await;

            Ok(Room::from(room))
        }
        Err(e) => Err(Error::Controller(format!(
            "Unable to update room due to: {e}"
        ))),
    }
}

pub async fn delete(pool: &PgPool, room_id: i32, user_email: String) -> Result<(), Error> {
    match room::delete(pool, room_id).await {
        Ok(()) => {
            // Log audit entry
            let metadata = rocket::serde::json::serde_json::json!({
                "room_id": room_id,
            });
            crate::util::log_audit(
                pool,
                Some(user_email),
                "room.delete".to_string(),
                "room".to_string(),
                Some(room_id.to_string()),
                Some(metadata),
            )
            .await;

            Ok(())
        }
        Err(e) => Err(Error::Controller(format!(
            "Unable to delete room due to: {e}"
        ))),
    }
}
