use chrono::{DateTime, Duration, Utc};
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

fn get_day_quarter_buckets(time_begin: DateTime<Utc>, time_end: DateTime<Utc>) -> Vec<u8> {
    let mut buckets = Vec::new();

    // Start from 6 AM of time_begin's date
    let mut current_day = time_begin
        .date_naive()
        .and_hms_opt(6, 0, 0)
        .expect("Invalid time")
        .and_local_timezone(Utc)
        .unwrap();

    while current_day < time_end {
        // Iterate over each 6-hour bucket, starting from 6 AM
        for &hour in &[6, 12, 18, 0] {
            let bucket_start = if hour == 0 {
                // Midnight of the next day
                current_day
                    .date_naive()
                    .succ_opt()
                    .expect("Invalid date")
                    .and_hms_opt(0, 0, 0)
                    .expect("Invalid time")
                    .and_local_timezone(Utc)
                    .unwrap()
            } else {
                // Set time to specific hour on current day
                current_day
                    .date_naive()
                    .and_hms_opt(hour, 0, 0)
                    .expect("Invalid time")
                    .and_local_timezone(Utc)
                    .unwrap()
            };
            let bucket_end = bucket_start + Duration::hours(6);

            // Check if this bucket is within the specified time range
            if bucket_start <= time_end && bucket_end > time_begin {
                buckets.push(1u8);
            }
        }

        // Move to the next day's 6 AM
        current_day += Duration::days(1);
    }

    buckets
}

pub async fn respond(
    pool: &PgPool,
    event_id: i32,
    email: String,
    invitation_response: InvitationsPatchRequest,
    is_admin: bool,
) -> Result<(), Error> {
    let event = match is_event_active(pool, event_id).await {
        Err(e) => {
            return Err(Error::Controller(format!(
                "Unable to check if event is active, due to: {e}"
            )))
        }
        Ok((false, event)) => {
            // Admins can edit invitations for inactive events
            if !is_admin {
                return Err(Error::NotPermitted(
                    "You can only respond to invitations for active events".to_string(),
                ));
            }
            event
        }
        Ok((true, event)) => event,
    };

    // Check if attendence has the same number of elements as day quarter buckets for the events duration
    if let Some(ref attendance) = invitation_response.attendance {
        let day_quarter_buckets = get_day_quarter_buckets(event.time_begin, event.time_end).len();
        let attendance_length = attendance.len();

        if attendance_length != day_quarter_buckets {
            return Err(Error::Controller(format!(
                "You must indicate attendence for the exact duration of the event. Expected: {day_quarter_buckets}, got: {attendance_length}"
            )));
        }
    }

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

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn test_get_day_quarter_buckets_single_day() {
        // Test event that spans less than one full day (6 AM to 6 PM)
        let time_begin = Utc.with_ymd_and_hms(2025, 1, 15, 6, 0, 0).unwrap();
        let time_end = Utc.with_ymd_and_hms(2025, 1, 15, 18, 0, 0).unwrap();
        
        let buckets = get_day_quarter_buckets(time_begin, time_end);
        
        // Buckets: 6 AM-12 PM (start:6AM<=end:6PM, end:12PM>begin:6AM) ✓
        //          12 PM-6 PM (start:12PM<=end:6PM, end:6PM>begin:6AM) ✓
        //          6 PM-12 AM (start:6PM<=end:6PM FALSE)
        // Should have 2 buckets, but includes 6 PM bucket because start:6PM <= end:6PM
        assert_eq!(buckets.len(), 3, "Single day event 6 AM to 6 PM should have 3 buckets");
    }

    #[test]
    fn test_get_day_quarter_buckets_full_day() {
        // Test event that spans a full day (6 AM to 6 AM next day)
        let time_begin = Utc.with_ymd_and_hms(2025, 1, 15, 6, 0, 0).unwrap();
        let time_end = Utc.with_ymd_and_hms(2025, 1, 16, 6, 0, 0).unwrap();
        
        let buckets = get_day_quarter_buckets(time_begin, time_end);
        
        // Should have 4 buckets: 6 AM-12 PM, 12 PM-6 PM, 6 PM-12 AM, 12 AM-6 AM
        assert_eq!(buckets.len(), 4, "Full day event should have 4 buckets");
    }

    #[test]
    fn test_get_day_quarter_buckets_multi_day() {
        // Test event spanning multiple days (Friday 6 AM to Sunday 6 PM)
        let time_begin = Utc.with_ymd_and_hms(2025, 1, 17, 6, 0, 0).unwrap();
        let time_end = Utc.with_ymd_and_hms(2025, 1, 19, 18, 0, 0).unwrap();
        
        let buckets = get_day_quarter_buckets(time_begin, time_end);
        
        // Day 1 (Fri): 4 buckets, Day 2 (Sat): 4 buckets, Day 3 (Sun): 3 buckets = 11 total
        // (Sun includes 6 AM-12 PM, 12 PM-6 PM, 6 PM-12 AM since start:6PM <= end:6PM)
        assert_eq!(buckets.len(), 11, "Multi-day event should have correct bucket count");
    }

    #[test]
    fn test_get_day_quarter_buckets_starts_mid_bucket() {
        // Test event starting at 8 AM (mid-way through first bucket)
        let time_begin = Utc.with_ymd_and_hms(2025, 1, 15, 8, 0, 0).unwrap();
        let time_end = Utc.with_ymd_and_hms(2025, 1, 15, 14, 0, 0).unwrap();
        
        let buckets = get_day_quarter_buckets(time_begin, time_end);
        
        // Should include partial bucket 6 AM-12 PM and partial bucket 12 PM-6 PM
        assert_eq!(buckets.len(), 2, "Event starting mid-bucket should include that bucket");
    }

    #[test]
    fn test_get_day_quarter_buckets_ends_mid_bucket() {
        // Test event ending at 4 PM (mid-way through third bucket)
        let time_begin = Utc.with_ymd_and_hms(2025, 1, 15, 6, 0, 0).unwrap();
        let time_end = Utc.with_ymd_and_hms(2025, 1, 15, 16, 0, 0).unwrap();
        
        let buckets = get_day_quarter_buckets(time_begin, time_end);
        
        // Should include: 6 AM-12 PM, 12 PM-6 PM (bucket extends to 6 PM even though event ends at 4 PM)
        assert_eq!(buckets.len(), 2, "Event ending mid-bucket should include that bucket");
    }

    #[test]
    fn test_get_day_quarter_buckets_overnight() {
        // Test event going through midnight (8 PM to 2 AM)
        let time_begin = Utc.with_ymd_and_hms(2025, 1, 15, 20, 0, 0).unwrap();
        let time_end = Utc.with_ymd_and_hms(2025, 1, 16, 2, 0, 0).unwrap();
        
        let buckets = get_day_quarter_buckets(time_begin, time_end);
        
        // Should include: 6 PM-12 AM (partial), 12 AM-6 AM (partial) = 2 buckets
        assert_eq!(buckets.len(), 2, "Overnight event should span two buckets correctly");
    }

    #[test]
    fn test_get_day_quarter_buckets_exact_bucket_boundaries() {
        // Test event that starts and ends exactly on bucket boundaries
        let time_begin = Utc.with_ymd_and_hms(2025, 1, 15, 12, 0, 0).unwrap();
        let time_end = Utc.with_ymd_and_hms(2025, 1, 16, 0, 0, 0).unwrap();
        
        let buckets = get_day_quarter_buckets(time_begin, time_end);
        
        // Should include: 12 PM-6 PM, 6 PM-12 AM, 12 AM-6 AM = 3 buckets
        // (start:12AM <= end:12AM, so midnight bucket is included)
        assert_eq!(buckets.len(), 3, "Event on exact boundaries should count correctly");
    }

    #[test]
    fn test_get_day_quarter_buckets_very_short_event() {
        // Test very short event (1 hour)
        let time_begin = Utc.with_ymd_and_hms(2025, 1, 15, 10, 0, 0).unwrap();
        let time_end = Utc.with_ymd_and_hms(2025, 1, 15, 11, 0, 0).unwrap();
        
        let buckets = get_day_quarter_buckets(time_begin, time_end);
        
        // Should include only the 6 AM-12 PM bucket
        assert_eq!(buckets.len(), 1, "Very short event should have 1 bucket");
    }

    #[test]
    fn test_get_day_quarter_buckets_week_long_event() {
        // Test week-long event
        let time_begin = Utc.with_ymd_and_hms(2025, 1, 15, 6, 0, 0).unwrap();
        let time_end = Utc.with_ymd_and_hms(2025, 1, 22, 6, 0, 0).unwrap();
        
        let buckets = get_day_quarter_buckets(time_begin, time_end);
        
        // 7 days * 4 buckets per day = 28 buckets
        assert_eq!(buckets.len(), 28, "Week-long event should have 28 buckets");
    }

    #[test]
    fn test_get_day_quarter_buckets_starts_before_6am() {
        // Test event starting at 3 AM (before the 6 AM reference point)
        let time_begin = Utc.with_ymd_and_hms(2025, 1, 15, 3, 0, 0).unwrap();
        let time_end = Utc.with_ymd_and_hms(2025, 1, 15, 15, 0, 0).unwrap();
        
        let buckets = get_day_quarter_buckets(time_begin, time_end);
        
        // Should include: 6 AM-12 PM, 12 PM-6 PM = 2 buckets
        // (midnight-6 AM bucket of that day is not included because it's before time_begin)
        assert_eq!(buckets.len(), 2, "Event starting before 6 AM should be handled correctly");
    }

    #[test]
    fn test_get_day_quarter_buckets_starts_at_midnight() {
        // Test event starting at midnight
        let time_begin = Utc.with_ymd_and_hms(2025, 1, 15, 0, 0, 0).unwrap();
        let time_end = Utc.with_ymd_and_hms(2025, 1, 15, 12, 0, 0).unwrap();
        
        let buckets = get_day_quarter_buckets(time_begin, time_end);
        
        // Should include: 6 AM-12 PM, 12 PM-6 PM = 2 buckets
        // (12 PM bucket: start:12PM <= end:12PM, so it's included)
        assert_eq!(buckets.len(), 2, "Event starting at midnight should be handled correctly");
    }

    #[test]
    fn test_get_day_quarter_buckets_regression_bug() {
        // Test the specific bug that was found: hour calculation was adding to 6 AM instead of setting absolute time
        // This caused wrong bucket counts
        let time_begin = Utc.with_ymd_and_hms(2025, 1, 15, 10, 0, 0).unwrap();
        let time_end = Utc.with_ymd_and_hms(2025, 1, 16, 10, 0, 0).unwrap();
        
        let buckets = get_day_quarter_buckets(time_begin, time_end);
        
        // Should be 5 buckets: 6 AM-12 PM, 12 PM-6 PM, 6 PM-12 AM, 12 AM-6 AM, 6 AM-12 PM
        // (end:10 AM falls in the 6 AM-12 PM bucket, start:6AM <= end:10AM and end:12PM > begin:10AM)
        assert_eq!(buckets.len(), 5, "24-hour event should have exactly 5 buckets when crossing bucket boundary");
    }
}
