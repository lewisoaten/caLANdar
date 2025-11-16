use sqlx::PgPool;

use crate::{
    controllers::Error,
    repositories::{event_seating_config, invitation, seat, seat_reservation},
    routes::seat_reservations::{SeatReservation, SeatReservationSubmit},
    util::is_event_active,
};

impl From<seat_reservation::SeatReservation> for SeatReservation {
    fn from(reservation: seat_reservation::SeatReservation) -> Self {
        Self {
            id: reservation.id,
            event_id: reservation.event_id,
            seat_id: reservation.seat_id,
            invitation_email: reservation.invitation_email,
            attendance_buckets: reservation.attendance_buckets,
            created_at: reservation.created_at,
            last_modified: reservation.last_modified,
        }
    }
}

/// Check if two sets of attendance buckets have any overlap
fn has_bucket_overlap(buckets1: &[u8], buckets2: &[u8]) -> bool {
    if buckets1.len() != buckets2.len() {
        return false;
    }

    for (b1, b2) in buckets1.iter().zip(buckets2.iter()) {
        if *b1 == 1 && *b2 == 1 {
            return true;
        }
    }

    false
}

/// Check if a seat reservation would conflict with existing reservations
async fn check_seat_conflicts(
    pool: &PgPool,
    seat_id: Option<i32>,
    attendance_buckets: &[u8],
    exclude_email: Option<&str>,
) -> Result<bool, Error> {
    // If seat_id is None (unspecified seat), there's no conflict
    let Some(seat_id_value) = seat_id else {
        return Ok(false);
    };

    // Get all existing reservations for this seat
    let existing_reservations = match seat_reservation::get_by_seat(pool, seat_id_value).await {
        Ok(reservations) => reservations,
        Err(e) => {
            return Err(Error::Controller(format!(
                "Unable to check for conflicts due to: {e}"
            )))
        }
    };

    // Check each existing reservation for bucket overlap
    for existing in existing_reservations {
        // Skip if this is the same user (updating their own reservation)
        if let Some(email) = exclude_email {
            if existing.invitation_email.eq_ignore_ascii_case(email) {
                continue;
            }
        }

        if has_bucket_overlap(attendance_buckets, &existing.attendance_buckets) {
            return Ok(true);
        }
    }

    Ok(false)
}

/// Get all seat reservations for an event (admin only)
pub async fn get_all(pool: &PgPool, event_id: i32) -> Result<Vec<SeatReservation>, Error> {
    match seat_reservation::get_all_by_event(pool, event_id).await {
        Ok(reservations) => Ok(reservations
            .into_iter()
            .map(SeatReservation::from)
            .collect()),
        Err(e) => Err(Error::Controller(format!(
            "Unable to get seat reservations due to: {e}"
        ))),
    }
}

/// Get a user's seat reservation for an event
pub async fn get_by_email(
    pool: &PgPool,
    event_id: i32,
    email: &str,
) -> Result<Option<SeatReservation>, Error> {
    match seat_reservation::get_by_email(pool, event_id, email).await {
        Ok(Some(reservation)) => Ok(Some(SeatReservation::from(reservation))),
        Ok(None) => Ok(None),
        Err(e) => Err(Error::Controller(format!(
            "Unable to get seat reservation due to: {e}"
        ))),
    }
}

/// Validate that a seat exists and belongs to the given event
async fn validate_seat(pool: &PgPool, seat_id: i32, event_id: i32) -> Result<(), Error> {
    match seat::get(pool, seat_id).await {
        Ok(None) => Err(Error::BadInput(format!(
            "Seat with ID {seat_id} does not exist"
        ))),
        Ok(Some(seat_data)) => {
            if seat_data.event_id == event_id {
                Ok(())
            } else {
                Err(Error::BadInput(format!(
                    "Seat {seat_id} does not belong to event {event_id}"
                )))
            }
        }
        Err(e) => Err(Error::Controller(format!(
            "Unable to validate seat due to: {e}"
        ))),
    }
}

/// Validate that unspecified seats are allowed for the event
async fn validate_unspecified_seat_allowed(pool: &PgPool, event_id: i32) -> Result<(), Error> {
    match event_seating_config::get(pool, event_id).await {
        Ok(Some(config)) => {
            if config.allow_unspecified_seat {
                Ok(())
            } else {
                Err(Error::BadInput(
                    "Unspecified seat reservations are not allowed for this event".to_string(),
                ))
            }
        }
        Ok(None) => Err(Error::BadInput(
            "Seating is not configured for this event".to_string(),
        )),
        Err(e) => Err(Error::Controller(format!(
            "Unable to check seating config due to: {e}"
        ))),
    }
}

/// Validate attendance buckets length matches event duration
fn validate_attendance_buckets(buckets: &[u8], expected_count: usize) -> Result<(), Error> {
    if buckets.len() == expected_count {
        Ok(())
    } else {
        Err(Error::BadInput(format!(
            "Attendance buckets length mismatch. Expected {expected_count}, got {}",
            buckets.len()
        )))
    }
}

/// Create a new seat reservation
#[allow(clippy::too_many_lines)]
pub async fn create(
    pool: &PgPool,
    event_id: i32,
    email: String,
    submit: SeatReservationSubmit,
    is_admin: bool,
) -> Result<SeatReservation, Error> {
    // Check if event is active (only admins can modify inactive events)
    let event = match is_event_active(pool, event_id).await {
        Err(e) => {
            return Err(Error::Controller(format!(
                "Unable to check if event is active, due to: {e}"
            )))
        }
        Ok((false, event)) => {
            if !is_admin {
                return Err(Error::NotPermitted(
                    "You can only create reservations for active events".to_string(),
                ));
            }
            event
        }
        Ok((true, event)) => event,
    };

    // Check if the invitation exists
    match invitation::filter(
        pool,
        invitation::Filter {
            event_id: Some(event_id),
            email: Some(email.clone()),
        },
    )
    .await
    {
        Ok(invitations) if invitations.is_empty() => {
            return Err(Error::BadInput(format!(
                "No invitation found for email {email} at event {event_id}"
            )))
        }
        Err(e) => {
            return Err(Error::Controller(format!(
                "Unable to check invitation due to: {e}"
            )))
        }
        Ok(_) => {}
    }

    // Validate attendance buckets match event duration
    let expected_bucket_count = crate::controllers::event_invitation::get_day_quarter_buckets(
        event.time_begin,
        event.time_end,
    )
    .len();

    validate_attendance_buckets(&submit.attendance_buckets, expected_bucket_count)?;

    // Validate that seating is enabled for this event
    match event_seating_config::get(pool, event_id).await {
        Ok(Some(config)) => {
            if !config.has_seating {
                return Err(Error::BadInput(
                    "Seating is not enabled for this event".to_string(),
                ));
            }
        }
        Ok(None) => {
            return Err(Error::BadInput(
                "Seating is not configured for this event".to_string(),
            ));
        }
        Err(e) => {
            return Err(Error::Controller(format!(
                "Unable to check seating config due to: {e}"
            )));
        }
    }

    // If a specific seat is requested, validate it exists and check for conflicts
    if let Some(seat_id) = submit.seat_id {
        validate_seat(pool, seat_id, event_id).await?;

        // Check for conflicts
        if check_seat_conflicts(pool, Some(seat_id), &submit.attendance_buckets, None).await? {
            return Err(Error::Conflict(
                "This seat is already reserved for one or more of the selected time buckets"
                    .to_string(),
            ));
        }
    } else {
        // For unspecified seat, check if it's allowed
        validate_unspecified_seat_allowed(pool, event_id).await?;
    }

    // Check if user already has a reservation for this event
    match seat_reservation::get_by_email(pool, event_id, &email).await {
        Ok(Some(existing)) => {
            return Err(Error::Conflict(format!(
                "You already have a reservation (ID: {}) for this event. Please update or delete it first.",
                existing.id
            )));
        }
        Ok(None) => {
            // No existing reservation, proceed
        }
        Err(e) => {
            return Err(Error::Controller(format!(
                "Unable to check for existing reservation due to: {e}"
            )));
        }
    }

    // Create the reservation
    match seat_reservation::create(
        pool,
        event_id,
        submit.seat_id,
        email,
        submit.attendance_buckets,
    )
    .await
    {
        Ok(reservation) => Ok(SeatReservation::from(reservation)),
        Err(e) => Err(Error::Controller(format!(
            "Unable to create seat reservation due to: {e}"
        ))),
    }
}

/// Update an existing seat reservation
#[allow(clippy::too_many_lines)]
pub async fn update(
    pool: &PgPool,
    event_id: i32,
    email: String,
    submit: SeatReservationSubmit,
    is_admin: bool,
) -> Result<SeatReservation, Error> {
    // Check if event is active
    let event = match is_event_active(pool, event_id).await {
        Err(e) => {
            return Err(Error::Controller(format!(
                "Unable to check if event is active, due to: {e}"
            )))
        }
        Ok((false, event)) => {
            if !is_admin {
                return Err(Error::NotPermitted(
                    "You can only update reservations for active events".to_string(),
                ));
            }
            event
        }
        Ok((true, event)) => event,
    };

    // Get the existing reservation
    let existing = match seat_reservation::get_by_email(pool, event_id, &email).await {
        Ok(Some(reservation)) => reservation,
        Ok(None) => {
            return Err(Error::NotFound(format!(
                "No reservation found for email {email} at event {event_id}"
            )))
        }
        Err(e) => {
            return Err(Error::Controller(format!(
                "Unable to get existing reservation due to: {e}"
            )))
        }
    };

    // Validate attendance buckets match event duration
    let expected_bucket_count = crate::controllers::event_invitation::get_day_quarter_buckets(
        event.time_begin,
        event.time_end,
    )
    .len();

    validate_attendance_buckets(&submit.attendance_buckets, expected_bucket_count)?;

    // Validate that seating is enabled for this event
    match event_seating_config::get(pool, event_id).await {
        Ok(Some(config)) => {
            if !config.has_seating {
                return Err(Error::BadInput(
                    "Seating is not enabled for this event".to_string(),
                ));
            }
        }
        Ok(None) => {
            return Err(Error::BadInput(
                "Seating is not configured for this event".to_string(),
            ));
        }
        Err(e) => {
            return Err(Error::Controller(format!(
                "Unable to check seating config due to: {e}"
            )));
        }
    }

    // If a specific seat is requested, validate it and check for conflicts
    if let Some(seat_id) = submit.seat_id {
        validate_seat(pool, seat_id, event_id).await?;

        // Check for conflicts (excluding this user's existing reservation)
        if check_seat_conflicts(
            pool,
            Some(seat_id),
            &submit.attendance_buckets,
            Some(&email),
        )
        .await?
        {
            return Err(Error::Conflict(
                "This seat is already reserved for one or more of the selected time buckets"
                    .to_string(),
            ));
        }
    } else {
        // For unspecified seat, check if it's allowed
        validate_unspecified_seat_allowed(pool, event_id).await?;
    }

    // Update the reservation
    match seat_reservation::update(pool, existing.id, submit.seat_id, submit.attendance_buckets)
        .await
    {
        Ok(reservation) => Ok(SeatReservation::from(reservation)),
        Err(e) => Err(Error::Controller(format!(
            "Unable to update seat reservation due to: {e}"
        ))),
    }
}

/// Delete a seat reservation
pub async fn delete(
    pool: &PgPool,
    event_id: i32,
    email: &str,
    is_admin: bool,
) -> Result<(), Error> {
    // Check if event is active
    match is_event_active(pool, event_id).await {
        Err(e) => {
            return Err(Error::Controller(format!(
                "Unable to check if event is active, due to: {e}"
            )))
        }
        Ok((false, _)) => {
            if !is_admin {
                return Err(Error::NotPermitted(
                    "You can only delete reservations for active events".to_string(),
                ));
            }
        }
        Ok((true, _)) => {}
    }

    // Delete the reservation
    match seat_reservation::delete_by_email(pool, event_id, email).await {
        Ok(()) => Ok(()),
        Err(e) => Err(Error::Controller(format!(
            "Unable to delete seat reservation due to: {e}"
        ))),
    }
}

/// Check seat availability for given attendance buckets
/// Returns a list of seat IDs that are available (no conflicts) for the given time buckets
pub async fn check_availability(
    pool: &PgPool,
    event_id: i32,
    attendance_buckets: &[u8],
) -> Result<Vec<i32>, Error> {
    // Get all seats for this event
    let all_seats = match seat::get_all_by_event(pool, event_id).await {
        Ok(seats) => seats,
        Err(e) => {
            return Err(Error::Controller(format!(
                "Unable to get seats for event due to: {e}"
            )))
        }
    };

    // Get all seat reservations for this event
    let reservations = match seat_reservation::get_all_by_event(pool, event_id).await {
        Ok(res) => res,
        Err(e) => {
            return Err(Error::Controller(format!(
                "Unable to get seat reservations due to: {e}"
            )))
        }
    };

    // Filter seats that are available (no conflicts)
    let available_seats: Vec<i32> = all_seats
        .into_iter()
        .filter(|seat| {
            // Check if this seat has any conflicting reservations
            let has_conflict = reservations.iter().any(|reservation| {
                // Only check reservations for this specific seat
                if reservation.seat_id != Some(seat.id) {
                    return false;
                }
                // Check for bucket overlap
                has_bucket_overlap(attendance_buckets, &reservation.attendance_buckets)
            });
            !has_conflict
        })
        .map(|seat| seat.id)
        .collect();

    Ok(available_seats)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_has_bucket_overlap_no_overlap() {
        let buckets1 = vec![1, 0, 1, 0];
        let buckets2 = vec![0, 1, 0, 1];
        assert!(!has_bucket_overlap(&buckets1, &buckets2));
    }

    #[test]
    fn test_has_bucket_overlap_with_overlap() {
        let buckets1 = vec![1, 0, 1, 0];
        let buckets2 = vec![1, 1, 0, 1];
        assert!(has_bucket_overlap(&buckets1, &buckets2));
    }

    #[test]
    fn test_has_bucket_overlap_all_overlap() {
        let buckets1 = vec![1, 1, 1, 1];
        let buckets2 = vec![1, 1, 1, 1];
        assert!(has_bucket_overlap(&buckets1, &buckets2));
    }

    #[test]
    fn test_has_bucket_overlap_no_attendance() {
        let buckets1 = vec![0, 0, 0, 0];
        let buckets2 = vec![0, 0, 0, 0];
        assert!(!has_bucket_overlap(&buckets1, &buckets2));
    }

    #[test]
    fn test_has_bucket_overlap_different_lengths() {
        let buckets1 = vec![1, 0, 1];
        let buckets2 = vec![1, 1, 0, 1];
        assert!(!has_bucket_overlap(&buckets1, &buckets2));
    }

    #[test]
    fn test_has_bucket_overlap_single_overlap() {
        let buckets1 = vec![0, 0, 1, 0];
        let buckets2 = vec![0, 0, 1, 0];
        assert!(has_bucket_overlap(&buckets1, &buckets2));
    }
}
