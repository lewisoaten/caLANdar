//! Room editor endpoints: whole-event layout and room background images.

use rocket::{
    data::{Data, ToByteUnit},
    delete, get,
    http::{ContentType, Header},
    put,
    response::{self, Responder},
    serde::{json::Json, Deserialize, Serialize},
    Request, State,
};
use rocket_okapi::okapi::schemars;
use rocket_okapi::okapi::schemars::JsonSchema;
use rocket_okapi::openapi;
use sqlx::postgres::PgPool;

use super::rooms::{Room, RoomFeature};
use crate::{
    auth::AdminUser,
    controllers::{
        room::{self, MAX_BACKGROUND_BYTES},
        room_layout, Error,
    },
};

/// Who has reserved a seat.
#[derive(Clone, Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct SeatReservedBy {
    pub email: String,
    pub handle: Option<String>,
    pub avatar_url: String,
}

/// A seat in the room layout.
#[derive(Clone, Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct LayoutSeat {
    pub id: i32,
    /// Seat identifier shown on the seat (up to 8 characters; older seats may be longer).
    pub label: String,
    /// Optional free-text description, e.g. "Window seat next to the fridge".
    pub description: Option<String>,
    /// Null for seats placed with the legacy editor; derive from `x`/`y`.
    pub grid_col: Option<i32>,
    pub grid_row: Option<i32>,
    pub x: f64,
    pub y: f64,
    pub reserved_by: Option<SeatReservedBy>,
}

/// A room with its seats.
#[derive(Clone, Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct RoomLayout {
    #[serde(flatten)]
    pub room: Room,
    pub seats: Vec<LayoutSeat>,
}

/// The whole room layout of an event.
#[derive(Clone, Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct RoomLayoutResponse {
    pub rooms: Vec<RoomLayout>,
}

/// A seat to save. Omit `id` to create it.
#[derive(Clone, Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct LayoutSeatSubmit {
    pub id: Option<i32>,
    /// Seat identifier shown on the seat: 1-8 characters of A-Z, a-z, 0-9, `-`, `_`
    /// and `.` (trimmed), unique within the room ignoring case. An existing seat may
    /// keep a label saved before these rules if it is sent back unchanged.
    pub label: String,
    /// Optional free text, at most 120 characters (trimmed; blank clears it).
    #[serde(default)]
    pub description: Option<String>,
    /// 0 to 11.
    pub grid_col: i32,
    /// 0 to gridRows - 1.
    pub grid_row: i32,
}

/// A room to save. Omit `id` to create it.
#[derive(Clone, Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct RoomLayoutRoomSubmit {
    pub id: Option<i32>,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    /// Defaults to the room's position in the list.
    #[serde(default)]
    pub sort_order: Option<i32>,
    /// 1 to 50.
    pub grid_rows: i32,
    /// Screen and entrance squares. Squares sharing a `group` form one shape; a
    /// linked screen's `linkCol`/`linkRow` must be a seat of this room that touches
    /// the screen by a side or corner (a link to a seat this save deletes is dropped).
    #[serde(default)]
    pub features: Vec<RoomFeature>,
    /// "retro" | "original"; omitted keeps the stored value.
    #[serde(default)]
    pub background_style: Option<String>,
    /// 0.1 to 1.0; omitted keeps the stored value.
    #[serde(default)]
    pub background_opacity: Option<f64>,
    #[serde(default)]
    pub seats: Vec<LayoutSeatSubmit>,
}

/// The complete room layout for an event. Rooms and seats that are not listed are deleted.
#[derive(Clone, Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct RoomLayoutSubmit {
    /// Allow removing reserved seats; their reservations lose the seat (seatId = null).
    #[serde(default)]
    pub release_reserved: bool,
    pub rooms: Vec<RoomLayoutRoomSubmit>,
}

custom_errors!(RoomLayoutGetError, Unauthorized, InternalServerError);

/// Get the event's rooms with their seats and who reserved them (admin only).
///
/// Screen links (`linkCol`/`linkRow`) whose seat no longer exists are left out.
#[openapi(tag = "Rooms")]
#[get("/events/<event_id>/room-layout?<_as_admin>", format = "json")]
pub async fn get(
    event_id: i32,
    pool: &State<PgPool>,
    _as_admin: Option<bool>,
    _user: AdminUser,
) -> Result<Json<RoomLayoutResponse>, RoomLayoutGetError> {
    room_layout::get_layout(pool, event_id)
        .await
        .map(Json)
        .map_err(|e| {
            RoomLayoutGetError::InternalServerError(format!("Error getting room layout: {e}"))
        })
}

custom_errors!(
    RoomLayoutPutError,
    Unauthorized,
    BadRequest,
    Conflict,
    InternalServerError
);

/// Replace the event's whole room layout in one transaction (admin only).
///
/// Rooms and seats not listed are deleted. Removing reserved seats fails with 409
/// unless `releaseReserved` is true, in which case those reservations lose their seat.
#[openapi(tag = "Rooms")]
#[put(
    "/events/<event_id>/room-layout?<_as_admin>",
    format = "json",
    data = "<layout>"
)]
pub async fn put(
    event_id: i32,
    layout: Json<RoomLayoutSubmit>,
    pool: &State<PgPool>,
    _as_admin: Option<bool>,
    user: AdminUser,
) -> Result<Json<RoomLayoutResponse>, RoomLayoutPutError> {
    match room_layout::save_layout(pool, event_id, layout.into_inner(), user.email).await {
        Ok(layout) => Ok(Json(layout)),
        Err(Error::BadInput(e) | Error::NotFound(e)) => Err(RoomLayoutPutError::BadRequest(e)),
        Err(Error::Conflict(e)) => Err(RoomLayoutPutError::Conflict(e)),
        Err(e) => Err(RoomLayoutPutError::InternalServerError(format!(
            "Error saving room layout: {e}"
        ))),
    }
}

custom_errors!(
    RoomBackgroundPutError,
    Unauthorized,
    BadRequest,
    NotFound,
    PayloadTooLarge,
    UnsupportedMediaType,
    InternalServerError
);

/// Upload (or replace) a room's background plan image (admin only).
///
/// The body is the raw image (PNG, JPEG, WebP or GIF, max 5 MiB) with a matching
/// `Content-Type`. Returns the room with its new `backgroundUrl`.
#[openapi(tag = "Rooms")]
#[put(
    "/events/<event_id>/rooms/<room_id>/background?<_as_admin>",
    data = "<image>"
)]
pub async fn put_background(
    event_id: i32,
    room_id: i32,
    content_type: Option<&ContentType>,
    image: Data<'_>,
    pool: &State<PgPool>,
    _as_admin: Option<bool>,
    user: AdminUser,
) -> Result<Json<Room>, RoomBackgroundPutError> {
    let bytes = image
        .open(MAX_BACKGROUND_BYTES.bytes())
        .into_bytes()
        .await
        .map_err(|e| RoomBackgroundPutError::BadRequest(format!("Unable to read image: {e}")))?;
    if !bytes.is_complete() {
        return Err(RoomBackgroundPutError::PayloadTooLarge(
            "Background images must be 5 MiB or smaller".to_string(),
        ));
    }
    let declared = content_type.map(|ct| format!("{}/{}", ct.top(), ct.sub()));

    match room::set_background(
        pool,
        event_id,
        room_id,
        declared.as_deref(),
        &bytes,
        user.email,
    )
    .await
    {
        Ok(room) => Ok(Json(room)),
        Err(Error::BadInput(e)) => Err(RoomBackgroundPutError::BadRequest(e)),
        Err(Error::NotFound(e)) => Err(RoomBackgroundPutError::NotFound(e)),
        Err(Error::NotPermitted(e)) => Err(RoomBackgroundPutError::UnsupportedMediaType(e)),
        Err(e) => Err(RoomBackgroundPutError::InternalServerError(format!(
            "Error saving background: {e}"
        ))),
    }
}

custom_errors!(
    RoomBackgroundDeleteError,
    Unauthorized,
    NotFound,
    InternalServerError
);

/// Remove a room's background image (admin only).
#[openapi(tag = "Rooms")]
#[delete("/events/<event_id>/rooms/<room_id>/background?<_as_admin>")]
pub async fn delete_background(
    event_id: i32,
    room_id: i32,
    pool: &State<PgPool>,
    _as_admin: Option<bool>,
    user: AdminUser,
) -> Result<rocket::response::status::NoContent, RoomBackgroundDeleteError> {
    match room::delete_background(pool, event_id, room_id, user.email).await {
        Ok(()) => Ok(rocket::response::status::NoContent),
        Err(Error::NotFound(e)) => Err(RoomBackgroundDeleteError::NotFound(e)),
        Err(e) => Err(RoomBackgroundDeleteError::InternalServerError(format!(
            "Error deleting background: {e}"
        ))),
    }
}

/// A stored image served with long-lived caching headers.
pub struct BackgroundImage {
    content_type: ContentType,
    data: Vec<u8>,
}

impl<'r> Responder<'r, 'static> for BackgroundImage {
    fn respond_to(self, req: &'r Request<'_>) -> response::Result<'static> {
        response::Response::build_from(self.data.respond_to(req)?)
            .header(self.content_type)
            // The token changes whenever the image is replaced.
            .header(Header::new(
                "Cache-Control",
                "public, max-age=31536000, immutable",
            ))
            .header(Header::new("X-Content-Type-Options", "nosniff"))
            .ok()
    }
}

custom_errors!(RoomBackgroundGetError, NotFound, InternalServerError);

/// Serve a room background image. Unauthenticated: the random token in the URL is
/// the capability, so it can be used directly in `<img>` or CSS.
#[openapi(skip)]
#[get("/room-backgrounds/<token>")]
pub async fn get_background(
    token: &str,
    pool: &State<PgPool>,
) -> Result<BackgroundImage, RoomBackgroundGetError> {
    match room::get_background(pool, token).await {
        Ok(Some(background)) => Ok(BackgroundImage {
            content_type: ContentType::parse_flexible(&background.content_type)
                .unwrap_or(ContentType::Binary),
            data: background.data,
        }),
        Ok(None) => Err(RoomBackgroundGetError::NotFound(
            "Background not found".to_string(),
        )),
        Err(e) => Err(RoomBackgroundGetError::InternalServerError(e.to_string())),
    }
}
