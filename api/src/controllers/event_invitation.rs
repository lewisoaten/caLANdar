use chrono::Utc;
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
fn _get_day_quarter_buckets(
    time_begin: chrono::DateTime<Utc>,
    time_end: chrono::DateTime<Utc>,
) -> Vec<u8> {
    const SECONDS_PER_QUARTER: i64 = 60 * 60 * 24 / 4;

    let positive_duration_in_seconds = time_end
        .signed_duration_since(time_begin)
        .num_seconds()
        .abs();

    let quarter_days = match u8::try_from(
        (positive_duration_in_seconds + SECONDS_PER_QUARTER - 1) / SECONDS_PER_QUARTER,
    ) {
        Ok(quarter_days) => quarter_days,
        Err(_) => return vec![],
    };

    // Return vector of 0s with the same number of elements as quarter_days
    vec![0_u8; quarter_days as usize]
}

pub async fn respond(
    pool: &PgPool,
    event_id: i32,
    email: String,
    invitation_response: InvitationsPatchRequest,
) -> Result<(), Error> {
    let event = match is_event_active(pool, event_id).await {
        Err(e) => {
            return Err(Error::Controller(format!(
                "Unable to check if event is active, due to: {}",
                e
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
                "You must indicate attendence for the exact duration of the event. Expected: {}, got: {}",
                day_quarter_buckets,
                attendance_length
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
            "Unable to create event due to: {}",
            e
        ))),
    }
}
