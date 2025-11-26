use chrono::{DateTime, Duration, Timelike, Utc};
use std::collections::HashMap;

/// Represents a game that can be scheduled
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Game {
    pub id: i64,
    pub name: String,
    pub votes: i32,
    /// IDs of voters who voted yes for this game
    pub voter_ids: Vec<String>,
}

/// Represents a voter and their availability
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Voter {
    pub id: String,
    /// Attendance array: each element represents a 6-hour bucket (0 = not available, 1 = available)
    /// Buckets start at 6am on the event start date
    pub attendance: Vec<u8>,
}

/// Represents a time slot that is already occupied (pinned games)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OccupiedSlot {
    pub start_time: DateTime<Utc>,
    pub duration_minutes: i32,
}

/// Input to the scheduling algorithm
#[derive(Debug, Clone)]
pub struct SchedulerInput {
    /// All games to potentially schedule (will be sorted by votes internally)
    pub games: Vec<Game>,
    /// All voters with their availability data
    pub voters: HashMap<String, Voter>,
    /// Event start time
    pub event_start: DateTime<Utc>,
    /// Event end time
    pub event_end: DateTime<Utc>,
    /// Already scheduled (pinned) games that we cannot overlap with
    pub pinned_slots: Vec<OccupiedSlot>,
    /// Default duration for each game in minutes
    pub default_game_duration: i32,
}

/// A suggested game schedule
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SuggestedSchedule {
    pub game_id: i64,
    pub game_name: String,
    pub start_time: DateTime<Utc>,
    pub duration_minutes: i32,
    /// Number of voters who are available during this time
    pub availability_score: i32,
}

/// Output from the scheduling algorithm
#[derive(Debug, Clone)]
pub struct SchedulerOutput {
    pub suggested_schedules: Vec<SuggestedSchedule>,
}

/// Main scheduling function - uses a greedy algorithm to maximize voter availability
pub fn schedule_games(input: &SchedulerInput) -> SchedulerOutput {
    let mut suggested_schedules = Vec::new();
    let mut occupied_slots: HashMap<DateTime<Utc>, i32> = HashMap::new();

    // Add pinned slots to occupied slots
    for pinned in &input.pinned_slots {
        occupied_slots.insert(pinned.start_time, pinned.duration_minutes);
    }

    // Build available time slots (30-minute intervals)
    let available_slots = build_time_slots(
        input.event_start,
        input.event_end,
        &input.pinned_slots,
        30, // 30-minute slots
    );

    if available_slots.is_empty() {
        return SchedulerOutput {
            suggested_schedules,
        };
    }

    // Sort games by votes (descending) to prioritize higher-voted games
    let mut sorted_games = input.games.clone();
    sorted_games.sort_by(|a, b| b.votes.cmp(&a.votes));

    // For each game (sorted by votes), find the best time slot
    for game in &sorted_games {
        let mut best_slot: Option<(DateTime<Utc>, i32)> = None;
        let mut best_score = -1;

        // Try each slot as a potential start time
        for slot_start in &available_slots {
            // Skip if game would start during nighttime (after 1am and before 10am)
            // Starting at exactly 1am is invalid, but starting at exactly 10am is valid
            let start_hour = slot_start.hour();
            if (1..10).contains(&start_hour) {
                continue;
            }

            // Check if game fits within event
            let candidate_end =
                *slot_start + Duration::minutes(i64::from(input.default_game_duration));
            if candidate_end > input.event_end {
                continue;
            }

            // Skip if game would end during nighttime (after 1am and before 10am)
            // Ending at exactly 1am is VALID (we allow it), but ending after 1am (1:01am-9:59am) is invalid
            // So we check if hour is in range 2..10 (hours 2am through 9am)
            let end_hour = candidate_end.hour();
            if (2..10).contains(&end_hour) {
                continue;
            }

            // Check if this time range overlaps with already-suggested games
            if overlaps_with_any(&occupied_slots, *slot_start, input.default_game_duration) {
                continue;
            }

            // Calculate availability score for this slot
            let score = calculate_availability_score(
                &input.voters,
                &game.voter_ids,
                input.event_start,
                *slot_start,
                input.default_game_duration,
            );

            if score > best_score {
                best_score = score;
                best_slot = Some((*slot_start, input.default_game_duration));
            }
        }

        // If we found a good slot with at least one voter available, add this game
        if let Some((start_time, duration)) = best_slot {
            if best_score > 0 {
                occupied_slots.insert(start_time, duration);
                suggested_schedules.push(SuggestedSchedule {
                    game_id: game.id,
                    game_name: game.name.clone(),
                    start_time,
                    duration_minutes: duration,
                    availability_score: best_score,
                });
            }
        }
    }

    SchedulerOutput {
        suggested_schedules,
    }
}

/// Build a list of potential start times (30-minute intervals)
fn build_time_slots(
    event_start: DateTime<Utc>,
    event_end: DateTime<Utc>,
    pinned_slots: &[OccupiedSlot],
    slot_duration_minutes: i64,
) -> Vec<DateTime<Utc>> {
    let mut slots = Vec::new();
    let mut current = event_start;

    while current < event_end {
        let next = current + Duration::minutes(slot_duration_minutes);
        let slot_end = next.min(event_end);

        // Check if this slot overlaps with any pinned game
        let overlaps = pinned_slots.iter().any(|pinned| {
            let pinned_end =
                pinned.start_time + Duration::minutes(i64::from(pinned.duration_minutes));
            // Overlap if slot starts before pinned ends AND slot ends after pinned starts
            current < pinned_end && slot_end > pinned.start_time
        });

        if !overlaps {
            slots.push(current);
        }

        current = next;
    }

    slots
}

/// Check if a time range overlaps with any already-occupied slot
fn overlaps_with_any(
    occupied: &HashMap<DateTime<Utc>, i32>,
    start_time: DateTime<Utc>,
    duration_minutes: i32,
) -> bool {
    let end_time = start_time + Duration::minutes(i64::from(duration_minutes));

    occupied.iter().any(|(occupied_start, occupied_duration)| {
        let occupied_end = *occupied_start + Duration::minutes(i64::from(*occupied_duration));
        // Overlap check
        start_time < occupied_end && end_time > *occupied_start
    })
}

/// Calculate how many voters are available during a time slot
fn calculate_availability_score(
    voters: &HashMap<String, Voter>,
    voter_ids: &[String],
    event_start: DateTime<Utc>,
    slot_start: DateTime<Utc>,
    slot_duration_minutes: i32,
) -> i32 {
    // Calculate which bucket indices this slot covers
    // Attendance buckets are 6-hour blocks starting at 6am on event start date
    const BUCKET_DURATION_MINUTES: i64 = 360; // 6 hours

    // Find midnight on the event start date
    let event_date = event_start.date_naive();
    let first_midnight = event_date
        .and_hms_opt(0, 0, 0)
        .expect("Valid time")
        .and_utc();

    // Calculate bucket indices
    let minutes_from_midnight = (slot_start - first_midnight).num_minutes();
    let adjusted_minutes = minutes_from_midnight - 360; // Buckets start at 6am (360 minutes after midnight)

    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    let start_bucket = if adjusted_minutes >= 0 {
        (adjusted_minutes / BUCKET_DURATION_MINUTES) as usize
    } else {
        0
    };

    let slot_end_minutes = minutes_from_midnight + i64::from(slot_duration_minutes);
    let adjusted_end_minutes = slot_end_minutes - 360;
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    let end_bucket = if adjusted_end_minutes >= 0 {
        ((adjusted_end_minutes + BUCKET_DURATION_MINUTES - 1) / BUCKET_DURATION_MINUTES) as usize
    } else {
        0
    };

    // Calculate the first valid bucket (offset for attendance array)
    let event_start_minutes_from_midnight = (event_start - first_midnight).num_minutes();
    let event_start_adjusted = event_start_minutes_from_midnight - 360;
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    let first_valid_bucket = if event_start_adjusted >= 0 {
        (event_start_adjusted / BUCKET_DURATION_MINUTES) as usize
    } else {
        0
    };

    // Count how many voters are available for the entire slot
    let mut available_count = 0;

    for voter_id in voter_ids {
        if let Some(voter) = voters.get(voter_id) {
            let mut available_for_slot = true;

            for bucket_index in start_bucket..end_bucket {
                let attendance_array_index = bucket_index.saturating_sub(first_valid_bucket);

                if attendance_array_index >= voter.attendance.len() {
                    available_for_slot = false;
                    break;
                }

                if voter.attendance[attendance_array_index] != 1 {
                    available_for_slot = false;
                    break;
                }
            }

            if available_for_slot {
                available_count += 1;
            }
        }
    }

    available_count
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Datelike, TimeZone};

    #[test]
    fn test_two_gamers_different_availability() {
        // Test case: 2 gamers, one available for 2 days, other only available on second day
        // Both want Game A, only Gamer 1 wants Game B
        // Expected: Game A scheduled on Day 2 (when both available)
        //          Game B scheduled on Day 1 (when Gamer 1 available)

        let event_start = Utc.with_ymd_and_hms(2024, 11, 24, 10, 0, 0).unwrap();
        let event_end = Utc.with_ymd_and_hms(2024, 11, 26, 22, 0, 0).unwrap();

        // Game A: Both gamers want it (votes: 2)
        let game_a = Game {
            id: 1,
            name: "Game A".to_string(),
            votes: 2,
            voter_ids: vec!["gamer1".to_string(), "gamer2".to_string()],
        };

        // Game B: Only Gamer 1 wants it (votes: 1)
        let game_b = Game {
            id: 2,
            name: "Game B".to_string(),
            votes: 1,
            voter_ids: vec!["gamer1".to_string()],
        };

        // Gamer 1: Available both days (Day 1: 10am-10pm, Day 2: 10am-10pm)
        // Attendance buckets: 6am-12pm, 12pm-6pm, 6pm-12am, 12am-6am (repeating)
        // Day 1 (Nov 24): buckets 0-3, Day 2 (Nov 25): buckets 4-7
        // Available: 10am-10pm = buckets 0 (partial), 1, 2 (partial) on both days
        let gamer1 = Voter {
            id: "gamer1".to_string(),
            attendance: vec![
                1, 1, 1, 0, // Day 1: available 6am-12am (0-2), not available 12am-6am (3)
                1, 1, 1, 0, // Day 2: available 6am-12am (4-6), not available 12am-6am (7)
            ],
        };

        // Gamer 2: Only available Day 2 (Nov 25, 10am-10pm)
        let gamer2 = Voter {
            id: "gamer2".to_string(),
            attendance: vec![
                0, 0, 0, 0, // Day 1: not available
                1, 1, 1, 0, // Day 2: available 6am-12am (4-6), not available 12am-6am (7)
            ],
        };

        let mut voters = HashMap::new();
        voters.insert("gamer1".to_string(), gamer1);
        voters.insert("gamer2".to_string(), gamer2);

        let input = SchedulerInput {
            games: vec![game_a, game_b], // Sorted by votes descending
            voters,
            event_start,
            event_end,
            pinned_slots: vec![],
            default_game_duration: 120, // 2 hours
        };

        let output = schedule_games(&input);

        // We should get both games scheduled
        assert_eq!(output.suggested_schedules.len(), 2);

        // Game A (higher votes) should be scheduled first
        let schedule_a = output
            .suggested_schedules
            .iter()
            .find(|s| s.game_id == 1)
            .expect("Game A should be scheduled");

        // Game A should be scheduled on Day 2 (when both gamers available)
        assert!(
            schedule_a.start_time.day() == 25,
            "Game A should be on Day 2 (Nov 25)"
        );
        assert_eq!(
            schedule_a.availability_score, 2,
            "Game A should have 2 voters available"
        );

        // Game B should be scheduled
        let schedule_b = output
            .suggested_schedules
            .iter()
            .find(|s| s.game_id == 2)
            .expect("Game B should be scheduled");

        // Game B should be scheduled on Day 1 (when Gamer 1 available)
        assert!(
            schedule_b.start_time.day() == 24,
            "Game B should be on Day 1 (Nov 24)"
        );
        assert_eq!(
            schedule_b.availability_score, 1,
            "Game B should have 1 voter available"
        );

        // Games should not overlap
        let end_time_a =
            schedule_a.start_time + Duration::minutes(i64::from(schedule_a.duration_minutes));
        let end_time_b =
            schedule_b.start_time + Duration::minutes(i64::from(schedule_b.duration_minutes));

        let no_overlap =
            (schedule_a.start_time >= end_time_b) || (schedule_b.start_time >= end_time_a);

        assert!(no_overlap, "Games should not overlap");
    }

    #[test]
    fn test_no_scheduling_during_nighttime() {
        // Test case: Ensure games are not in progress between 1am and 10am
        // Event runs from 10pm to midday next day (spanning overnight)
        // Gamer is available the entire time, but games should not be in progress during 1am-10am
        // Valid: game ending at exactly 1am, or game starting at exactly 10am
        // Invalid: game ending after 1am (1:01am-9:59am), or game starting before 10am (1am-9:59am)

        let event_start = Utc.with_ymd_and_hms(2024, 11, 24, 22, 0, 0).unwrap(); // 10pm
        let event_end = Utc.with_ymd_and_hms(2024, 11, 25, 12, 0, 0).unwrap(); // Midday next day

        // Three games to schedule
        let game_a = Game {
            id: 1,
            name: "Game A".to_string(),
            votes: 3,
            voter_ids: vec!["gamer1".to_string()],
        };

        let game_b = Game {
            id: 2,
            name: "Game B".to_string(),
            votes: 2,
            voter_ids: vec!["gamer1".to_string()],
        };

        let game_c = Game {
            id: 3,
            name: "Game C".to_string(),
            votes: 1,
            voter_ids: vec!["gamer1".to_string()],
        };

        // Gamer available 24/7 across the overnight period
        // Buckets: 6am-12pm, 12pm-6pm, 6pm-12am, 12am-6am
        // Event starts at 10pm (bucket 2 on day 1) and ends at noon (bucket 1 on day 2)
        let gamer1 = Voter {
            id: "gamer1".to_string(),
            attendance: vec![
                1, 1, 1, 1, // Day 1: all buckets available
                1, 1, 1, 1, // Day 2: all buckets available
            ],
        };

        let mut voters = HashMap::new();
        voters.insert("gamer1".to_string(), gamer1);

        let input = SchedulerInput {
            games: vec![game_a, game_b, game_c], // Three games to schedule
            voters,
            event_start,
            event_end,
            pinned_slots: vec![],
            default_game_duration: 120, // 2 hours
        };

        let output = schedule_games(&input);

        // Should have scheduled some games (may not be all 3 due to nighttime restriction)
        assert!(
            !output.suggested_schedules.is_empty(),
            "Should schedule at least one game"
        );

        // Verify NO games start between 1am and 10am (exclusive)
        for schedule in &output.suggested_schedules {
            let start_hour = schedule.start_time.hour();
            assert!(
                !(1..10).contains(&start_hour),
                "Game '{}' starts at hour {} which is during nighttime (1am-9:59am). Start time: {}",
                schedule.game_name,
                start_hour,
                schedule.start_time
            );

            // Verify NO games end between 2am and 10am (games CAN end at exactly 1am)
            let end_time =
                schedule.start_time + Duration::minutes(i64::from(schedule.duration_minutes));
            let end_hour = end_time.hour();

            assert!(
                !(2..10).contains(&end_hour),
                "Game '{}' ends at hour {} which is during nighttime (2am-9:59am). End time: {}. Games may end at exactly 1am.",
                schedule.game_name,
                end_hour,
                end_time
            );
        }

        // With event from 10pm-12pm (14 hours) and 8 hours blocked (2am-10am),
        // we have roughly 6 hours available: 10pm-1am (3h) + 10am-12pm (2h) + 1am buffer
        // That's enough for 3 games of 2 hours each
        assert!(
            output.suggested_schedules.len() >= 2,
            "Should schedule at least 2 games. Scheduled: {}",
            output.suggested_schedules.len()
        );

        // Verify games are scheduled in the valid time windows
        for schedule in &output.suggested_schedules {
            let hour = schedule.start_time.hour();
            let is_valid_time = hour >= 22 || hour == 0 || hour >= 10;
            assert!(
                is_valid_time,
                "Game '{}' should be scheduled in valid windows (10pm-1am or 10am-12pm), but was scheduled at hour {}",
                schedule.game_name,
                hour
            );
        }
    }

    #[test]
    fn test_game_prioritization_by_votes() {
        // Test case: Limited time means not all games can be scheduled
        // Games should be prioritized by vote count
        // Event is 4 hours long, each game is 2 hours, so only 2 games can fit
        // Game 1: 1 vote (should NOT be scheduled - loses priority)
        // Game 2: 3 votes (should be scheduled - highest priority)
        // Game 3: 2 votes (should be scheduled - second priority)

        let event_start = Utc.with_ymd_and_hms(2024, 11, 24, 10, 0, 0).unwrap(); // 10am
        let event_end = Utc.with_ymd_and_hms(2024, 11, 24, 14, 0, 0).unwrap(); // 2pm (4 hours)

        // Game with lowest votes (1 vote) - should NOT be scheduled
        let game_low_priority = Game {
            id: 1,
            name: "Game Low Priority".to_string(),
            votes: 1,
            voter_ids: vec!["gamer1".to_string()],
        };

        // Game with highest votes (3 votes) - SHOULD be scheduled
        let game_high_priority = Game {
            id: 2,
            name: "Game High Priority".to_string(),
            votes: 3,
            voter_ids: vec![
                "gamer1".to_string(),
                "gamer2".to_string(),
                "gamer3".to_string(),
            ],
        };

        // Game with medium votes (2 votes) - SHOULD be scheduled
        let game_medium_priority = Game {
            id: 3,
            name: "Game Medium Priority".to_string(),
            votes: 2,
            voter_ids: vec!["gamer1".to_string(), "gamer2".to_string()],
        };

        // All gamers available the entire time
        let gamer1 = Voter {
            id: "gamer1".to_string(),
            attendance: vec![1, 1], // Available for buckets covering 10am-2pm
        };

        let gamer2 = Voter {
            id: "gamer2".to_string(),
            attendance: vec![1, 1],
        };

        let gamer3 = Voter {
            id: "gamer3".to_string(),
            attendance: vec![1, 1],
        };

        let mut voters = HashMap::new();
        voters.insert("gamer1".to_string(), gamer1);
        voters.insert("gamer2".to_string(), gamer2);
        voters.insert("gamer3".to_string(), gamer3);

        let input = SchedulerInput {
            games: vec![game_low_priority, game_high_priority, game_medium_priority],
            voters,
            event_start,
            event_end,
            pinned_slots: vec![],
            default_game_duration: 120, // 2 hours per game
        };

        let output = schedule_games(&input);

        // Should only schedule 2 games (4 hours available / 2 hours per game)
        assert_eq!(
            output.suggested_schedules.len(),
            2,
            "Should schedule exactly 2 games due to time constraint"
        );

        // Verify the high priority game (3 votes) was scheduled
        let high_priority_scheduled = output.suggested_schedules.iter().any(|s| s.game_id == 2);
        assert!(
            high_priority_scheduled,
            "Game with 3 votes should be scheduled"
        );

        // Verify the medium priority game (2 votes) was scheduled
        let medium_priority_scheduled = output.suggested_schedules.iter().any(|s| s.game_id == 3);
        assert!(
            medium_priority_scheduled,
            "Game with 2 votes should be scheduled"
        );

        // Verify the low priority game (1 vote) was NOT scheduled
        let low_priority_scheduled = output.suggested_schedules.iter().any(|s| s.game_id == 1);
        assert!(
            !low_priority_scheduled,
            "Game with only 1 vote should NOT be scheduled when time is limited"
        );

        // Verify the scheduled games don't overlap
        if output.suggested_schedules.len() == 2 {
            let first_game = &output.suggested_schedules[0];
            let second_game = &output.suggested_schedules[1];

            let first_end =
                first_game.start_time + Duration::minutes(i64::from(first_game.duration_minutes));
            let second_end =
                second_game.start_time + Duration::minutes(i64::from(second_game.duration_minutes));

            let no_overlap =
                (first_game.start_time >= second_end) || (second_game.start_time >= first_end);
            assert!(no_overlap, "Scheduled games should not overlap");
        }
    }

    #[test]
    fn test_pinned_slots_block_scheduling() {
        // Test case: Pinned slots should block time and prevent scheduling in those times
        // This matches how the controller uses the scheduler:
        // - Pinned games are filtered OUT of the games list before calling the scheduler
        // - Pinned games' time slots are passed in via pinned_slots to block those times
        //
        // Event is 5 hours long (10am-3pm)
        // Pinned slot: 10am-11am (1 hour) - blocks this time from being used
        // Game 1: 2 votes - should be automatically scheduled in remaining 4 hours (after 11am)

        let event_start = Utc.with_ymd_and_hms(2024, 11, 24, 10, 0, 0).unwrap(); // 10am
        let event_end = Utc.with_ymd_and_hms(2024, 11, 24, 15, 0, 0).unwrap(); // 3pm (5 hours)

        // Only unpinned games are passed to the scheduler
        // The pinned game is NOT in this list (controller filters it out)
        let game_to_schedule = Game {
            id: 2,
            name: "Game To Schedule".to_string(),
            votes: 2,
            voter_ids: vec!["gamer1".to_string(), "gamer2".to_string()],
        };

        // Gamers available the entire time
        let gamer1 = Voter {
            id: "gamer1".to_string(),
            attendance: vec![1, 1], // Available for buckets covering 10am-3pm
        };

        let gamer2 = Voter {
            id: "gamer2".to_string(),
            attendance: vec![1, 1],
        };

        let mut voters = HashMap::new();
        voters.insert("gamer1".to_string(), gamer1);
        voters.insert("gamer2".to_string(), gamer2);

        // Pinned slot: Some game (not in games list) occupies 10am-11am
        let pinned_slot = OccupiedSlot {
            start_time: Utc.with_ymd_and_hms(2024, 11, 24, 10, 0, 0).unwrap(),
            duration_minutes: 60, // 1 hour
        };

        let input = SchedulerInput {
            games: vec![game_to_schedule], // Only unpinned games
            voters,
            event_start,
            event_end,
            pinned_slots: vec![pinned_slot], // Pinned slot blocks 10am-11am
            default_game_duration: 120,      // 2 hours per game
        };

        let output = schedule_games(&input);

        // Should schedule exactly 1 game
        assert_eq!(
            output.suggested_schedules.len(),
            1,
            "Should schedule exactly 1 game"
        );

        // Verify that the game was scheduled
        let game_schedule = output
            .suggested_schedules
            .iter()
            .find(|s| s.game_id == 2)
            .expect("Game 2 should be scheduled");

        // Verify the game doesn't overlap with the pinned slot (starts at or after 11am)
        let pinned_end = Utc.with_ymd_and_hms(2024, 11, 24, 11, 0, 0).unwrap();
        assert!(
            game_schedule.start_time >= pinned_end,
            "Scheduled game should not overlap with pinned slot. Expected start >= 11:00, got {}",
            game_schedule.start_time
        );

        // Verify the game fits within the event
        let game_end =
            game_schedule.start_time + Duration::minutes(i64::from(game_schedule.duration_minutes));
        assert!(
            game_end <= event_end,
            "Scheduled game should fit within event boundaries"
        );
    }

    #[test]
    #[allow(clippy::too_many_lines, clippy::similar_names)]
    fn test_overnight_event_with_pinned_slot() {
        // Test case: Reproduce specific scenario with overnight event
        // Event: 9pm (21:00) to 1pm (13:00) next day - 16 hours total
        // 1 gamer available throughout
        // Game 1: Has vote, should be scheduled 9pm-11pm (2 hours)
        // Game 2: NO vote, pinned from 1am-4am (3 hours) - not passed to scheduler
        // Game 3: Has vote, should be scheduled 10am-12pm (2 hours)
        //
        // Expected behavior:
        // - Game 1 scheduled: 9pm-11pm
        // - Game 3 scheduled: 10am-12pm
        // - Pinned slot blocks 1am-4am from being used

        let event_start = Utc.with_ymd_and_hms(2024, 11, 24, 21, 0, 0).unwrap(); // 9pm
        let event_end = Utc.with_ymd_and_hms(2024, 11, 25, 13, 0, 0).unwrap(); // 1pm next day

        // Only games with votes are passed to scheduler (Game 1 and Game 3)
        // Game 2 is pinned and NOT in this list
        let game_1 = Game {
            id: 1,
            name: "Game 1".to_string(),
            votes: 1,
            voter_ids: vec!["gamer1".to_string()],
        };

        let game_3 = Game {
            id: 3,
            name: "Game 3".to_string(),
            votes: 1,
            voter_ids: vec!["gamer1".to_string()],
        };

        // Gamer available 24/7
        // Buckets cover the overnight period (6am-12pm, 12pm-6pm, 6pm-12am, 12am-6am)
        let voter1 = Voter {
            id: "gamer1".to_string(),
            attendance: vec![
                1, 1, 1, 1, // Day 1: all buckets available
                1, 1, 1, 1, // Day 2: all buckets available
            ],
        };

        let mut voters = HashMap::new();
        voters.insert("gamer1".to_string(), voter1);

        // Pinned slot: Game 2 (without vote) occupies 1am-4am
        let pinned_slot = OccupiedSlot {
            start_time: Utc.with_ymd_and_hms(2024, 11, 25, 1, 0, 0).unwrap(), // 1am
            duration_minutes: 180,                                            // 3 hours
        };

        let input = SchedulerInput {
            games: vec![game_1, game_3], // Only games with votes
            voters,
            event_start,
            event_end,
            pinned_slots: vec![pinned_slot], // Pinned slot blocks 1am-4am
            default_game_duration: 120,      // 2 hours per game
        };

        let output = schedule_games(&input);

        // Should schedule exactly 2 games (Game 1 and Game 3)
        assert_eq!(
            output.suggested_schedules.len(),
            2,
            "Should schedule exactly 2 games (Game 1 and Game 3)"
        );

        // Find Game 1 in the schedule
        let game_1_schedule = output
            .suggested_schedules
            .iter()
            .find(|s| s.game_id == 1)
            .expect("Game 1 should be scheduled");

        // Find Game 3 in the schedule
        let game_3_schedule = output
            .suggested_schedules
            .iter()
            .find(|s| s.game_id == 3)
            .expect("Game 3 should be scheduled");

        // Verify Game 1 is scheduled at 9pm
        assert_eq!(
            game_1_schedule.start_time.hour(),
            21,
            "Game 1 should start at 9pm (21:00)"
        );
        assert_eq!(
            game_1_schedule.duration_minutes, 120,
            "Game 1 should be 2 hours long"
        );

        // Calculate Game 1 end time (should be 11pm)
        let game_1_end = game_1_schedule.start_time
            + Duration::minutes(i64::from(game_1_schedule.duration_minutes));
        assert_eq!(game_1_end.hour(), 23, "Game 1 should end at 11pm (23:00)");

        // Verify Game 3 is scheduled at 11pm (NOT 10am)
        // There's a 2-hour gap from 11pm-1am that should be used
        assert_eq!(
            game_3_schedule.start_time.hour(),
            23,
            "Game 3 should start at 11pm (23:00), not wait until 10am"
        );
        assert_eq!(
            game_3_schedule.start_time.day(),
            24,
            "Game 3 should be on the same day as Game 1 (Nov 24)"
        );
        assert_eq!(
            game_3_schedule.duration_minutes, 120,
            "Game 3 should be 2 hours long"
        );

        // Calculate Game 3 end time (should be 1am)
        let game_3_end = game_3_schedule.start_time
            + Duration::minutes(i64::from(game_3_schedule.duration_minutes));
        assert_eq!(
            game_3_end.hour(),
            1,
            "Game 3 should end at 1am (01:00), which is valid (exactly 1am is allowed)"
        );

        // Verify neither game overlaps with the pinned slot (1am-4am)
        let pinned_start = Utc.with_ymd_and_hms(2024, 11, 25, 1, 0, 0).unwrap();
        let pinned_end = Utc.with_ymd_and_hms(2024, 11, 25, 4, 0, 0).unwrap();

        // Game 1 should end before or at pinned slot start (11pm ends, much earlier than 1am)
        assert!(
            game_1_end <= pinned_start,
            "Game 1 should not overlap with pinned slot. Game 1 ends at {game_1_end}, pinned starts at {pinned_start}"
        );

        // Game 3 should end at or before pinned slot starts (ends exactly at 1am, pinned starts at 1am)
        // This is valid - they touch but don't overlap
        assert!(
            game_3_end <= pinned_start,
            "Game 3 should not overlap with pinned slot. Game 3 ends at {game_3_end}, pinned starts at {pinned_start}"
        );

        // Verify both games respect the nighttime restriction (not in progress 1am-10am)
        // Game 1: 9pm-11pm - OK (ends before 1am)
        assert!(
            !(1..10).contains(&game_1_schedule.start_time.hour()),
            "Game 1 should not start during nighttime"
        );
        assert!(
            !(2..10).contains(&game_1_end.hour()),
            "Game 1 should not end during nighttime (2am-9:59am). Ending at 1am is allowed."
        );

        // Game 3: 11pm-1am - OK (starts before 1am, ends at exactly 1am which is allowed)
        assert!(
            !(1..10).contains(&game_3_schedule.start_time.hour()),
            "Game 3 should not start during nighttime"
        );
        assert!(
            !(2..10).contains(&game_3_end.hour()),
            "Game 3 should not end during nighttime (2am-9:59am). Ending at exactly 1am is allowed."
        );

        println!(
            "Game 1 scheduled: {} to {}",
            game_1_schedule.start_time, game_1_end
        );
        println!("Pinned slot: {pinned_start} to {pinned_end}");
        println!(
            "Game 3 scheduled: {} to {}",
            game_3_schedule.start_time, game_3_end
        );
    }
}
