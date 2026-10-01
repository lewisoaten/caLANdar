//! Greedy auto-scheduler for an event's voted games.
//!
//! Rules (they mirror the `HyperLAN` handoff, "Recalculate" behaviour):
//! - games are planned in vote order (most votes first);
//! - games owned by fewer than [`MIN_OWNERS`] attendees are skipped;
//! - every game appears on the schedule at most once: a game that already has a
//!   pinned session is not suggested again, and each other game gets at most
//!   [`MAX_SESSIONS_PER_GAME`] suggested session;
//! - sessions keep a [`BUFFER_MINUTES`] gap from every other session (pinned too);
//! - nothing is in progress during the night: a session may end at exactly
//!   [`NIGHT_START_HOUR`]:00 and may start at exactly [`DAY_START_HOUR`]:00
//!   **local wall-clock time** (in [`SchedulerInput::tz`]) but never overlaps
//!   the hours in between. The window is therefore the same wall-clock window
//!   every day (10:00 → 01:00); across a DST change it simply lasts 24 ± 1h.
//!   The frontend draws the same window (`SCHEDULER_DAY_START_HOUR` /
//!   `SCHEDULER_NIGHT_START_HOUR` in `frontend/src/components/schedule/scheduleModel.ts`)
//!   in the browser's zone and sends that zone as `?tz=`, so keep both in sync.
use chrono::{DateTime, Duration, LocalResult, NaiveDate, Offset, TimeZone, Timelike, Utc};
use chrono_tz::Tz;
use std::collections::HashMap;

/// Local hour at which the scheduler's night starts (no session may run past it).
pub const NIGHT_START_HOUR: u32 = 1;
/// Local hour at which the scheduler's day starts again (earliest start after the night).
pub const DAY_START_HOUR: u32 = 10;
/// Zone used when a caller doesn't say which one the window is in.
pub const DEFAULT_TIMEZONE: Tz = chrono_tz::Europe::London;
/// Games owned by fewer attendees than this are not auto-scheduled.
pub const MIN_OWNERS: usize = 2;
/// Most sessions (pinned + suggested) a single game gets. One: a game shows up
/// on the schedule at most once, so a pinned game is never suggested again and
/// no game is suggested twice.
pub const MAX_SESSIONS_PER_GAME: usize = 1;
/// Minimum gap between any two sessions, in minutes.
pub const BUFFER_MINUTES: i64 = 30;
/// Granularity of candidate start times, in minutes (aligned to local :00/:30).
pub const SLOT_STEP_MINUTES: i64 = 30;

/// Represents a game that can be scheduled
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Game {
    pub id: i64,
    pub name: String,
    pub votes: i32,
    /// IDs of voters who voted yes for this game
    pub voter_ids: Vec<String>,
    /// Number of attending (yes/maybe) guests whose Steam library contains the game
    pub owner_count: usize,
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
    /// The game pinned in this slot (counts towards its session limit)
    pub game_id: i64,
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
    /// Zone whose wall clock defines the night (see [`NIGHT_START_HOUR`]).
    pub tz: Tz,
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

/// Main scheduling function - uses a greedy algorithm to maximize voter availability.
///
/// Runs up to [`MAX_SESSIONS_PER_GAME`] rounds; each round walks the eligible games
/// in vote order and gives each one (that is still under its limit, pinned
/// sessions included) the start time where the most of its voters are around.
pub fn schedule_games(input: &SchedulerInput) -> SchedulerOutput {
    let mut suggested_schedules = Vec::new();
    let duration = Duration::minutes(i64::from(input.default_game_duration));

    if input.default_game_duration <= 0 || input.event_end <= input.event_start {
        return SchedulerOutput {
            suggested_schedules,
        };
    }

    // Every session placed so far, as [start, end)
    let mut occupied: Vec<(DateTime<Utc>, DateTime<Utc>)> = input
        .pinned_slots
        .iter()
        .map(|p| {
            (
                p.start_time,
                p.start_time + Duration::minutes(i64::from(p.duration_minutes)),
            )
        })
        .collect();

    // Sessions per game so far (pinned ones count)
    let mut uses: HashMap<i64, usize> = HashMap::new();
    for pinned in &input.pinned_slots {
        *uses.entry(pinned.game_id).or_default() += 1;
    }

    // Sort games by votes (descending, stable) and drop games too few people own
    let mut sorted_games: Vec<&Game> = input
        .games
        .iter()
        .filter(|g| g.owner_count >= MIN_OWNERS)
        .collect();
    sorted_games.sort_by_key(|game| std::cmp::Reverse(game.votes));

    let candidates = build_start_times(input.event_start, input.event_end, input.tz);

    for _round in 0..MAX_SESSIONS_PER_GAME {
        let mut placed_any = false;

        for game in &sorted_games {
            if uses.get(&game.id).copied().unwrap_or(0) >= MAX_SESSIONS_PER_GAME {
                continue;
            }

            let mut best: Option<(DateTime<Utc>, i32)> = None;

            for &start in &candidates {
                let end = start + duration;
                if end > input.event_end || overlaps_night(start, end, input.tz) {
                    continue;
                }
                if clashes(&occupied, start, end) {
                    continue;
                }

                let score = calculate_availability_score(
                    &input.voters,
                    &game.voter_ids,
                    input.event_start,
                    start,
                    input.default_game_duration,
                );

                // Strictly greater: the earliest best slot wins ties
                if best.is_none_or(|(_, best_score)| score > best_score) {
                    best = Some((start, score));
                }
            }

            // Only schedule when at least one voter is around
            if let Some((start_time, score)) = best {
                if score > 0 {
                    occupied.push((start_time, start_time + duration));
                    *uses.entry(game.id).or_default() += 1;
                    placed_any = true;
                    suggested_schedules.push(SuggestedSchedule {
                        game_id: game.id,
                        game_name: game.name.clone(),
                        start_time,
                        duration_minutes: input.default_game_duration,
                        availability_score: score,
                    });
                }
            }
        }

        if !placed_any {
            break;
        }
    }

    suggested_schedules.sort_by_key(|s| s.start_time);

    SchedulerOutput {
        suggested_schedules,
    }
}

/// Candidate start times: the event start, then every [`SLOT_STEP_MINUTES`]
/// on local :00 / :30 boundaries (so 10:00 local is always a candidate, even in
/// zones with a :45 offset).
fn build_start_times(
    event_start: DateTime<Utc>,
    event_end: DateTime<Utc>,
    tz: Tz,
) -> Vec<DateTime<Utc>> {
    let mut slots = vec![event_start];
    let local = event_start.with_timezone(&tz);
    let into_step = Duration::minutes(i64::from(local.minute()) % SLOT_STEP_MINUTES)
        + Duration::seconds(i64::from(local.second()))
        + Duration::nanoseconds(i64::from(local.nanosecond()));
    let mut current = if into_step.is_zero() {
        event_start + Duration::minutes(SLOT_STEP_MINUTES)
    } else {
        event_start - into_step + Duration::minutes(SLOT_STEP_MINUTES)
    };
    while current < event_end {
        slots.push(current);
        current += Duration::minutes(SLOT_STEP_MINUTES);
    }
    slots
}

/// True when [start, end) comes within [`BUFFER_MINUTES`] of any occupied session.
fn clashes(
    occupied: &[(DateTime<Utc>, DateTime<Utc>)],
    start: DateTime<Utc>,
    end: DateTime<Utc>,
) -> bool {
    let buffer = Duration::minutes(BUFFER_MINUTES);
    occupied
        .iter()
        .any(|&(os, oe)| start < oe + buffer && os < end + buffer)
}

/// The instant of `hour`:00 local wall-clock time on `date` in `tz`.
///
/// DST edge cases resolve the same way as JavaScript's `new Date(y, m, d, h)`,
/// which the frontend uses to draw the window, so both always agree:
/// - ambiguous (clocks go back, the hour happens twice): the earlier instant;
/// - non-existent (clocks go forward, the hour is skipped): read with the
///   offset in force before the gap, i.e. it lands just after the jump.
pub fn local_instant(tz: Tz, date: NaiveDate, hour: u32) -> Option<DateTime<Utc>> {
    let naive = date.and_hms_opt(hour, 0, 0)?;
    match tz.from_local_datetime(&naive) {
        LocalResult::Single(t) => Some(t.with_timezone(&Utc)),
        LocalResult::Ambiguous(a, b) => Some(a.min(b).with_timezone(&Utc)),
        LocalResult::None => {
            let before = tz
                .offset_from_utc_datetime(&(naive - Duration::days(1)))
                .fix();
            Some((naive - Duration::seconds(i64::from(before.local_minus_utc()))).and_utc())
        }
    }
}

/// True when [start, end) overlaps any night, i.e. the local hours between
/// [`NIGHT_START_HOUR`]:00 and [`DAY_START_HOUR`]:00 in `tz`.
/// Touching a boundary (ending at 01:00, starting at 10:00) is allowed.
fn overlaps_night(start: DateTime<Utc>, end: DateTime<Utc>, tz: Tz) -> bool {
    let first = start.with_timezone(&tz).date_naive();
    let first = first.pred_opt().unwrap_or(first);
    let last = end.with_timezone(&tz).date_naive();
    for day in first.iter_days().take_while(|d| *d <= last) {
        let (Some(night_start), Some(night_end)) = (
            local_instant(tz, day, NIGHT_START_HOUR),
            local_instant(tz, day, DAY_START_HOUR),
        ) else {
            return true;
        };
        if start < night_end && end > night_start {
            return true;
        }
    }
    false
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
    use chrono::{Datelike, TimeZone, Timelike};

    fn end_of(s: &SuggestedSchedule) -> DateTime<Utc> {
        s.start_time + Duration::minutes(i64::from(s.duration_minutes))
    }

    /// No two sessions overlap or sit closer than the buffer.
    fn assert_buffered(sessions: &[SuggestedSchedule]) {
        let buffer = Duration::minutes(BUFFER_MINUTES);
        for (i, a) in sessions.iter().enumerate() {
            for b in sessions.iter().skip(i + 1) {
                assert!(
                    end_of(a) + buffer <= b.start_time || end_of(b) + buffer <= a.start_time,
                    "{} at {} and {} at {} are closer than the buffer",
                    a.game_name,
                    a.start_time,
                    b.game_name,
                    b.start_time
                );
            }
        }
    }

    fn voter(id: &str, attendance: Vec<u8>) -> (String, Voter) {
        (
            id.to_string(),
            Voter {
                id: id.to_string(),
                attendance,
            },
        )
    }

    fn game(id: i64, votes: i32, voted_by: &[&str], owner_count: usize) -> Game {
        Game {
            id,
            name: format!("Game {id}"),
            votes,
            voter_ids: voted_by.iter().map(ToString::to_string).collect(),
            owner_count,
        }
    }

    #[test]
    #[allow(clippy::similar_names)]
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
            owner_count: 2,
        };

        // Game B: Only Gamer 1 wants it (votes: 1)
        let game_b = Game {
            id: 2,
            name: "Game B".to_string(),
            votes: 1,
            voter_ids: vec!["gamer1".to_string()],
            owner_count: 2,
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
            tz: chrono_tz::UTC,
        };

        let output = schedule_games(&input);

        // Each game is scheduled exactly once (MAX_SESSIONS_PER_GAME)
        assert_eq!(output.suggested_schedules.len(), 2);

        let sessions_a: Vec<_> = output
            .suggested_schedules
            .iter()
            .filter(|s| s.game_id == 1)
            .collect();
        let sessions_b: Vec<_> = output
            .suggested_schedules
            .iter()
            .filter(|s| s.game_id == 2)
            .collect();
        assert_eq!(sessions_a.len(), 1, "Game A should get one session");
        assert_eq!(sessions_b.len(), 1, "Game B should get one session");

        // Game A is scheduled on Day 2 (when both gamers are available)
        for s in &sessions_a {
            assert_eq!(s.start_time.day(), 25, "Game A should be on Day 2 (Nov 25)");
            assert_eq!(s.availability_score, 2, "Game A should have 2 voters");
        }
        // Game B is scheduled on Day 1 (when Gamer 1 is available)
        for s in &sessions_b {
            assert_eq!(s.start_time.day(), 24, "Game B should be on Day 1 (Nov 24)");
            assert_eq!(s.availability_score, 1, "Game B should have 1 voter");
        }

        assert_buffered(&output.suggested_schedules);
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
            owner_count: 2,
        };

        let game_b = Game {
            id: 2,
            name: "Game B".to_string(),
            votes: 2,
            voter_ids: vec!["gamer1".to_string()],
            owner_count: 2,
        };

        let game_c = Game {
            id: 3,
            name: "Game C".to_string(),
            votes: 1,
            voter_ids: vec!["gamer1".to_string()],
            owner_count: 2,
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
            tz: chrono_tz::UTC,
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
                                                                                 // 4.5 hours: two 2h games plus the 30-min buffer between them
        let event_end = Utc.with_ymd_and_hms(2024, 11, 24, 14, 30, 0).unwrap();

        // Game with lowest votes (1 vote) - should NOT be scheduled
        let game_low_priority = Game {
            id: 1,
            name: "Game Low Priority".to_string(),
            votes: 1,
            voter_ids: vec!["gamer1".to_string()],
            owner_count: 2,
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
            owner_count: 2,
        };

        // Game with medium votes (2 votes) - SHOULD be scheduled
        let game_medium_priority = Game {
            id: 3,
            name: "Game Medium Priority".to_string(),
            votes: 2,
            voter_ids: vec!["gamer1".to_string(), "gamer2".to_string()],
            owner_count: 2,
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
            tz: chrono_tz::UTC,
        };

        let output = schedule_games(&input);

        // Should only schedule 2 games (4.5 hours available / 2 hours per game + buffer)
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
            owner_count: 2,
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
            game_id: 99,
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
            tz: chrono_tz::UTC,
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

        // Verify the game keeps the buffer after the pinned slot (starts at or after 11:30)
        let pinned_end = Utc.with_ymd_and_hms(2024, 11, 24, 11, 30, 0).unwrap();
        assert!(
            game_schedule.start_time >= pinned_end,
            "Scheduled game should not overlap with pinned slot + buffer. Expected start >= 11:30, got {}",
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
            owner_count: 2,
        };

        let game_3 = Game {
            id: 3,
            name: "Game 3".to_string(),
            votes: 1,
            voter_ids: vec!["gamer1".to_string()],
            owner_count: 2,
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
            game_id: 99,
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
            tz: chrono_tz::UTC,
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

        // Game 3 cannot follow at 23:00: the 30-min buffer pushes it to 23:30,
        // which would run past 01:00, so it waits for the morning window.
        assert_eq!(
            game_3_schedule.start_time,
            Utc.with_ymd_and_hms(2024, 11, 25, 10, 0, 0).unwrap(),
            "Game 3 should start at 10:00 the next morning"
        );
        let game_3_end = end_of(game_3_schedule);

        // Neither game overlaps the pinned slot (1am-4am)
        let pinned_start = Utc.with_ymd_and_hms(2024, 11, 25, 1, 0, 0).unwrap();
        let pinned_end = Utc.with_ymd_and_hms(2024, 11, 25, 4, 0, 0).unwrap();
        assert!(game_1_end <= pinned_start);
        assert!(game_3_schedule.start_time >= pinned_end);
        assert!(game_3_end <= event_end);
        assert_buffered(&output.suggested_schedules);

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

    fn all_day_voters(ids: &[&str]) -> HashMap<String, Voter> {
        ids.iter().map(|id| voter(id, vec![1; 16])).collect()
    }

    fn input_for(
        games: Vec<Game>,
        voters: HashMap<String, Voter>,
        event_start: DateTime<Utc>,
        event_end: DateTime<Utc>,
        pinned_slots: Vec<OccupiedSlot>,
    ) -> SchedulerInput {
        SchedulerInput {
            games,
            voters,
            event_start,
            event_end,
            pinned_slots,
            default_game_duration: 120,
            tz: chrono_tz::UTC,
        }
    }

    #[test]
    fn test_skips_games_owned_by_fewer_than_two() {
        let start = Utc.with_ymd_and_hms(2024, 11, 24, 10, 0, 0).unwrap();
        let end = Utc.with_ymd_and_hms(2024, 11, 24, 22, 0, 0).unwrap();
        let output = schedule_games(&input_for(
            vec![
                game(1, 5, &["a", "b"], 1), // e.g. AoE II: most votes, only one owner
                game(2, 1, &["a"], 2),
                game(3, 1, &["a"], 0),
            ],
            all_day_voters(&["a", "b"]),
            start,
            end,
            vec![],
        ));
        assert!(!output.suggested_schedules.is_empty());
        assert!(
            output.suggested_schedules.iter().all(|s| s.game_id == 2),
            "only the game owned by 2+ attendees is planned: {:?}",
            output.suggested_schedules
        );
    }

    #[test]
    fn test_each_game_at_most_once_and_pinned_games_not_suggested() {
        // Regression: games used to be suggested twice, and a pinned game could
        // also be suggested. Plenty of room here, so only the rule limits it.
        let start = Utc.with_ymd_and_hms(2024, 11, 24, 10, 0, 0).unwrap();
        let end = Utc.with_ymd_and_hms(2024, 11, 26, 22, 0, 0).unwrap();
        let pinned = OccupiedSlot {
            game_id: 2,
            start_time: Utc.with_ymd_and_hms(2024, 11, 24, 18, 0, 0).unwrap(),
            duration_minutes: 120,
        };
        let output = schedule_games(&input_for(
            vec![
                game(1, 3, &["a", "b"], 2),
                // Most votes, but already pinned
                game(2, 9, &["a", "b"], 2),
                game(3, 1, &["a"], 2),
            ],
            all_day_voters(&["a", "b"]),
            start,
            end,
            vec![pinned],
        ));
        let count = |id| {
            output
                .suggested_schedules
                .iter()
                .filter(|s| s.game_id == id)
                .count()
        };
        assert_eq!(MAX_SESSIONS_PER_GAME, 1);
        assert_eq!(count(1), 1, "unpinned game is suggested once");
        assert_eq!(count(3), 1, "unpinned game is suggested once");
        assert_eq!(count(2), 0, "a pinned game is never suggested again");
        assert_eq!(output.suggested_schedules.len(), 2);
        assert_buffered(&output.suggested_schedules);
        let pinned_end = Utc.with_ymd_and_hms(2024, 11, 24, 20, 0, 0).unwrap();
        for s in &output.suggested_schedules {
            assert!(
                end_of(s) + Duration::minutes(BUFFER_MINUTES)
                    <= Utc.with_ymd_and_hms(2024, 11, 24, 18, 0, 0).unwrap()
                    || s.start_time >= pinned_end + Duration::minutes(BUFFER_MINUTES),
                "{s:?} is within the buffer of the pinned session"
            );
        }
    }

    #[test]
    fn test_game_pinned_twice_is_still_not_suggested() {
        let start = Utc.with_ymd_and_hms(2024, 11, 24, 10, 0, 0).unwrap();
        let end = Utc.with_ymd_and_hms(2024, 11, 25, 22, 0, 0).unwrap();
        let pin = |h| OccupiedSlot {
            game_id: 1,
            start_time: Utc.with_ymd_and_hms(2024, 11, 24, h, 0, 0).unwrap(),
            duration_minutes: 60,
        };
        let output = schedule_games(&input_for(
            vec![game(1, 5, &["a"], 2)],
            all_day_voters(&["a"]),
            start,
            end,
            vec![pin(12), pin(15)],
        ));
        assert!(output.suggested_schedules.is_empty());
    }

    #[test]
    fn test_buffer_between_back_to_back_sessions() {
        let start = Utc.with_ymd_and_hms(2024, 11, 24, 10, 0, 0).unwrap();
        let end = Utc.with_ymd_and_hms(2024, 11, 24, 14, 0, 0).unwrap();
        // 4 hours would fit two 2h games back to back, but not with the buffer
        let output = schedule_games(&input_for(
            vec![game(1, 2, &["a"], 2), game(2, 1, &["a"], 2)],
            all_day_voters(&["a"]),
            start,
            end,
            vec![],
        ));
        assert_eq!(output.suggested_schedules.len(), 1);
        assert_eq!(output.suggested_schedules[0].game_id, 1);
    }

    #[test]
    fn test_never_runs_past_one_am() {
        // Starting at 23:30 would end at 01:30 – not allowed
        let start = Utc.with_ymd_and_hms(2024, 11, 24, 23, 30, 0).unwrap();
        let end = Utc.with_ymd_and_hms(2024, 11, 25, 12, 0, 0).unwrap();
        let output = schedule_games(&input_for(
            vec![game(1, 1, &["a"], 2)],
            all_day_voters(&["a"]),
            start,
            end,
            vec![],
        ));
        assert_eq!(output.suggested_schedules.len(), 1);
        assert_eq!(
            output.suggested_schedules[0].start_time,
            Utc.with_ymd_and_hms(2024, 11, 25, 10, 0, 0).unwrap()
        );
    }

    fn overlaps_night_utc(start: DateTime<Utc>, end: DateTime<Utc>) -> bool {
        overlaps_night(start, end, chrono_tz::UTC)
    }

    #[test]
    fn test_overlaps_night() {
        let at = |d, h, m| Utc.with_ymd_and_hms(2024, 11, d, h, m, 0).unwrap();
        assert!(
            !overlaps_night_utc(at(24, 23, 0), at(25, 1, 0)),
            "ends at 01:00"
        );
        assert!(
            overlaps_night_utc(at(24, 23, 30), at(25, 1, 30)),
            "ends 01:30"
        );
        assert!(
            !overlaps_night_utc(at(25, 10, 0), at(25, 12, 0)),
            "starts 10:00"
        );
        assert!(
            overlaps_night_utc(at(25, 9, 30), at(25, 11, 30)),
            "starts 09:30"
        );
        assert!(
            overlaps_night_utc(at(25, 0, 0), at(25, 12, 0)),
            "spans the night"
        );
        assert!(
            !overlaps_night_utc(at(24, 12, 0), at(24, 23, 0)),
            "afternoon"
        );
    }

    /// Plenty of games, everyone around all weekend: the greedy planner fills
    /// each window from its first minute, so window edges are easy to see.
    fn packed_weekend(tz: Tz, start: DateTime<Utc>, end: DateTime<Utc>) -> SchedulerOutput {
        let games = (1..=16).map(|id| game(id, 1, &["a"], 2)).collect();
        let mut input = input_for(games, all_day_voters(&["a"]), start, end, vec![]);
        input.tz = tz;
        schedule_games(&input)
    }

    /// Local (date, HH:MM) of each session start / end.
    fn local_spans(output: &SchedulerOutput, tz: Tz) -> Vec<(String, String)> {
        output
            .suggested_schedules
            .iter()
            .map(|s| {
                (
                    s.start_time
                        .with_timezone(&tz)
                        .format("%a %H:%M")
                        .to_string(),
                    end_of(s).with_timezone(&tz).format("%a %H:%M").to_string(),
                )
            })
            .collect()
    }

    #[test]
    fn test_local_instant_dst_edges() {
        let london = chrono_tz::Europe::London;
        let d = |m, day| NaiveDate::from_ymd_opt(2026, m, day).expect("valid date");
        // BST (UTC+1) on Saturday 24 Oct 2026
        assert_eq!(
            local_instant(london, d(10, 24), 10),
            Some(Utc.with_ymd_and_hms(2026, 10, 24, 9, 0, 0).unwrap())
        );
        // 01:00 happens twice on Sunday 25 Oct: the earlier (BST) one
        assert_eq!(
            local_instant(london, d(10, 25), 1),
            Some(Utc.with_ymd_and_hms(2026, 10, 25, 0, 0, 0).unwrap())
        );
        // GMT from then on
        assert_eq!(
            local_instant(london, d(10, 25), 10),
            Some(Utc.with_ymd_and_hms(2026, 10, 25, 10, 0, 0).unwrap())
        );
        // 01:00 doesn't exist on Sunday 29 Mar 2026: the moment clocks jump
        assert_eq!(
            local_instant(london, d(3, 29), 1),
            Some(Utc.with_ymd_and_hms(2026, 3, 29, 1, 0, 0).unwrap())
        );
    }

    #[test]
    fn test_window_is_same_local_hours_across_uk_clock_change() {
        // The owner's report: Fri 23 → Sun 25 Oct 2026 spans the UK clock change.
        // The window must read 10:00 → 01:00 local every day, not 11:00 → 02:00
        // BST then 10:00 → 01:00 GMT.
        let london = chrono_tz::Europe::London;
        let start = Utc.with_ymd_and_hms(2026, 10, 23, 17, 0, 0).unwrap(); // Fri 18:00 BST
        let end = Utc.with_ymd_and_hms(2026, 10, 25, 18, 0, 0).unwrap(); // Sun 18:00 GMT
        let output = packed_weekend(london, start, end);
        let spans = local_spans(&output, london);
        let starts: Vec<&str> = spans.iter().map(|(s, _)| s.as_str()).collect();
        assert!(starts.contains(&"Fri 18:00"), "{spans:?}");
        assert!(
            starts.contains(&"Fri 23:00"),
            "Fri runs until 01:00: {spans:?}"
        );
        assert!(
            starts.contains(&"Sat 10:00"),
            "Sat opens at 10:00 BST: {spans:?}"
        );
        assert!(
            starts.contains(&"Sun 10:00"),
            "Sun opens at 10:00 GMT: {spans:?}"
        );
        // Nothing in progress 01:00–10:00 local on either night (hard-coded UTC)
        let nights = [
            (
                Utc.with_ymd_and_hms(2026, 10, 24, 0, 0, 0).unwrap(), // Sat 01:00 BST
                Utc.with_ymd_and_hms(2026, 10, 24, 9, 0, 0).unwrap(), // Sat 10:00 BST
            ),
            (
                Utc.with_ymd_and_hms(2026, 10, 25, 0, 0, 0).unwrap(), // Sun 01:00 BST
                Utc.with_ymd_and_hms(2026, 10, 25, 10, 0, 0).unwrap(), // Sun 10:00 GMT
            ),
        ];
        for s in &output.suggested_schedules {
            for (ns, ne) in nights {
                assert!(
                    !(s.start_time < ne && end_of(s) > ns),
                    "{s:?} runs into the night: {spans:?}"
                );
            }
        }
        // Each local start sits on a :00 / :30 boundary
        assert!(
            starts
                .iter()
                .all(|s| s.ends_with(":00") || s.ends_with(":30")),
            "{spans:?}"
        );
        assert_buffered(&output.suggested_schedules);
    }

    #[test]
    fn test_window_in_non_dst_zone_and_utc() {
        let start = Utc.with_ymd_and_hms(2026, 10, 23, 9, 0, 0).unwrap();
        let end = Utc.with_ymd_and_hms(2026, 10, 25, 12, 0, 0).unwrap();

        // Tokyo (UTC+9, no DST): opens at 10:00 JST = 01:00Z
        let tokyo = chrono_tz::Asia::Tokyo;
        let output = packed_weekend(tokyo, start, end);
        let spans = local_spans(&output, tokyo);
        assert!(spans.iter().any(|(s, _)| s == "Sat 10:00"), "{spans:?}");
        assert!(output
            .suggested_schedules
            .iter()
            .any(|s| s.start_time == Utc.with_ymd_and_hms(2026, 10, 24, 1, 0, 0).unwrap()));
        for (s, e) in &spans {
            let (sh, eh) = (&s[4..], &e[4..]);
            assert!(!("01:00".."10:00").contains(&sh), "{s} starts at night");
            assert!(
                eh == "01:00" || !("01:00".."10:00").contains(&eh),
                "{e} ends at night"
            );
        }

        // UTC: opens at 10:00Z
        let output = packed_weekend(chrono_tz::UTC, start, end);
        assert!(output
            .suggested_schedules
            .iter()
            .any(|s| s.start_time == Utc.with_ymd_and_hms(2026, 10, 24, 10, 0, 0).unwrap()));
        assert!(output.suggested_schedules.iter().all(|s| !overlaps_night(
            s.start_time,
            end_of(s),
            chrono_tz::UTC
        )));

        // Kathmandu (UTC+5:45): candidates still land on local 10:00
        let kathmandu = chrono_tz::Asia::Kathmandu;
        let output = packed_weekend(kathmandu, start, end);
        let spans = local_spans(&output, kathmandu);
        assert!(spans.iter().any(|(s, _)| s == "Sat 10:00"), "{spans:?}");
    }
}
