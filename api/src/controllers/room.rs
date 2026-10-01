use std::collections::{BTreeMap, HashSet};

use sqlx::PgPool;

use crate::{
    controllers::{ensure_user_invited, Error},
    repositories::{room, seat, seat_reservation},
    routes::rooms::{Room, RoomFeature, RoomSubmit},
};

/// The room editor grid is always 12 columns wide.
pub const GRID_COLS: i32 = 12;
/// Upper bound on editor rows (keeps the grid sane).
pub const MAX_GRID_ROWS: i32 = 50;
/// Maximum background image size.
pub const MAX_BACKGROUND_BYTES: usize = 5 * 1024 * 1024;

/// Public path a room background is served from.
pub fn background_url(token: &str) -> String {
    format!("/api/room-backgrounds/{token}")
}

impl From<room::Room> for Room {
    fn from(room: room::Room) -> Self {
        let features: Vec<RoomFeature> =
            rocket::serde::json::serde_json::from_value(room.features).unwrap_or_default();
        Self {
            id: room.id,
            event_id: room.event_id,
            name: room.name,
            description: room.description,
            image: room.image,
            sort_order: room.sort_order,
            created_at: room.created_at,
            last_modified: room.last_modified,
            grid_rows: room.grid_rows,
            features,
            background_url: room.background_token.as_deref().map(background_url),
            background_style: room.background_style,
            background_opacity: room.background_opacity,
        }
    }
}

pub fn validate_grid_rows(grid_rows: i32) -> Result<(), String> {
    if (1..=MAX_GRID_ROWS).contains(&grid_rows) {
        Ok(())
    } else {
        Err(format!("gridRows must be between 1 and {MAX_GRID_ROWS}"))
    }
}

pub fn validate_background_style(style: &str) -> Result<(), String> {
    match style {
        "retro" | "original" => Ok(()),
        other => Err(format!(
            "backgroundStyle must be \"retro\" or \"original\", got \"{other}\""
        )),
    }
}

pub fn validate_background_opacity(opacity: f64) -> Result<(), String> {
    if (0.1..=1.0).contains(&opacity) {
        Ok(())
    } else {
        Err("backgroundOpacity must be between 0.1 and 1.0".to_string())
    }
}

/// Whether a cell lies on the grid. Without a row count only the column is checked.
pub fn cell_in_grid(col: i32, row: i32, grid_rows: Option<i32>) -> bool {
    (0..GRID_COLS).contains(&col) && row >= 0 && grid_rows.is_none_or(|rows| row < rows)
}

/// Human position of a cell ("column 4, row 2", 1-based like the editor).
pub fn cell_name(col: i32, row: i32) -> String {
    format!("column {}, row {}", col + 1, row + 1)
}

/// Whether two cells touch by a side or a corner (the 8-neighbourhood).
pub const fn touches(a: (i32, i32), b: (i32, i32)) -> bool {
    (a.0 - b.0).abs() <= 1 && (a.1 - b.1).abs() <= 1 && !(a.0 == b.0 && a.1 == b.1)
}

/// The squares of each explicit group (`group` set), in submission order.
pub fn feature_groups(features: &[RoomFeature]) -> BTreeMap<i32, Vec<&RoomFeature>> {
    let mut groups: BTreeMap<i32, Vec<&RoomFeature>> = BTreeMap::new();
    for feature in features {
        if let Some(group) = feature.group {
            groups.entry(group).or_default().push(feature);
        }
    }
    groups
}

/// Whether the cells form one shape joined by sides (no diagonal-only joins).
fn orthogonally_connected(cells: &[(i32, i32)]) -> bool {
    let Some(&start) = cells.first() else {
        return true;
    };
    let all: HashSet<(i32, i32)> = cells.iter().copied().collect();
    let mut seen = HashSet::from([start]);
    let mut stack = vec![start];
    while let Some((col, row)) = stack.pop() {
        for next in [
            (col - 1, row),
            (col + 1, row),
            (col, row - 1),
            (col, row + 1),
        ] {
            if all.contains(&next) && seen.insert(next) {
                stack.push(next);
            }
        }
    }
    seen.len() == all.len()
}

/// Shape rules for room features (used by every endpoint that stores them).
///
/// Seats are not known here, so a screen link is only checked for its shape:
/// both coordinates or neither, inside the grid, not on a feature square, the
/// same on every square of the group, and only on grouped screens. The layout
/// endpoint additionally requires the target to be a neighbouring seat.
pub fn validate_features(features: &[RoomFeature], grid_rows: Option<i32>) -> Result<(), String> {
    let mut seen = HashSet::new();
    for feature in features {
        let at = cell_name(feature.col, feature.row);
        if feature.kind != "screen" && feature.kind != "entrance" {
            return Err(format!(
                "Feature kind must be \"screen\" or \"entrance\", got \"{}\"",
                feature.kind
            ));
        }
        if !cell_in_grid(feature.col, feature.row, grid_rows) {
            return Err(format!(
                "Feature at column {}, row {} is outside the grid",
                feature.col, feature.row
            ));
        }
        if !seen.insert((feature.col, feature.row)) {
            return Err(format!(
                "More than one feature at column {}, row {}",
                feature.col, feature.row
            ));
        }
        if feature.group.is_some_and(|g| g < 0) {
            return Err(format!("Feature at {at}: group must be 0 or more"));
        }
        match (feature.link_col, feature.link_row) {
            (None, None) => {}
            (Some(col), Some(row)) => {
                if feature.kind != "screen" {
                    return Err(format!(
                        "Feature at {at}: only screens can be linked to a seat"
                    ));
                }
                if feature.group.is_none() {
                    return Err(format!("Feature at {at}: a linked screen needs a group"));
                }
                if !cell_in_grid(col, row, grid_rows) {
                    return Err(format!(
                        "Screen at {at}: linked seat at column {}, row {} is outside the grid",
                        col + 1,
                        row + 1
                    ));
                }
            }
            _ => {
                return Err(format!(
                    "Feature at {at}: send both linkCol and linkRow, or neither"
                ))
            }
        }
    }

    for (group, squares) in feature_groups(features) {
        let first = squares[0];
        if let Some(other) = squares.iter().find(|f| f.kind != first.kind) {
            return Err(format!(
                "Group {group} mixes {} and {} squares (at {}): a group is one kind",
                first.kind,
                other.kind,
                cell_name(other.col, other.row)
            ));
        }
        if let Some(other) = squares.iter().find(|f| f.link() != first.link()) {
            return Err(format!(
                "Group {group}: every square must link to the same seat (see {})",
                cell_name(other.col, other.row)
            ));
        }
        let cells: Vec<(i32, i32)> = squares.iter().map(|f| (f.col, f.row)).collect();
        if !orthogonally_connected(&cells) {
            return Err(format!(
                "Group {group}: its squares must join by their sides into one shape"
            ));
        }
        if let Some(link) = first.link() {
            if seen.contains(&link) {
                return Err(format!(
                    "Group {group}: the linked cell {} is a screen or entrance, not a seat",
                    cell_name(link.0, link.1)
                ));
            }
        }
    }
    Ok(())
}

/// Validate the optional room-editor fields of a `RoomSubmit` and convert them.
fn layout_fields(room_submit: &RoomSubmit) -> Result<room::RoomLayoutFields, Error> {
    if let Some(rows) = room_submit.grid_rows {
        validate_grid_rows(rows).map_err(Error::BadInput)?;
    }
    if let Some(style) = &room_submit.background_style {
        validate_background_style(style).map_err(Error::BadInput)?;
    }
    if let Some(opacity) = room_submit.background_opacity {
        validate_background_opacity(opacity).map_err(Error::BadInput)?;
    }
    if let Some(features) = &room_submit.features {
        validate_features(features, room_submit.grid_rows).map_err(Error::BadInput)?;
    }
    Ok(room::RoomLayoutFields {
        grid_rows: room_submit.grid_rows,
        features: room_submit
            .features
            .as_ref()
            .map(|f| rocket::serde::json::serde_json::json!(f)),
        background_style: room_submit.background_style.clone(),
        background_opacity: room_submit.background_opacity,
    })
}

async fn fetch(pool: &PgPool, room_id: i32) -> Result<Room, Error> {
    match room::get(pool, room_id).await {
        Ok(Some(room)) => Ok(Room::from(room)),
        Ok(None) => Err(Error::NotFound(format!("Room with ID {room_id} not found"))),
        Err(e) => Err(Error::Controller(format!("Unable to get room due to: {e}"))),
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
    let layout = layout_fields(&room_submit)?;

    match room::create(
        pool,
        event_id,
        room_submit.name.clone(),
        room_submit.description.clone(),
        room_submit.image.clone(),
        room_submit.sort_order,
        layout,
    )
    .await
    {
        Ok(room_id) => {
            let room = fetch(pool, room_id).await?;
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

            Ok(room)
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
    let layout = layout_fields(&room_submit)?;

    match room::update(
        pool,
        room_id,
        room_submit.name.clone(),
        room_submit.description.clone(),
        room_submit.image.clone(),
        true,
        room_submit.sort_order,
        layout,
    )
    .await
    {
        Ok(None) => Err(Error::NotFound(format!("Room with ID {room_id} not found"))),
        Ok(Some(_)) => {
            let room = fetch(pool, room_id).await?;
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

            Ok(room)
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

/// Image types accepted for room backgrounds, detected from the file's magic
/// bytes (the declared Content-Type must agree). SVG is deliberately excluded:
/// it can carry script and is served from the API origin.
pub fn sniff_image_type(data: &[u8]) -> Option<&'static str> {
    if data.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if data.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("image/jpeg")
    } else if data.starts_with(b"GIF87a") || data.starts_with(b"GIF89a") {
        Some("image/gif")
    } else if data.len() >= 12 && &data[0..4] == b"RIFF" && &data[8..12] == b"WEBP" {
        Some("image/webp")
    } else {
        None
    }
}

/// Validate and store a background image for a room of the event.
pub async fn set_background(
    pool: &PgPool,
    event_id: i32,
    room_id: i32,
    declared_type: Option<&str>,
    data: &[u8],
    user_email: String,
) -> Result<Room, Error> {
    let room = fetch(pool, room_id).await?;
    if room.event_id != event_id {
        return Err(Error::NotFound(format!(
            "Room with ID {room_id} does not belong to event {event_id}"
        )));
    }
    if data.is_empty() {
        return Err(Error::BadInput("The image is empty".to_string()));
    }
    let content_type = sniff_image_type(data).ok_or_else(|| {
        Error::NotPermitted("Only PNG, JPEG, WebP or GIF images are supported".to_string())
    })?;
    if declared_type.is_some_and(|declared| !declared.eq_ignore_ascii_case(content_type)) {
        return Err(Error::NotPermitted(format!(
            "Content-Type does not match the image data ({content_type})"
        )));
    }

    let token = format!("{:032x}", rand::random::<u128>());
    room::set_background(pool, room_id, &token, content_type, data)
        .await
        .map_err(|e| Error::Controller(format!("Unable to store background due to: {e}")))?;

    crate::util::log_audit(
        pool,
        Some(user_email),
        "room.background_update".to_string(),
        "room".to_string(),
        Some(room_id.to_string()),
        Some(rocket::serde::json::serde_json::json!({
            "event_id": event_id,
            "content_type": content_type,
            "bytes": data.len(),
        })),
    )
    .await;

    fetch(pool, room_id).await
}

pub async fn delete_background(
    pool: &PgPool,
    event_id: i32,
    room_id: i32,
    user_email: String,
) -> Result<(), Error> {
    let room = fetch(pool, room_id).await?;
    if room.event_id != event_id {
        return Err(Error::NotFound(format!(
            "Room with ID {room_id} does not belong to event {event_id}"
        )));
    }
    room::delete_background(pool, room_id)
        .await
        .map_err(|e| Error::Controller(format!("Unable to delete background due to: {e}")))?;

    crate::util::log_audit(
        pool,
        Some(user_email),
        "room.background_delete".to_string(),
        "room".to_string(),
        Some(room_id.to_string()),
        Some(rocket::serde::json::serde_json::json!({ "event_id": event_id })),
    )
    .await;

    Ok(())
}

pub async fn get_background(pool: &PgPool, token: &str) -> Result<Option<room::Background>, Error> {
    room::get_background_by_token(pool, token)
        .await
        .map_err(|e| Error::Controller(format!("Unable to get background due to: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn feature(col: i32, row: i32, kind: &str) -> RoomFeature {
        RoomFeature {
            col,
            row,
            kind: kind.to_string(),
            ..RoomFeature::default()
        }
    }

    fn grouped(col: i32, row: i32, kind: &str, group: i32) -> RoomFeature {
        RoomFeature {
            group: Some(group),
            ..feature(col, row, kind)
        }
    }

    fn linked(col: i32, row: i32, group: i32, link: (i32, i32)) -> RoomFeature {
        RoomFeature {
            link_col: Some(link.0),
            link_row: Some(link.1),
            ..grouped(col, row, "screen", group)
        }
    }

    #[test]
    fn sniffs_supported_image_types_only() {
        assert_eq!(
            sniff_image_type(b"\x89PNG\r\n\x1a\nrest"),
            Some("image/png")
        );
        assert_eq!(
            sniff_image_type(&[0xFF, 0xD8, 0xFF, 0xE0]),
            Some("image/jpeg")
        );
        assert_eq!(sniff_image_type(b"GIF89a...."), Some("image/gif"));
        assert_eq!(
            sniff_image_type(b"RIFF\0\0\0\0WEBPVP8 "),
            Some("image/webp")
        );
        assert_eq!(sniff_image_type(b"<svg xmlns=..."), None);
        assert_eq!(sniff_image_type(b""), None);
    }

    #[test]
    fn validates_background_settings() {
        assert!(validate_background_style("retro").is_ok());
        assert!(validate_background_style("original").is_ok());
        assert!(validate_background_style("neon").is_err());
        assert!(validate_background_opacity(0.1).is_ok());
        assert!(validate_background_opacity(1.0).is_ok());
        assert!(validate_background_opacity(0.05).is_err());
        assert!(validate_background_opacity(1.01).is_err());
        assert!(validate_grid_rows(1).is_ok());
        assert!(validate_grid_rows(0).is_err());
        assert!(validate_grid_rows(MAX_GRID_ROWS + 1).is_err());
    }

    #[test]
    fn validates_features() {
        assert!(validate_features(
            &[feature(0, 0, "screen"), feature(11, 7, "entrance")],
            Some(8)
        )
        .is_ok());
        assert!(validate_features(&[feature(12, 0, "screen")], Some(8)).is_err());
        assert!(validate_features(&[feature(0, 8, "screen")], Some(8)).is_err());
        assert!(validate_features(&[feature(0, 8, "screen")], None).is_ok());
        assert!(validate_features(&[feature(1, 1, "window")], Some(8)).is_err());
        assert!(validate_features(
            &[feature(1, 1, "screen"), feature(1, 1, "entrance")],
            Some(8)
        )
        .is_err());
    }

    #[test]
    fn accepts_groups_of_any_connected_shape() {
        // An L-shaped door, two separate screens side by side, legacy squares.
        let features = [
            grouped(0, 0, "entrance", 0),
            grouped(0, 1, "entrance", 0),
            grouped(1, 1, "entrance", 0),
            grouped(4, 0, "screen", 1),
            grouped(5, 0, "screen", 2),
            feature(8, 0, "screen"),
            feature(9, 0, "screen"),
        ];
        assert_eq!(validate_features(&features, Some(8)), Ok(()));
    }

    #[test]
    fn rejects_bad_groups() {
        let mixed = [grouped(0, 0, "screen", 0), grouped(1, 0, "entrance", 0)];
        let err = validate_features(&mixed, Some(8)).expect_err("should be rejected");
        assert!(err.contains("one kind"), "{err}");

        // Diagonal-only contact is not a shape.
        let diagonal = [grouped(0, 0, "screen", 3), grouped(1, 1, "screen", 3)];
        let err = validate_features(&diagonal, Some(8)).expect_err("should be rejected");
        assert!(err.contains("join by their sides"), "{err}");

        let apart = [grouped(0, 0, "screen", 3), grouped(2, 0, "screen", 3)];
        assert!(validate_features(&apart, Some(8)).is_err());

        let negative = [grouped(0, 0, "screen", -1)];
        assert!(validate_features(&negative, Some(8)).is_err());
    }

    #[test]
    fn checks_the_shape_of_screen_links() {
        assert_eq!(
            validate_features(&[linked(3, 0, 0, (2, 1)), linked(4, 0, 0, (2, 1))], Some(8)),
            Ok(())
        );
        // Every square of a group links to the same seat.
        let differ = [linked(3, 0, 0, (2, 1)), linked(4, 0, 0, (5, 1))];
        let err = validate_features(&differ, Some(8)).expect_err("should be rejected");
        assert!(err.contains("same seat"), "{err}");
        let partly = [linked(3, 0, 0, (2, 1)), grouped(4, 0, "screen", 0)];
        assert!(validate_features(&partly, Some(8)).is_err());

        // Both coordinates or neither.
        let half = [RoomFeature {
            link_col: Some(2),
            ..grouped(3, 0, "screen", 0)
        }];
        let err = validate_features(&half, Some(8)).expect_err("should be rejected");
        assert!(err.contains("both linkCol and linkRow"), "{err}");

        // Only grouped screens link.
        let door = [RoomFeature {
            link_col: Some(1),
            link_row: Some(1),
            ..grouped(0, 0, "entrance", 0)
        }];
        let err = validate_features(&door, Some(8)).expect_err("should be rejected");
        assert!(err.contains("only screens"), "{err}");
        let ungrouped = [RoomFeature {
            link_col: Some(1),
            link_row: Some(1),
            ..feature(0, 0, "screen")
        }];
        assert!(validate_features(&ungrouped, Some(8)).is_err());

        // Inside the grid, and not onto another feature square.
        let outside = [linked(0, 7, 0, (0, 8))];
        assert!(validate_features(&outside, Some(8)).is_err());
        let onto_feature = [linked(0, 0, 0, (1, 0)), grouped(1, 0, "screen", 1)];
        let err = validate_features(&onto_feature, Some(8)).expect_err("should be rejected");
        assert!(err.contains("not a seat"), "{err}");
    }

    #[test]
    fn touches_sides_and_corners_only() {
        assert!(touches((3, 3), (4, 3)));
        assert!(touches((3, 3), (2, 2)));
        assert!(touches((3, 3), (4, 4)));
        assert!(!touches((3, 3), (3, 3)));
        assert!(!touches((3, 3), (5, 3)));
        assert!(!touches((3, 3), (4, 5)));
    }
}
