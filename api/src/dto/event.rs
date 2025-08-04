// Event DTOs - Framework-agnostic event data structures
use chrono::{prelude::Utc, DateTime};
use rocket::serde::{Deserialize, Serialize};

/// Event response DTO
#[derive(Clone, Serialize, Deserialize, Debug, Hash, Eq, PartialEq)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct EventDto {
    /// An integer ID of the event, unique within the database.
    pub id: i32,

    /// The date the event was inserted into the database.
    pub created_at: DateTime<Utc>,

    /// The last time this event was modified.
    /// Note that this doesn't account for when any other database entries are modified related to this event such as invitations or game suggestions.
    pub last_modified: DateTime<Utc>,

    /// The title of the event.
    pub title: String,

    /// The description of the event.
    pub description: String,

    /// The optional cover image for the event. Base64 and binary encodings are supported.
    pub image: Option<String>,

    /// The time the event begins.
    pub time_begin: DateTime<Utc>,

    /// The time the event ends.
    pub time_end: DateTime<Utc>,
}

/// Event creation/update request DTO
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct EventSubmitDto {
    /// The title of the event.
    pub title: String,

    /// The description of the event.
    pub description: String,

    /// The optional cover image for the event. Base64 and binary encodings are supported.
    pub image: Option<String>,

    /// The time the event begins.
    pub time_begin: DateTime<Utc>,

    /// The time the event ends.
    pub time_end: DateTime<Utc>,
}