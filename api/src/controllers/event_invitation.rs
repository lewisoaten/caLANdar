use chrono::{DateTime, Duration, Utc};
use log::warn;
use sqlx::PgPool;

use crate::{
    controllers::Error,
    repositories::invitation::{self, Response},
    routes::event_invitations::{InvitationResponse, InvitationsPatchRequest},
    util::is_event_active,
};

// Implement From for EventsGetResponse from Event
impl From<InvitationResponse> for Response {
    fn from(response: InvitationResponse) -> Self {
        match response {
            InvitationResponse::Yes => Self::Yes,
            InvitationResponse::No => Self::No,
            InvitationResponse::Maybe => Self::Maybe,
        }
    }
}

fn _get_day_quarter_buckets(time_begin: DateTime<Utc>, time_end: DateTime<Utc>) -> Vec<u8> {
    let mut buckets = Vec::new();

    // Start from 6 AM of time_begin's date
    let mut current_day = time_begin
        .date_naive()
        .and_hms_opt(6, 0, 0)
        .expect("Invalid time")
        .and_local_timezone(Utc)
        .unwrap();

    warn!("Starting calculation of day quarter buckets");
    warn!("time_begin: {}", time_begin);
    warn!("time_end: {}", time_end);

    while current_day < time_end {
        warn!("\nProcessing day starting at: {}", current_day);

        // Iterate over each 6-hour bucket, starting from 6 AM
        for &hour in &[6, 12, 18, 0] {
            let bucket_start = if hour == 0 {
                current_day + Duration::days(1) // Move to midnight of the next day
            } else {
                current_day + Duration::hours(i64::from(hour))
            };
            let bucket_end = bucket_start + Duration::hours(6);

            warn!("Bucket from {} to {}: ", bucket_start, bucket_end);

            // Check if this bucket is within the specified time range
            if bucket_start <= time_end && bucket_end > time_begin {
                buckets.push(1u8);
                warn!("  -> Within range, adding 1");
            } else {
                warn!("  -> Out of range, skipping bucket");
            }
        }

        // Move to the next day's 6 AM
        current_day += Duration::days(1);
        warn!("Moving to next day at 6 AM: {}", current_day);
    }

    warn!("Finished calculation. Buckets: {:?}", buckets);

    buckets
}

// fn _get_day_quarter_buckets(
//     time_begin: chrono::DateTime<Utc>,
//     time_end: chrono::DateTime<Utc>,
// ) -> Vec<u8> {
//     const SECONDS_PER_QUARTER: i64 = 60 * 60 * 24 / 4;

//     log::info!(
//         "Calculating day quarter buckets for event from {time_begin} to {time_end}",
//         time_begin = time_begin,
//         time_end = time_end
//     );

//     let positive_duration_in_seconds = time_end
//         .signed_duration_since(time_begin)
//         .num_seconds()
//         .abs();

//     log::info!(
//         "Event duration is {positive_duration_in_seconds} seconds",
//         positive_duration_in_seconds = positive_duration_in_seconds
//     );

//     let quarter_days = match u8::try_from(
//         positive_duration_in_seconds / SECONDS_PER_QUARTER,
//     ) {
//         Ok(quarter_days) => quarter_days,
//         Err(_) => return vec![],
//     };

//     log::info!(
//         "Event duration is {quarter_days} quarter days",
//         quarter_days = quarter_days
//     );

//     // Return vector of 0s with the same number of elements as quarter_days
//     vec![0_u8; quarter_days as usize]
// }

pub async fn respond(
    pool: &PgPool,
    event_id: i32,
    email: String,
    invitation_response: InvitationsPatchRequest,
) -> Result<(), Error> {
    let event = match is_event_active(pool, event_id).await {
        Err(e) => {
            return Err(Error::Controller(format!(
                "Unable to check if event is active, due to: {e}"
            )))
        }
        Ok((false, _)) => {
            return Err(Error::NotPermitted(
                "You can only respond to invitations for active events".to_string(),
            ))
        }
        Ok((true, event)) => event,
    };

    // Check if attendence has the same number of elements as day quarter buckets for the events duration
    if let Some(ref attendance) = invitation_response.attendance {
        let day_quarter_buckets = _get_day_quarter_buckets(event.time_begin, event.time_end).len();
        let attendance_length = attendance.len();

        if attendance_length != day_quarter_buckets {
            return Err(Error::Controller(format!(
                "You must indicate attendence for the exact duration of the event. Expected: {day_quarter_buckets}, got: {attendance_length}"
            )));
        }
    };

    // Respond to invitation
    match invitation::edit(
        pool,
        event_id,
        email,
        invitation_response.handle,
        invitation_response.response.into(),
        invitation_response.attendance,
    )
    .await
    {
        Ok(_event) => Ok(()),
        Err(e) => Err(Error::Controller(format!(
            "Unable to create event due to: {e}"
        ))),
    }
}
