use sqlx::PgPool;

use crate::{
    controllers::Error,
    repositories::room,
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

pub async fn get(pool: &PgPool, room_id: i32) -> Result<Option<Room>, Error> {
    match room::get(pool, room_id).await {
        Ok(Some(room)) => Ok(Some(Room::from(room))),
        Ok(None) => Ok(None),
        Err(e) => Err(Error::Controller(format!(
            "Unable to get room due to: {e}"
        ))),
    }
}

pub async fn create(
    pool: &PgPool,
    event_id: i32,
    room_submit: RoomSubmit,
) -> Result<Room, Error> {
    if room_submit.name.trim().is_empty() {
        return Err(Error::BadInput("Room name cannot be empty".to_string()));
    }

    match room::create(
        pool,
        event_id,
        room_submit.name,
        room_submit.description,
        room_submit.image,
        room_submit.sort_order,
    )
    .await
    {
        Ok(room) => Ok(Room::from(room)),
        Err(e) => Err(Error::Controller(format!(
            "Unable to create room due to: {e}"
        ))),
    }
}

pub async fn update(
    pool: &PgPool,
    room_id: i32,
    room_submit: RoomSubmit,
) -> Result<Room, Error> {
    if room_submit.name.trim().is_empty() {
        return Err(Error::BadInput("Room name cannot be empty".to_string()));
    }

    match room::update(
        pool,
        room_id,
        room_submit.name,
        room_submit.description,
        room_submit.image,
        room_submit.sort_order,
    )
    .await
    {
        Ok(room) => Ok(Room::from(room)),
        Err(e) => Err(Error::Controller(format!(
            "Unable to update room due to: {e}"
        ))),
    }
}

pub async fn delete(pool: &PgPool, room_id: i32) -> Result<(), Error> {
    match room::delete(pool, room_id).await {
        Ok(()) => Ok(()),
        Err(e) => Err(Error::Controller(format!(
            "Unable to delete room due to: {e}"
        ))),
    }
}
