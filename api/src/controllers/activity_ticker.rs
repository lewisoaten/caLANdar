use chrono::{DateTime, Utc};
use sqlx::PgPool;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

use crate::repositories::activity_ticker;

#[derive(Debug, Clone)]
pub struct ActivityTickerEvent {
    pub id: i64,
    pub timestamp: DateTime<Utc>,
    pub message: String,
    pub icon: String,
    pub event_type: String,
    pub user_handle: Option<String>,
    pub user_avatar_url: Option<String>,
}

#[derive(Debug)]
pub enum Error {
    Database(String),
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Database(msg) => write!(f, "Database error: {msg}"),
        }
    }
}

/// Get a consistent phrase from a list based on a hash of the event ID
fn get_phrase<'a, T: Hash>(phrases: &'a [&str], seed: &T) -> &'a str {
    let mut hasher = DefaultHasher::new();
    seed.hash(&mut hasher);
    let hash = hasher.finish();
    let index = (hash as usize) % phrases.len();
    phrases[index]
}

/// Get formatted activity ticker events for an event
pub async fn get_ticker_events(
    pool: &PgPool,
    event_id: i32,
) -> Result<Vec<ActivityTickerEvent>, Error> {
    let events = activity_ticker::get_ticker_events(pool, event_id, 20)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

    let mut ticker_events = Vec::new();

    for event in &events {
        if let Some(formatted) = format_ticker_event(event) {
            ticker_events.push(formatted);
        }
    }

    Ok(ticker_events)
}

/// Format a raw audit log event into a user-friendly ticker event
fn format_ticker_event(event: &activity_ticker::TickerEvent) -> Option<ActivityTickerEvent> {
    match event.action.as_str() {
        "rsvp.update" => format_rsvp_event(event),
        "game_suggestion.create" => format_game_suggestion_event(event),
        "game_vote.update" => format_game_vote_event(event),
        "seat_reservation.create" => format_seat_reservation_event(event),
        _ => None,
    }
}

fn format_rsvp_event(event: &activity_ticker::TickerEvent) -> Option<ActivityTickerEvent> {
    let metadata = event.metadata.as_ref()?;
    let response = metadata.get("response")?.as_str()?;

    // Skip "No" responses - we only want positive activity
    if response == "No" {
        return None;
    }

    // Use handle from database join, or from metadata as fallback
    let user_handle = event.user_handle.clone().or_else(|| {
        metadata
            .get("handle")
            .and_then(|v| v.as_str())
            .map(String::from)
    });

    // Generate avatar URL only if we have user_id (email)
    let user_avatar_url = event.user_id.as_ref().map(|email| {
        let digest = md5::compute(email.to_lowercase().as_bytes());
        format!("https://www.gravatar.com/avatar/{digest:x}?d=robohash")
    });

    let icon = match response {
        "Yes" => "🎉",
        "Maybe" => "🙋",
        _ => "✓",
    };

    let display_name = user_handle.clone().unwrap_or_else(|| "Someone".to_string());

    // Phrase variations for RSVPs
    let message = match response {
        "Yes" => {
            let phrases = [
                "{name} is coming to the party! 🎉",
                "{name} RSVPed Yes!",
                "{name} confirmed their attendance!",
                "{name} is joining the fun!",
            ];
            let template = get_phrase(&phrases, &event.id);
            template.replace("{name}", &display_name)
        }
        "Maybe" => {
            let phrases = [
                "{name} might join us 🙋",
                "{name} RSVPed Maybe",
                "{name} is considering attending",
            ];
            let template = get_phrase(&phrases, &event.id);
            template.replace("{name}", &display_name)
        }
        _ => format!("{display_name} updated their RSVP"),
    };

    Some(ActivityTickerEvent {
        id: event.id,
        timestamp: event.timestamp,
        message,
        icon: icon.to_string(),
        event_type: "rsvp".to_string(),
        user_handle,
        user_avatar_url,
    })
}

fn format_game_suggestion_event(
    event: &activity_ticker::TickerEvent,
) -> Option<ActivityTickerEvent> {
    let metadata = event.metadata.as_ref()?;
    let game_name = metadata.get("game_name")?.as_str()?;
    let comment = metadata.get("comment").and_then(|v| v.as_str());

    // Use handle from database join, or from metadata as fallback
    let user_handle = event.user_handle.clone().or_else(|| {
        metadata
            .get("handle")
            .and_then(|v| v.as_str())
            .map(String::from)
    });

    // Generate avatar URL only if we have user_id (email)
    let user_avatar_url = event.user_id.as_ref().map(|email| {
        let digest = md5::compute(email.to_lowercase().as_bytes());
        format!("https://www.gravatar.com/avatar/{digest:x}?d=robohash")
    });

    let display_name = user_handle.clone().unwrap_or_else(|| "Someone".to_string());

    // UTF-8 safe truncation using character count instead of byte index
    let truncated_comment = comment.and_then(|c| {
        if !c.is_empty() {
            let char_count = c.chars().count();
            if char_count > 50 {
                Some(format!("{}...", c.chars().take(50).collect::<String>()))
            } else {
                Some(c.to_string())
            }
        } else {
            None
        }
    });

    // Phrase variations for game suggestions
    let message = if let Some(comment_text) = truncated_comment {
        let phrases = [
            "{name} wants to play 🎮 '{game}': \"{comment}\"",
            "{name} suggested '{game}': \"{comment}\"",
            "{name} thinks we should try '{game}': \"{comment}\"",
        ];
        let template = get_phrase(&phrases, &event.id);
        template
            .replace("{name}", &display_name)
            .replace("{game}", game_name)
            .replace("{comment}", &comment_text)
    } else {
        let phrases = [
            "{name} suggested 🎮 '{game}'",
            "{name} wants to play '{game}'!",
            "{name} added '{game}' to the list",
        ];
        let template = get_phrase(&phrases, &event.id);
        template
            .replace("{name}", &display_name)
            .replace("{game}", game_name)
    };

    Some(ActivityTickerEvent {
        id: event.id,
        timestamp: event.timestamp,
        message,
        icon: "🎮".to_string(),
        event_type: "game_suggestion".to_string(),
        user_handle,
        user_avatar_url,
    })
}

fn format_game_vote_event(event: &activity_ticker::TickerEvent) -> Option<ActivityTickerEvent> {
    let metadata = event.metadata.as_ref()?;
    let game_name = metadata.get("game_name")?.as_str()?;
    let vote = metadata.get("vote")?.as_str()?;

    // Only show "Yes" votes
    if vote != "Yes" {
        return None;
    }

    // Use handle from database join, or from metadata as fallback
    let user_handle = event.user_handle.clone().or_else(|| {
        metadata
            .get("handle")
            .and_then(|v| v.as_str())
            .map(String::from)
    });

    // Generate avatar URL only if we have user_id (email)
    let user_avatar_url = event.user_id.as_ref().map(|email| {
        let digest = md5::compute(email.to_lowercase().as_bytes());
        format!("https://www.gravatar.com/avatar/{digest:x}?d=robohash")
    });

    let display_name = user_handle.clone().unwrap_or_else(|| "Someone".to_string());

    // Phrase variations for game votes
    let phrases = [
        "{name} voted for '{game}' 👍",
        "{name} wants to play '{game}'!",
        "{name} is excited about '{game}'!",
        "{name} cast a vote for '{game}'",
    ];
    let template = get_phrase(&phrases, &event.id);
    let message = template
        .replace("{name}", &display_name)
        .replace("{game}", game_name);

    Some(ActivityTickerEvent {
        id: event.id,
        timestamp: event.timestamp,
        message,
        icon: "👍".to_string(),
        event_type: "game_vote".to_string(),
        user_handle,
        user_avatar_url,
    })
}

fn format_seat_reservation_event(
    event: &activity_ticker::TickerEvent,
) -> Option<ActivityTickerEvent> {
    let metadata = event.metadata.as_ref()?;
    let seat = metadata.get("seat")?.as_str()?;

    // Use handle from database join
    let user_handle = event.user_handle.clone();

    // Generate avatar URL only if we have user_id (email)
    let user_avatar_url = event.user_id.as_ref().map(|email| {
        let digest = md5::compute(email.to_lowercase().as_bytes());
        format!("https://www.gravatar.com/avatar/{digest:x}?d=robohash")
    });

    let display_name = user_handle.clone().unwrap_or_else(|| "Someone".to_string());

    // Phrase variations for seat reservations
    let phrases = [
        "{name} claimed {seat}! 🪑",
        "{name} reserved {seat}",
        "{name} grabbed {seat}!",
        "{name} snagged {seat}",
    ];
    let template = get_phrase(&phrases, &event.id);
    let message = template
        .replace("{name}", &display_name)
        .replace("{seat}", seat);

    Some(ActivityTickerEvent {
        id: event.id,
        timestamp: event.timestamp,
        message,
        icon: "🪑".to_string(),
        event_type: "seat_reservation".to_string(),
        user_handle,
        user_avatar_url,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use rocket::serde::json::serde_json::json;

    #[test]
    fn test_format_rsvp_event_yes() {
        let event = activity_ticker::TickerEvent {
            id: 1,
            timestamp: Utc::now(),
            user_id: Some("test@example.com".to_string()),
            user_handle: Some("TestUser".to_string()),
            action: "rsvp.update".to_string(),
            entity_type: "rsvp".to_string(),
            entity_id: Some("42".to_string()),
            metadata: Some(json!({
                "response": "Yes",
                "handle": "TestUser"
            })),
        };

        let result = format_rsvp_event(&event);
        assert!(result.is_some());

        let ticker_event = result.expect("Event should be formatted");
        assert_eq!(ticker_event.message, "TestUser RSVPed Yes!");
        assert_eq!(ticker_event.icon, "🎉");
        assert_eq!(ticker_event.event_type, "rsvp");
        assert_eq!(ticker_event.user_handle, Some("TestUser".to_string()));
    }

    #[test]
    fn test_format_rsvp_event_no_is_filtered() {
        let event = activity_ticker::TickerEvent {
            id: 1,
            timestamp: Utc::now(),
            user_id: Some("test@example.com".to_string()),
            user_handle: Some("TestUser".to_string()),
            action: "rsvp.update".to_string(),
            entity_type: "rsvp".to_string(),
            entity_id: Some("42".to_string()),
            metadata: Some(json!({
                "response": "No",
                "handle": "TestUser"
            })),
        };

        let result = format_rsvp_event(&event);
        assert!(result.is_none(), "No responses should be filtered out");
    }

    #[test]
    fn test_format_game_suggestion_event() {
        let event = activity_ticker::TickerEvent {
            id: 2,
            timestamp: Utc::now(),
            user_id: Some("test@example.com".to_string()),
            user_handle: Some("GameMaster".to_string()),
            action: "game_suggestion.create".to_string(),
            entity_type: "game_suggestion".to_string(),
            entity_id: Some("42-12345".to_string()),
            metadata: Some(json!({
                "game_name": "Portal 2",
                "comment": "Great co-op game!"
            })),
        };

        let result = format_game_suggestion_event(&event);
        assert!(result.is_some());

        let ticker_event = result.expect("Event should be formatted");
        assert!(ticker_event.message.contains("Portal 2"));
        assert!(ticker_event.message.contains("Great co-op game!"));
        assert_eq!(ticker_event.icon, "🎮");
        assert_eq!(ticker_event.event_type, "game_suggestion");
    }

    #[test]
    fn test_format_game_vote_event_yes() {
        let event = activity_ticker::TickerEvent {
            id: 3,
            timestamp: Utc::now(),
            user_id: Some("voter@example.com".to_string()),
            user_handle: Some("Voter123".to_string()),
            action: "game_vote.update".to_string(),
            entity_type: "game_vote".to_string(),
            entity_id: Some("42-12345".to_string()),
            metadata: Some(json!({
                "game_name": "Among Us",
                "vote": "Yes"
            })),
        };

        let result = format_game_vote_event(&event);
        assert!(result.is_some());

        let ticker_event = result.expect("Event should be formatted");
        assert!(ticker_event.message.contains("Among Us"));
        assert!(ticker_event.message.contains("Voter123"));
        assert_eq!(ticker_event.icon, "👍");
        assert_eq!(ticker_event.event_type, "game_vote");
        assert!(
            ticker_event.user_handle.is_some(),
            "Voter identity should be shown"
        );
        assert!(
            ticker_event.user_avatar_url.is_some(),
            "Voter avatar should be shown"
        );
    }

    #[test]
    fn test_format_game_vote_event_no_is_filtered() {
        let event = activity_ticker::TickerEvent {
            id: 3,
            timestamp: Utc::now(),
            user_id: Some("voter@example.com".to_string()),
            user_handle: Some("Voter123".to_string()),
            action: "game_vote.update".to_string(),
            entity_type: "game_vote".to_string(),
            entity_id: Some("42-12345".to_string()),
            metadata: Some(json!({
                "game_name": "Among Us",
                "vote": "No"
            })),
        };

        let result = format_game_vote_event(&event);
        assert!(result.is_none(), "No votes should be filtered out");
    }
}
