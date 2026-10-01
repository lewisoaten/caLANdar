//! Room editor: read and transactionally replace an event's whole room layout.

use std::collections::{HashMap, HashSet};

use sqlx::PgPool;

use crate::{
    controllers::{
        room::{
            cell_in_grid, cell_name, feature_groups, touches, validate_background_opacity,
            validate_background_style, validate_features, validate_grid_rows, GRID_COLS,
        },
        seat::{normalise_seat_description, normalise_seat_identifier_for},
        Error,
    },
    repositories::{room, seat},
    routes::{
        room_layout::{
            LayoutSeat, LayoutSeatSubmit, RoomLayout, RoomLayoutResponse, RoomLayoutSubmit,
            SeatReservedBy,
        },
        rooms::{Room, RoomFeature},
    },
};

/// Centre of a grid cell as the 0..1 floorplan coordinates legacy views use.
pub fn grid_to_xy(col: i32, row: i32, grid_rows: i32) -> (f64, f64) {
    (
        (f64::from(col) + 0.5) / f64::from(GRID_COLS),
        (f64::from(row) + 0.5) / f64::from(grid_rows.max(1)),
    )
}

/// What already exists for the event, used to validate submitted ids.
pub struct ExistingLayout {
    pub room_ids: HashSet<i32>,
    /// seat id -> room id
    pub seat_rooms: HashMap<i32, i32>,
    /// seat id -> saved identifier (legacy labels may be kept unchanged)
    pub seat_labels: HashMap<i32, String>,
    /// room id -> grid cells of its saved seats (a screen linked to one of
    /// these that is deleted by the save just loses its link)
    pub room_seat_cells: HashMap<i32, HashSet<(i32, i32)>>,
}

/// Drop the seat link of every screen whose linked cell is not in `seats`.
/// Returns how many groups lost their link.
pub fn clear_stale_links(features: &mut [RoomFeature], seats: &HashSet<(i32, i32)>) -> usize {
    let mut cleared = HashSet::new();
    for feature in features.iter_mut() {
        if feature.link().is_some_and(|link| !seats.contains(&link)) {
            feature.link_col = None;
            feature.link_row = None;
            cleared.insert(feature.group);
        }
    }
    cleared.len()
}

/// Check each linked screen against the room's submitted seats: the link must
/// point at a seat touching the screen (side or corner). A link to a seat this
/// save deletes is cleared rather than rejected.
fn validate_links(
    features: &mut [RoomFeature],
    seats: &HashMap<(i32, i32), String>,
    deleted_seat_cells: Option<&HashSet<(i32, i32)>>,
) -> Result<(), String> {
    let mut stale = HashSet::new();
    for (group, squares) in feature_groups(features) {
        let Some(link) = squares[0].link() else {
            continue;
        };
        let first = cell_name(squares[0].col, squares[0].row);
        let Some(label) = seats.get(&link) else {
            if deleted_seat_cells.is_some_and(|cells| cells.contains(&link)) {
                stale.insert(link);
                continue;
            }
            return Err(format!(
                "screen at {first} is linked to {}, where there is no seat",
                cell_name(link.0, link.1)
            ));
        };
        if !squares.iter().any(|f| touches((f.col, f.row), link)) {
            return Err(format!(
                "screen at {first} (group {group}) is linked to seat {label} at {}, which does not touch it by a side or corner",
                cell_name(link.0, link.1)
            ));
        }
    }
    if !stale.is_empty() {
        let keep: HashSet<(i32, i32)> = seats.keys().copied().collect();
        clear_stale_links(features, &keep);
    }
    Ok(())
}

/// Validate a submitted layout against what exists, normalising seat
/// identifiers and descriptions in place (and clearing screen links to seats
/// the save deletes).
pub fn validate_layout(
    submit: &mut RoomLayoutSubmit,
    existing: &ExistingLayout,
) -> Result<(), String> {
    let mut seen_rooms = HashSet::new();
    let mut seen_seats = HashSet::new();

    for room in &mut submit.rooms {
        let name = room.name.trim().to_string();
        if name.is_empty() {
            return Err("Room name cannot be empty".to_string());
        }
        room.name = name;

        if let Some(id) = room.id {
            if !existing.room_ids.contains(&id) {
                return Err(format!(
                    "Room {id} does not belong to this event (omit id to create a room)"
                ));
            }
            if !seen_rooms.insert(id) {
                return Err(format!("Room {id} is listed more than once"));
            }
        }

        let room_label = room.name.clone();
        validate_grid_rows(room.grid_rows).map_err(|e| format!("{room_label}: {e}"))?;
        if let Some(style) = &room.background_style {
            validate_background_style(style).map_err(|e| format!("{room_label}: {e}"))?;
        }
        if let Some(opacity) = room.background_opacity {
            validate_background_opacity(opacity).map_err(|e| format!("{room_label}: {e}"))?;
        }
        validate_features(&room.features, Some(room.grid_rows))
            .map_err(|e| format!("{room_label}: {e}"))?;

        let mut occupied: HashSet<(i32, i32)> =
            room.features.iter().map(|f| (f.col, f.row)).collect();
        let mut labels = HashSet::new();

        let mut seat_cells = HashMap::new();

        for seat in &mut room.seats {
            let saved = seat
                .id
                .and_then(|id| existing.seat_labels.get(&id))
                .map(String::as_str);
            seat.label = normalise_seat_identifier_for(&seat.label, saved)
                .map_err(|e| format!("{room_label}: {e}"))?;
            seat.description = normalise_seat_description(seat.description.as_deref())
                .map_err(|e| format!("{room_label}: seat {}: {e}", seat.label))?;
            // Identifiers are unique per room regardless of case.
            if !labels.insert(seat.label.to_lowercase()) {
                return Err(format!(
                    "{room_label}: another seat already uses label {}",
                    seat.label
                ));
            }
            if !cell_in_grid(seat.grid_col, seat.grid_row, Some(room.grid_rows)) {
                return Err(format!(
                    "{room_label}: seat {} at column {}, row {} is outside the grid",
                    seat.label, seat.grid_col, seat.grid_row
                ));
            }
            if !occupied.insert((seat.grid_col, seat.grid_row)) {
                return Err(format!(
                    "{room_label}: seat {} overlaps another item at column {}, row {}",
                    seat.label, seat.grid_col, seat.grid_row
                ));
            }
            seat_cells.insert((seat.grid_col, seat.grid_row), seat.label.clone());
            if let Some(seat_id) = seat.id {
                match (room.id, existing.seat_rooms.get(&seat_id)) {
                    (Some(room_id), Some(seat_room)) if *seat_room == room_id => {}
                    _ => {
                        return Err(format!(
                            "{room_label}: seat {seat_id} does not belong to this room (omit id to create a seat)"
                        ))
                    }
                }
                if !seen_seats.insert(seat_id) {
                    return Err(format!("Seat {seat_id} is listed more than once"));
                }
            }
        }

        let deleted = room.id.and_then(|id| existing.room_seat_cells.get(&id));
        validate_links(&mut room.features, &seat_cells, deleted)
            .map_err(|e| format!("{room_label}: {e}"))?;
    }
    Ok(())
}

impl From<seat::Seat> for LayoutSeat {
    fn from(seat: seat::Seat) -> Self {
        Self {
            id: seat.id,
            label: seat.label,
            description: seat.description,
            grid_col: seat.grid_col,
            grid_row: seat.grid_row,
            x: seat.x,
            y: seat.y,
            reserved_by: None,
        }
    }
}

pub async fn get_layout(pool: &PgPool, event_id: i32) -> Result<RoomLayoutResponse, Error> {
    let rooms = room::get_all(pool, event_id)
        .await
        .map_err(|e| Error::Controller(format!("Unable to get rooms due to: {e}")))?;
    let seats = seat::get_all_by_event(pool, event_id)
        .await
        .map_err(|e| Error::Controller(format!("Unable to get seats due to: {e}")))?;
    let mut reservers: HashMap<i32, SeatReservedBy> = seat::reservers_by_event(pool, event_id)
        .await
        .map_err(|e| Error::Controller(format!("Unable to get reservations due to: {e}")))?
        .into_iter()
        .map(|r| {
            (
                r.seat_id,
                SeatReservedBy {
                    email: r.email,
                    handle: r.handle,
                    avatar_url: r.avatar_url,
                },
            )
        })
        .collect();

    let mut seats_by_room: HashMap<i32, Vec<LayoutSeat>> = HashMap::new();
    for seat in seats {
        let room_id = seat.room_id;
        let mut layout_seat = LayoutSeat::from(seat);
        layout_seat.reserved_by = reservers.remove(&layout_seat.id);
        seats_by_room.entry(room_id).or_default().push(layout_seat);
    }

    Ok(RoomLayoutResponse {
        rooms: rooms
            .into_iter()
            .map(|r| {
                let seats = seats_by_room.remove(&r.id).unwrap_or_default();
                let mut room = Room::from(r);
                // A link whose seat was deleted or moved elsewhere (e.g. with the
                // seat endpoints) is simply dropped.
                let cells: HashSet<(i32, i32)> = seats
                    .iter()
                    .filter_map(|s| s.grid_col.zip(s.grid_row))
                    .collect();
                clear_stale_links(&mut room.features, &cells);
                RoomLayout { room, seats }
            })
            .collect(),
    })
}

#[allow(clippy::too_many_lines)]
pub async fn save_layout(
    pool: &PgPool,
    event_id: i32,
    mut submit: RoomLayoutSubmit,
    user_email: String,
) -> Result<RoomLayoutResponse, Error> {
    let current_rooms = room::get_all(pool, event_id)
        .await
        .map_err(|e| Error::Controller(format!("Unable to get rooms due to: {e}")))?;
    let current_seats = seat::get_all_by_event(pool, event_id)
        .await
        .map_err(|e| Error::Controller(format!("Unable to get seats due to: {e}")))?;

    let existing = ExistingLayout {
        room_ids: current_rooms.iter().map(|r| r.id).collect(),
        seat_rooms: current_seats.iter().map(|s| (s.id, s.room_id)).collect(),
        seat_labels: current_seats
            .iter()
            .map(|s| (s.id, s.label.clone()))
            .collect(),
        room_seat_cells: current_seats.iter().fold(HashMap::new(), |mut map, s| {
            if let Some(cell) = s.grid_col.zip(s.grid_row) {
                map.entry(s.room_id)
                    .or_insert_with(HashSet::new)
                    .insert(cell);
            }
            map
        }),
    };
    validate_layout(&mut submit, &existing).map_err(Error::BadInput)?;

    let kept_rooms: HashSet<i32> = submit.rooms.iter().filter_map(|r| r.id).collect();
    let kept_seats: HashSet<i32> = submit
        .rooms
        .iter()
        .flat_map(|r| r.seats.iter().filter_map(|s| s.id))
        .collect();
    let removed_rooms: Vec<i32> = existing
        .room_ids
        .iter()
        .copied()
        .filter(|id| !kept_rooms.contains(id))
        .collect();
    let removed_seats: Vec<i32> = current_seats
        .iter()
        .filter(|s| !kept_seats.contains(&s.id))
        .map(|s| s.id)
        .collect();
    let room_names: HashMap<i32, String> = current_rooms
        .iter()
        .map(|r| (r.id, r.name.clone()))
        .collect();

    let mut tx = pool
        .begin()
        .await
        .map_err(|e| Error::Controller(format!("Unable to start transaction: {e}")))?;

    // Lock the seats being removed (and their reservations) first, so no
    // reservation can be made or moved onto them between the check below and
    // the delete (which would otherwise cascade it away silently).
    if !removed_seats.is_empty() {
        seat::lock_for_removal(&mut tx, &removed_seats)
            .await
            .map_err(|e| Error::Controller(format!("Unable to lock seats due to: {e}")))?;
    }

    // Checked inside the transaction so a reservation made meanwhile is not lost silently.
    let affected: Vec<seat::SeatReserver> = seat::reservers_by_event(&mut *tx, event_id)
        .await
        .map_err(|e| Error::Controller(format!("Unable to get reservations due to: {e}")))?
        .into_iter()
        .filter(|r| removed_seats.contains(&r.seat_id))
        .collect();

    if !affected.is_empty() && !submit.release_reserved {
        let list: Vec<String> = affected
            .iter()
            .map(|r| {
                format!(
                    "{} {} ({})",
                    room_names.get(&r.room_id).map_or("?", String::as_str),
                    r.label,
                    r.email
                )
            })
            .collect();
        return Err(Error::Conflict(format!(
            "{} reserved seat{} would be removed: {}. Resend with releaseReserved=true to go ahead.",
            affected.len(),
            if affected.len() == 1 { "" } else { "s" },
            list.join(", ")
        )));
    }

    let db = |e: sqlx::Error| Error::Controller(format!("Unable to save room layout due to: {e}"));

    if !affected.is_empty() {
        let seat_ids: Vec<i32> = affected.iter().map(|r| r.seat_id).collect();
        seat::release_reservations(&mut *tx, &seat_ids)
            .await
            .map_err(db)?;
    }
    for seat_id in &removed_seats {
        seat::delete(&mut *tx, *seat_id).await.map_err(db)?;
    }
    for room_id in &removed_rooms {
        room::delete(&mut *tx, *room_id).await.map_err(db)?;
    }

    let mut created_rooms = 0;
    let mut saved_seats = 0;
    for (index, layout_room) in submit.rooms.iter().enumerate() {
        let sort_order = layout_room
            .sort_order
            .unwrap_or_else(|| i32::try_from(index).unwrap_or(i32::MAX));
        let fields = room::RoomLayoutFields {
            grid_rows: Some(layout_room.grid_rows),
            features: Some(rocket::serde::json::serde_json::json!(layout_room.features)),
            background_style: layout_room.background_style.clone(),
            background_opacity: layout_room.background_opacity,
        };

        let room_id = if let Some(room_id) = layout_room.id {
            room::update(
                &mut *tx,
                room_id,
                layout_room.name.clone(),
                layout_room.description.clone(),
                None,
                false,
                sort_order,
                fields,
            )
            .await
            .map_err(db)?
            .ok_or_else(|| Error::BadInput(format!("Room {room_id} no longer exists")))?
        } else {
            created_rooms += 1;
            room::create(
                &mut *tx,
                event_id,
                layout_room.name.clone(),
                layout_room.description.clone(),
                None,
                sort_order,
                fields,
            )
            .await
            .map_err(db)?
        };

        for seat in &layout_room.seats {
            save_seat(&mut tx, event_id, room_id, layout_room.grid_rows, seat)
                .await
                .map_err(db)?;
            saved_seats += 1;
        }
    }

    tx.commit()
        .await
        .map_err(|e| Error::Controller(format!("Unable to commit room layout: {e}")))?;

    crate::util::log_audit(
        pool,
        Some(user_email),
        "room.layout_update".to_string(),
        "room".to_string(),
        Some(event_id.to_string()),
        Some(rocket::serde::json::serde_json::json!({
            "event_id": event_id,
            "rooms": submit.rooms.len(),
            "rooms_created": created_rooms,
            "rooms_deleted": removed_rooms.len(),
            "seats": saved_seats,
            "seats_deleted": removed_seats.len(),
            "reservations_released": affected.iter().map(|r| &r.email).collect::<Vec<_>>(),
        })),
    )
    .await;

    get_layout(pool, event_id).await
}

async fn save_seat(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    event_id: i32,
    room_id: i32,
    grid_rows: i32,
    seat: &LayoutSeatSubmit,
) -> Result<(), sqlx::Error> {
    let (x, y) = grid_to_xy(seat.grid_col, seat.grid_row, grid_rows);
    let grid = (Some(seat.grid_col), Some(seat.grid_row));
    if let Some(seat_id) = seat.id {
        seat::update(
            &mut **tx,
            seat_id,
            seat.label.clone(),
            seat.description.clone(),
            x,
            y,
            grid,
        )
        .await?;
    } else {
        seat::create(
            &mut **tx,
            event_id,
            room_id,
            seat.label.clone(),
            seat.description.clone(),
            x,
            y,
            grid,
        )
        .await?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::routes::room_layout::RoomLayoutRoomSubmit;

    fn seat(id: Option<i32>, label: &str, col: i32, row: i32) -> LayoutSeatSubmit {
        LayoutSeatSubmit {
            id,
            label: label.to_string(),
            description: None,
            grid_col: col,
            grid_row: row,
        }
    }

    fn room(id: Option<i32>, seats: Vec<LayoutSeatSubmit>) -> RoomLayoutRoomSubmit {
        RoomLayoutRoomSubmit {
            id,
            name: "Main Hall".to_string(),
            description: None,
            sort_order: None,
            grid_rows: 8,
            features: vec![RoomFeature {
                col: 5,
                row: 7,
                kind: "entrance".to_string(),
                ..RoomFeature::default()
            }],
            background_style: None,
            background_opacity: None,
            seats,
        }
    }

    fn existing() -> ExistingLayout {
        ExistingLayout {
            room_ids: HashSet::from([1, 2]),
            seat_rooms: HashMap::from([(10, 1), (11, 1), (20, 2)]),
            seat_labels: HashMap::from([
                (10, "A1".to_string()),
                (11, "Window seat 12".to_string()),
                (20, "C1".to_string()),
            ]),
            // Seat 10 sits at column 3, row 3 of room 1.
            room_seat_cells: HashMap::from([(1, HashSet::from([(2, 2)]))]),
        }
    }

    fn screen(col: i32, row: i32, group: i32, link: Option<(i32, i32)>) -> RoomFeature {
        RoomFeature {
            col,
            row,
            kind: "screen".to_string(),
            group: Some(group),
            link_col: link.map(|l| l.0),
            link_row: link.map(|l| l.1),
        }
    }

    fn submit(rooms: Vec<RoomLayoutRoomSubmit>) -> RoomLayoutSubmit {
        RoomLayoutSubmit {
            release_reserved: false,
            rooms,
        }
    }

    #[test]
    fn maps_grid_cells_to_cell_centres() {
        assert_eq!(grid_to_xy(0, 0, 8), (0.5 / 12.0, 0.5 / 8.0));
        assert_eq!(grid_to_xy(11, 7, 8), (11.5 / 12.0, 7.5 / 8.0));
    }

    #[test]
    fn accepts_a_valid_layout_and_normalises_labels() {
        let mut layout = submit(vec![
            room(
                Some(1),
                vec![seat(Some(10), " a1 ", 2, 2), seat(None, "Seat-12", 4, 2)],
            ),
            room(None, vec![seat(None, "C1", 0, 0)]),
        ]);
        layout.rooms[0].seats[0].description = Some("  Window seat  ".to_string());
        layout.rooms[0].seats[1].description = Some("   ".to_string());
        assert_eq!(validate_layout(&mut layout, &existing()), Ok(()));
        assert_eq!(layout.rooms[0].seats[0].label, "a1");
        assert_eq!(layout.rooms[0].seats[1].label, "Seat-12");
        assert_eq!(
            layout.rooms[0].seats[0].description.as_deref(),
            Some("Window seat")
        );
        assert_eq!(layout.rooms[0].seats[1].description, None);
    }

    #[test]
    fn keeps_unchanged_legacy_labels_but_validates_new_ones() {
        // Seat 11 was saved as "Window seat 12" before the identifier rules.
        let mut kept = submit(vec![room(
            Some(1),
            vec![seat(Some(11), "Window seat 12", 3, 3)],
        )]);
        assert_eq!(validate_layout(&mut kept, &existing()), Ok(()));
        assert_eq!(kept.rooms[0].seats[0].label, "Window seat 12");

        let mut renamed = submit(vec![room(
            Some(1),
            vec![seat(Some(11), "Window seat 13", 3, 3)],
        )]);
        assert!(validate_layout(&mut renamed, &existing()).is_err());

        // A new seat can't use a legacy-style label.
        let mut fresh = submit(vec![room(
            Some(1),
            vec![seat(None, "Window seat 12", 3, 3)],
        )]);
        assert!(validate_layout(&mut fresh, &existing()).is_err());

        let mut too_long = submit(vec![room(None, vec![seat(None, "ABCDEFGHI", 0, 0)])]);
        assert!(validate_layout(&mut too_long, &existing()).is_err());

        let mut long_text = submit(vec![room(None, vec![seat(None, "A1", 0, 0)])]);
        long_text.rooms[0].seats[0].description = Some("x".repeat(121));
        assert!(validate_layout(&mut long_text, &existing()).is_err());
    }

    #[test]
    fn rejects_duplicate_labels_overlaps_and_out_of_grid_cells() {
        let mut dup = submit(vec![room(
            None,
            vec![seat(None, "A1", 0, 0), seat(None, "a1", 1, 0)],
        )]);
        assert!(validate_layout(&mut dup, &existing()).is_err());

        let mut overlap = submit(vec![room(
            None,
            vec![seat(None, "A1", 0, 0), seat(None, "A2", 0, 0)],
        )]);
        assert!(validate_layout(&mut overlap, &existing()).is_err());

        let mut on_feature = submit(vec![room(None, vec![seat(None, "A1", 5, 7)])]);
        assert!(validate_layout(&mut on_feature, &existing()).is_err());

        let mut outside = submit(vec![room(None, vec![seat(None, "A1", 12, 0)])]);
        assert!(validate_layout(&mut outside, &existing()).is_err());

        let mut below = submit(vec![room(None, vec![seat(None, "A1", 0, 8)])]);
        assert!(validate_layout(&mut below, &existing()).is_err());
    }

    #[test]
    fn rejects_foreign_or_misplaced_ids() {
        let mut unknown_room = submit(vec![room(Some(99), vec![])]);
        assert!(validate_layout(&mut unknown_room, &existing()).is_err());

        // Seat 20 belongs to room 2, not room 1.
        let mut wrong_room = submit(vec![room(Some(1), vec![seat(Some(20), "A1", 0, 0)])]);
        assert!(validate_layout(&mut wrong_room, &existing()).is_err());

        // Existing seat ids can't be attached to a new room.
        let mut new_room = submit(vec![room(None, vec![seat(Some(10), "A1", 0, 0)])]);
        assert!(validate_layout(&mut new_room, &existing()).is_err());

        let mut twice = submit(vec![room(Some(1), vec![]), room(Some(1), vec![])]);
        assert!(validate_layout(&mut twice, &existing()).is_err());
    }

    #[test]
    fn rejects_bad_room_settings() {
        let mut blank = submit(vec![room(None, vec![])]);
        blank.rooms[0].name = "  ".to_string();
        assert!(validate_layout(&mut blank, &existing()).is_err());

        let mut rows = submit(vec![room(None, vec![])]);
        rows.rooms[0].grid_rows = 0;
        assert!(validate_layout(&mut rows, &existing()).is_err());

        let mut style = submit(vec![room(None, vec![])]);
        style.rooms[0].background_style = Some("sepia".to_string());
        assert!(validate_layout(&mut style, &existing()).is_err());
    }

    #[test]
    fn accepts_screens_linked_by_a_side_or_a_corner() {
        let mut layout = submit(vec![room(
            Some(1),
            vec![seat(Some(10), "A1", 2, 2), seat(None, "A2", 5, 2)],
        )]);
        layout.rooms[0].features.extend([
            // Diagonal: (1,1) touches A1 at (2,2) by a corner.
            screen(1, 1, 1, Some((2, 2))),
            // Side: an L-shaped screen whose (5,1) square sits above A2.
            screen(4, 0, 2, Some((5, 2))),
            screen(5, 0, 2, Some((5, 2))),
            screen(5, 1, 2, Some((5, 2))),
            // Dual monitors: a second screen for A2.
            screen(6, 2, 3, Some((5, 2))),
        ]);
        assert_eq!(validate_layout(&mut layout, &existing()), Ok(()));
        assert!(layout.rooms[0]
            .features
            .iter()
            .skip(1)
            .all(|f| f.link().is_some()));
    }

    #[test]
    fn rejects_links_to_missing_or_distant_seats() {
        let mut far = submit(vec![room(None, vec![seat(None, "A1", 2, 2)])]);
        far.rooms[0].features.push(screen(0, 0, 1, Some((2, 2))));
        let err = validate_layout(&mut far, &existing()).expect_err("should be rejected");
        assert!(err.contains("does not touch it"), "{err}");
        assert!(err.contains("seat A1"), "{err}");

        let mut empty = submit(vec![room(None, vec![seat(None, "A1", 2, 2)])]);
        empty.rooms[0].features.push(screen(3, 3, 1, Some((4, 4))));
        let err = validate_layout(&mut empty, &existing()).expect_err("should be rejected");
        assert!(err.contains("no seat"), "{err}");
    }

    #[test]
    fn drops_links_to_seats_the_save_deletes() {
        // Seat 10 at (2,2) is left out of the save, so it is deleted.
        let mut layout = submit(vec![room(Some(1), vec![])]);
        layout.rooms[0].features.push(screen(1, 1, 1, Some((2, 2))));
        assert_eq!(validate_layout(&mut layout, &existing()), Ok(()));
        assert_eq!(layout.rooms[0].features[1].link(), None);
    }

    #[test]
    fn clears_stale_links_only() {
        let mut features = vec![
            screen(0, 0, 1, Some((1, 1))),
            screen(1, 0, 1, Some((1, 1))),
            screen(4, 0, 2, Some((5, 1))),
            screen(8, 0, 3, None),
        ];
        let seats = HashSet::from([(5, 1)]);
        assert_eq!(clear_stale_links(&mut features, &seats), 1);
        assert_eq!(features[0].link(), None);
        assert_eq!(features[1].link(), None);
        assert_eq!(features[2].link(), Some((5, 1)));
    }
}
