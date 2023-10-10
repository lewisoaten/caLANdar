use futures::executor;
use sqlx::PgPool;

use base64::{engine::general_purpose, Engine as _};

use crate::{
    controllers::Error,
    repositories::{event, invitation},
    routes::events::{Event, EventSubmit},
};

// Implement From for EventsGetResponse from Event
impl From<crate::repositories::event::Event> for Event {
    fn from(event: crate::repositories::event::Event) -> Self {
        Self {
            id: event.id,
            created_at: event.created_at,
            last_modified: event.last_modified,
            title: event.title,
            description: event.description,
            image: executor::block_on(image_bytes_to_string(event.image)),
            time_begin: event.time_begin,
            time_end: event.time_end,
        }
    }
}

pub async fn get_all(pool: &PgPool) -> Result<Vec<Event>, Error> {
    // Return all events
    match event::index(pool).await {
        Ok(events) => {
            // Convert vector of Event structs to vector of EventsGetResponse structs
            Ok(events.into_iter().map(Event::from).collect())
        }
        Err(e) => Err(Error::Controller(format!(
            "Unable to get list of events due to: {e}"
        ))),
    }
}

pub async fn get_all_user(pool: &PgPool, user_email: String) -> Result<Vec<Event>, Error> {
    let invitation_filter_values = invitation::Filter {
        event_id: None,
        email: Some(user_email),
    };

    let invitations: Vec<i32> = match invitation::filter(pool, invitation_filter_values).await {
        Ok(invitations) => {
            // Return list of event IDs
            invitations
                .into_iter()
                .map(|invitation| invitation.event_id)
                .collect()
        }
        Err(e) => {
            return Err(Error::Controller(format!(
                "Unable to get user's invitations due to: {e}"
            )))
        }
    };

    // Build new EventFilter
    let event_filter_values = event::Filter {
        ids: Some(invitations),
    };
    // Return all events
    match event::filter(pool, event_filter_values).await {
        Ok(events) => {
            // Convert vector of Event structs to vector of EventsGetResponse structs
            Ok(events.into_iter().map(Event::from).collect())
        }
        Err(e) => Err(Error::Controller(format!(
            "Unable to get users's events due to: {e}"
        ))),
    }
}

pub async fn get(pool: &PgPool, id: i32) -> Result<Event, Error> {
    // Build new EventFilter
    let event_filter_values = event::Filter {
        ids: Some(vec![id]),
    };
    // Return all events
    match event::filter(pool, event_filter_values).await {
        Ok(events) => {
            // Check we have exactly one event
            match events.len() {
                1 => Ok(Event::from(events[0].clone())),
                0 => Err(Error::NoData("No events found".to_string())),
                _ => Err(Error::Controller(format!(
                    "Too many events returned for id {id}"
                ))),
            }
        }
        Err(e) => Err(Error::Controller(format!(
            "Unable to get event due to: {e}"
        ))),
    }
}

pub async fn get_user(pool: &PgPool, id: i32, user_email: String) -> Result<Event, Error> {
    let invitation_filter_values = invitation::Filter {
        event_id: Some(id),
        email: Some(user_email),
    };

    let invitations: Vec<i32> = match invitation::filter(pool, invitation_filter_values).await {
        Ok(invitations) => {
            // Return list of event IDs
            invitations
                .into_iter()
                .map(|invitation| invitation.event_id)
                .collect()
        }
        Err(e) => {
            return Err(Error::Controller(format!(
                "Unable to get user's invitations due to: {e}"
            )))
        }
    };

    // Build new EventFilter
    let event_filter_values = event::Filter {
        ids: Some(invitations),
    };

    // Return all events
    match event::filter(pool, event_filter_values).await {
        Ok(events) => {
            // Check we have exactly one event
            match events.len() {
                1 => Ok(Event::from(events[0].clone())),
                0 => Err(Error::NoData("No events found".to_string())),
                _ => Err(Error::Controller(format!(
                    "Too many events returned for id {id}"
                ))),
            }
        }
        Err(e) => Err(Error::Controller(format!(
            "Unable to get users's events due to: {e}"
        ))),
    }
}

pub async fn delete(pool: &PgPool, id: i32) -> Result<(), Error> {
    // Build new EventFilter
    let event_filter_values = event::Filter {
        ids: Some(vec![id]),
    };

    // Delete event
    match event::delete(pool, event_filter_values).await {
        Ok(_) => Ok(()),
        Err(e) => Err(Error::Controller(format!(
            "Unable to delete event due to: {e}"
        ))),
    }
}

pub async fn create(pool: &PgPool, new_event: EventSubmit) -> Result<Event, Error> {
    let image: Option<Vec<u8>> = match image_string_to_bytes(new_event.image).await {
        Ok(image) => image,
        Err(e) => return Err(e),
    };

    // Create event
    match event::create(
        pool,
        new_event.title,
        new_event.description,
        image,
        new_event.time_begin,
        new_event.time_end,
    )
    .await
    {
        Ok(event) => Ok(Event::from(event)),
        Err(e) => Err(Error::Controller(format!(
            "Unable to create event due to: {e}"
        ))),
    }
}

pub async fn edit(pool: &PgPool, id: i32, new_event: EventSubmit) -> Result<Event, Error> {
    // Check if time_end is after time_begin
    if new_event.time_end < new_event.time_begin {
        return Err(Error::BadInput(
            "Event end time must be after event start time".to_string(),
        ));
    }

    let image: Option<Vec<u8>> = match image_string_to_bytes(new_event.image).await {
        Ok(image) => image,
        Err(e) => return Err(e),
    };

    // Edit event
    match event::edit(
        pool,
        id,
        new_event.title,
        new_event.description,
        image,
        new_event.time_begin,
        new_event.time_end,
    )
    .await
    {
        Ok(event) => Ok(Event::from(event)),
        Err(e) => Err(Error::Controller(format!(
            "Unable to create event due to: {e}"
        ))),
    }
}

async fn image_string_to_bytes(image: Option<String>) -> Result<Option<Vec<u8>>, Error> {
    match image {
        Some(image) => match general_purpose::STANDARD.decode(image) {
            Ok(image) => Ok(Some(image)),
            Err(e) => Err(Error::BadInput(format!(
                "Unable to decode image due to: {e}"
            ))),
        },
        None => Ok(None),
    }
}

async fn image_bytes_to_string(image: Option<Vec<u8>>) -> Option<String> {
    image.map(|image| general_purpose::STANDARD.encode(image))
}
