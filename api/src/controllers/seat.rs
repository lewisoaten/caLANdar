use sqlx::PgPool;

use crate::{
    controllers::{ensure_user_invited, Error},
    repositories::{seat, seat_reservation},
    routes::seats::{Seat, SeatSubmit},
};

/// Maximum length of a seat identifier (the short label drawn on the seat).
pub const MAX_IDENTIFIER_LEN: usize = 8;
/// Maximum length of a seat's name (its human-readable title).
pub const MAX_NAME_LEN: usize = 60;
/// Maximum length of a seat's free-text description.
pub const MAX_DESCRIPTION_LEN: usize = 120;

/// Trim and validate a seat identifier: 1 to 8 characters of A-Z, a-z, 0-9,
/// `-`, `_` and `.`. Case is kept (uniqueness checks ignore it).
pub fn normalise_seat_identifier(label: &str) -> Result<String, String> {
    let label = label.trim();
    if label.is_empty() || label.chars().count() > MAX_IDENTIFIER_LEN {
        return Err(format!(
            "Seat identifier \"{label}\" must be 1 to {MAX_IDENTIFIER_LEN} characters"
        ));
    }
    if !label
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.'))
    {
        return Err(format!(
            "Seat identifier \"{label}\" may only contain letters, digits, '-', '_' and '.'"
        ));
    }
    Ok(label.to_string())
}

/// Validate a seat identifier, but let an existing seat keep a label saved
/// before the current rules (e.g. "Window seat 12") as long as it is unchanged.
pub fn normalise_seat_identifier_for(
    label: &str,
    existing: Option<&str>,
) -> Result<String, String> {
    let trimmed = label.trim();
    match existing {
        Some(old) if !trimmed.is_empty() && (old == label || old.trim() == trimmed) => {
            Ok(old.to_string())
        }
        _ => normalise_seat_identifier(label),
    }
}

/// Trim and validate a seat name, e.g. "Wall sofa (S)": blank becomes `None`;
/// otherwise 1 to 60 characters (code points) of printable text, no control
/// characters.
pub fn normalise_seat_name(name: Option<&str>) -> Result<Option<String>, String> {
    let Some(text) = name.map(str::trim).filter(|n| !n.is_empty()) else {
        return Ok(None);
    };
    if text.chars().count() > MAX_NAME_LEN {
        return Err(format!(
            "Seat name must be at most {MAX_NAME_LEN} characters"
        ));
    }
    if text.chars().any(char::is_control) {
        return Err(
            "Seat name may not contain control characters (such as line breaks or tabs)"
                .to_string(),
        );
    }
    Ok(Some(text.to_string()))
}

/// How a seat is named in prose (audit log, activity ticker): its name when it
/// has one, otherwise its identifier.
pub fn seat_display_name<'a>(label: &'a str, name: Option<&'a str>) -> &'a str {
    name.map(str::trim)
        .filter(|n| !n.is_empty())
        .unwrap_or(label)
}

/// Trim a seat description: blank becomes `None`; at most 120 characters.
pub fn normalise_seat_description(description: Option<&str>) -> Result<Option<String>, String> {
    let Some(text) = description.map(str::trim).filter(|d| !d.is_empty()) else {
        return Ok(None);
    };
    if text.chars().count() > MAX_DESCRIPTION_LEN {
        return Err(format!(
            "Seat description must be at most {MAX_DESCRIPTION_LEN} characters"
        ));
    }
    Ok(Some(text.to_string()))
}

impl From<seat::Seat> for Seat {
    fn from(seat: seat::Seat) -> Self {
        Self {
            id: seat.id,
            event_id: seat.event_id,
            room_id: seat.room_id,
            label: seat.label,
            name: seat.name,
            description: seat.description,
            x: seat.x,
            y: seat.y,
            created_at: seat.created_at,
            last_modified: seat.last_modified,
            grid_col: seat.grid_col,
            grid_row: seat.grid_row,
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

pub async fn get_all_for_invited_user(
    pool: &PgPool,
    event_id: i32,
    email: &str,
) -> Result<Vec<Seat>, Error> {
    ensure_user_invited(pool, event_id, email).await?;
    get_all(pool, event_id).await
}

pub async fn get_reserved_seat_for_user(
    pool: &PgPool,
    event_id: i32,
    seat_id: i32,
    email: &str,
) -> Result<Seat, Error> {
    ensure_user_invited(pool, event_id, email).await?;

    let seat = match seat::get(pool, seat_id).await {
        Ok(Some(seat)) => {
            if seat.event_id != event_id {
                return Err(Error::NotFound(format!(
                    "Seat with ID {seat_id} does not belong to event {event_id}",
                )));
            }
            Seat::from(seat)
        }
        Ok(None) => return Err(Error::NotFound(format!("Seat with ID {seat_id} not found"))),
        Err(e) => return Err(Error::Controller(format!("Unable to get seat due to: {e}"))),
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

    match reservation.seat_id {
        Some(reservation_seat_id) if reservation_seat_id == seat_id => Ok(seat),
        Some(_) | None => Err(Error::NotFound(
            "You have not reserved this seat for this event".to_string(),
        )),
    }
}

pub async fn get(pool: &PgPool, seat_id: i32) -> Result<Option<Seat>, Error> {
    match seat::get(pool, seat_id).await {
        Ok(Some(seat)) => Ok(Some(Seat::from(seat))),
        Ok(None) => Ok(None),
        Err(e) => Err(Error::Controller(format!("Unable to get seat due to: {e}"))),
    }
}

pub async fn create(
    pool: &PgPool,
    event_id: i32,
    mut seat_submit: SeatSubmit,
    user_email: String,
) -> Result<Seat, Error> {
    seat_submit.label = normalise_seat_identifier(&seat_submit.label).map_err(Error::BadInput)?;
    seat_submit.name = normalise_seat_name(seat_submit.name.as_deref()).map_err(Error::BadInput)?;
    seat_submit.description =
        normalise_seat_description(seat_submit.description.as_deref()).map_err(Error::BadInput)?;

    if seat_submit.x < 0.0 || seat_submit.x > 1.0 || seat_submit.y < 0.0 || seat_submit.y > 1.0 {
        return Err(Error::BadInput(
            "Coordinates must be between 0.0 and 1.0".to_string(),
        ));
    }

    match seat::create(
        pool,
        event_id,
        seat_submit.room_id,
        seat::SeatText {
            label: seat_submit.label.clone(),
            name: seat_submit.name.clone(),
            description: seat_submit.description.clone(),
        },
        seat_submit.x,
        seat_submit.y,
        (seat_submit.grid_col, seat_submit.grid_row),
    )
    .await
    {
        Ok(seat) => {
            // Log audit entry
            let metadata = rocket::serde::json::serde_json::json!({
                "event_id": event_id,
                "seat_id": seat.id,
                "room_id": seat_submit.room_id,
                "label": seat_submit.label,
            });
            crate::util::log_audit(
                pool,
                Some(user_email),
                "seat.create".to_string(),
                "seat".to_string(),
                Some(seat.id.to_string()),
                Some(metadata),
            )
            .await;

            Ok(Seat::from(seat))
        }
        Err(e) => Err(Error::Controller(format!(
            "Unable to create seat due to: {e}"
        ))),
    }
}

pub async fn update(
    pool: &PgPool,
    seat_id: i32,
    mut seat_submit: SeatSubmit,
    user_email: String,
) -> Result<Seat, Error> {
    let existing = seat::get(pool, seat_id)
        .await
        .map_err(|e| Error::Controller(format!("Unable to get seat due to: {e}")))?;
    seat_submit.label = normalise_seat_identifier_for(
        &seat_submit.label,
        existing.as_ref().map(|s| s.label.as_str()),
    )
    .map_err(Error::BadInput)?;
    seat_submit.name = normalise_seat_name(seat_submit.name.as_deref()).map_err(Error::BadInput)?;
    seat_submit.description =
        normalise_seat_description(seat_submit.description.as_deref()).map_err(Error::BadInput)?;

    if seat_submit.x < 0.0 || seat_submit.x > 1.0 || seat_submit.y < 0.0 || seat_submit.y > 1.0 {
        return Err(Error::BadInput(
            "Coordinates must be between 0.0 and 1.0".to_string(),
        ));
    }

    match seat::update(
        pool,
        seat_id,
        seat::SeatText {
            label: seat_submit.label.clone(),
            name: seat_submit.name.clone(),
            description: seat_submit.description.clone(),
        },
        seat_submit.x,
        seat_submit.y,
        (seat_submit.grid_col, seat_submit.grid_row),
    )
    .await
    {
        Ok(seat) => {
            // Log audit entry
            let metadata = rocket::serde::json::serde_json::json!({
                "seat_id": seat_id,
                "label": seat_submit.label,
            });
            crate::util::log_audit(
                pool,
                Some(user_email),
                "seat.update".to_string(),
                "seat".to_string(),
                Some(seat_id.to_string()),
                Some(metadata),
            )
            .await;

            Ok(Seat::from(seat))
        }
        Err(e) => Err(Error::Controller(format!(
            "Unable to update seat due to: {e}"
        ))),
    }
}

pub async fn delete(pool: &PgPool, seat_id: i32, user_email: String) -> Result<(), Error> {
    match seat::delete(pool, seat_id).await {
        Ok(()) => {
            // Log audit entry
            let metadata = rocket::serde::json::serde_json::json!({
                "seat_id": seat_id,
            });
            crate::util::log_audit(
                pool,
                Some(user_email),
                "seat.delete".to_string(),
                "seat".to_string(),
                Some(seat_id.to_string()),
                Some(metadata),
            )
            .await;

            Ok(())
        }
        Err(e) => Err(Error::Controller(format!(
            "Unable to delete seat due to: {e}"
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_seat_identifiers() {
        assert_eq!(normalise_seat_identifier(" A1 "), Ok("A1".to_string()));
        assert_eq!(normalise_seat_identifier("zz99"), Ok("zz99".to_string()));
        assert_eq!(
            normalise_seat_identifier("Dk-1.b_"),
            Ok("Dk-1.b_".to_string())
        );
        assert_eq!(
            normalise_seat_identifier("ABCDEFGH"),
            Ok("ABCDEFGH".to_string())
        );
        assert!(normalise_seat_identifier("").is_err());
        assert!(normalise_seat_identifier("   ").is_err());
        assert!(normalise_seat_identifier("ABCDEFGHI").is_err());
        assert!(normalise_seat_identifier("A 1").is_err());
        assert!(normalise_seat_identifier("Ä1").is_err());
        assert!(normalise_seat_identifier("A/1").is_err());
    }

    #[test]
    fn keeps_unchanged_legacy_identifiers() {
        let old = Some("Window seat 12");
        assert_eq!(
            normalise_seat_identifier_for("Window seat 12", old),
            Ok("Window seat 12".to_string())
        );
        assert_eq!(
            normalise_seat_identifier_for(" Window seat 12 ", old),
            Ok("Window seat 12".to_string())
        );
        // Changing it means following the rules.
        assert!(normalise_seat_identifier_for("Window seat 13", old).is_err());
        assert!(normalise_seat_identifier_for("", old).is_err());
        assert_eq!(
            normalise_seat_identifier_for("W12", old),
            Ok("W12".to_string())
        );
        assert!(normalise_seat_identifier_for("Window seat 12", None).is_err());
    }

    #[test]
    fn keeps_unchanged_legacy_labels_with_spaces_and_parentheses() {
        let old = Some("WALL SOFA (S)");
        assert_eq!(
            normalise_seat_identifier_for("WALL SOFA (S)", old),
            Ok("WALL SOFA (S)".to_string())
        );
        assert_eq!(
            normalise_seat_identifier_for("  WALL SOFA (S) ", old),
            Ok("WALL SOFA (S)".to_string())
        );
        assert!(normalise_seat_identifier_for("WALL SOFA (N)", old).is_err());
        assert_eq!(
            normalise_seat_identifier_for("WS", old),
            Ok("WS".to_string())
        );
    }

    #[test]
    fn validates_seat_names() {
        assert_eq!(normalise_seat_name(None), Ok(None));
        assert_eq!(normalise_seat_name(Some("   ")), Ok(None));
        assert_eq!(
            normalise_seat_name(Some("  Wall sofa (S) ")),
            Ok(Some("Wall sofa (S)".to_string()))
        );
        assert_eq!(
            normalise_seat_name(Some("Fensterplatz – Süd #3 🎮")),
            Ok(Some("Fensterplatz – Süd #3 🎮".to_string()))
        );
        // Counted in code points, not bytes.
        let max = "é".repeat(MAX_NAME_LEN);
        assert_eq!(normalise_seat_name(Some(&max)), Ok(Some(max.clone())));
        assert!(normalise_seat_name(Some(&format!("{max}x"))).is_err());
        assert!(normalise_seat_name(Some("Wall\nsofa")).is_err());
        assert!(normalise_seat_name(Some("Wall\tsofa")).is_err());
        assert!(normalise_seat_name(Some("Wall\u{7}sofa")).is_err());
    }

    #[test]
    fn displays_the_name_falling_back_to_the_identifier() {
        assert_eq!(
            seat_display_name("WS", Some("Wall sofa (S)")),
            "Wall sofa (S)"
        );
        assert_eq!(seat_display_name("WS", Some("  ")), "WS");
        assert_eq!(seat_display_name("WS", None), "WS");
    }

    #[test]
    fn validates_seat_descriptions() {
        assert_eq!(normalise_seat_description(None), Ok(None));
        assert_eq!(normalise_seat_description(Some("   ")), Ok(None));
        assert_eq!(
            normalise_seat_description(Some("  Window seat next to the fridge ")),
            Ok(Some("Window seat next to the fridge".to_string()))
        );
        let max = "é".repeat(MAX_DESCRIPTION_LEN);
        assert_eq!(
            normalise_seat_description(Some(&max)),
            Ok(Some(max.clone()))
        );
        assert!(normalise_seat_description(Some(&format!("{max}x"))).is_err());
    }
}
