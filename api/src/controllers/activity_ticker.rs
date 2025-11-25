use chrono::{DateTime, Utc};
use sqlx::PgPool;

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

/// Get formatted activity ticker events for an event
pub async fn get_ticker_events(
    pool: &PgPool,
    event_id: i32,
) -> Result<Vec<ActivityTickerEvent>, Error> {
    let events = activity_ticker::get_ticker_events(pool, event_id, 20)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

    let mut ticker_events = Vec::new();

    for event in events {
        if let Some(formatted) = format_ticker_event(event) {
            ticker_events.push(formatted);
        }
    }

    Ok(ticker_events)
}

/// Format a raw audit log event into a user-friendly ticker event
fn format_ticker_event(event: activity_ticker::TickerEvent) -> Option<ActivityTickerEvent> {
    match event.action.as_str() {
        "rsvp.update" => format_rsvp_event(event),
        "game_suggestion.create" => format_game_suggestion_event(event),
        "game_vote.update" => format_game_vote_event(event),
        _ => None,
    }
}

fn format_rsvp_event(event: activity_ticker::TickerEvent) -> Option<ActivityTickerEvent> {
    let metadata = event.metadata.as_ref()?;
    let response = metadata.get("response")?.as_str()?;
    let handle = metadata.get("handle").and_then(|v| v.as_str());

    // Skip "No" responses - we only want positive activity
    if response == "No" {
        return None;
    }

    let user_handle = handle.map(String::from);
    let user_avatar_url = event.user_id.as_ref().map(|email| {
        let digest = md5::compute(email.to_lowercase().as_bytes());
        format!("https://www.gravatar.com/avatar/{digest:x}?d=robohash")
    });

    let icon = match response {
        "Yes" => "🎉",
        "Maybe" => "🙋",
        _ => "✓",
    };

    let display_name = user_handle
        .clone()
        .unwrap_or_else(|| "Someone".to_string());

    let message = match response {
        "Yes" => format!("{} RSVPed Yes!", display_name),
        "Maybe" => format!("{} RSVPed Maybe", display_name),
        _ => format!("{} updated their RSVP", display_name),
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

fn format_game_suggestion_event(event: activity_ticker::TickerEvent) -> Option<ActivityTickerEvent> {
    let metadata = event.metadata.as_ref()?;
    let game_name = metadata.get("game_name")?.as_str()?;
    let comment = metadata.get("comment").and_then(|v| v.as_str());

    let user_handle = event.user_id.as_ref().map(|email| {
        // Try to extract handle from metadata, otherwise use email
        metadata
            .get("handle")
            .and_then(|v| v.as_str())
            .unwrap_or(email)
            .to_string()
    });

    let user_avatar_url = event.user_id.as_ref().map(|email| {
        let digest = md5::compute(email.to_lowercase().as_bytes());
        format!("https://www.gravatar.com/avatar/{digest:x}?d=robohash")
    });

    let display_name = user_handle
        .clone()
        .unwrap_or_else(|| "Someone".to_string());

    let truncated_comment = comment.and_then(|c| {
        if !c.is_empty() && c.len() > 50 {
            Some(format!("{}...", &c[..50]))
        } else if !c.is_empty() {
            Some(c.to_string())
        } else {
            None
        }
    });

    let message = if let Some(comment_text) = truncated_comment {
        format!("{} suggested 🎮 '{}': \"{}\"", display_name, game_name, comment_text)
    } else {
        format!("{} suggested 🎮 '{}'", display_name, game_name)
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

fn format_game_vote_event(event: activity_ticker::TickerEvent) -> Option<ActivityTickerEvent> {
    let metadata = event.metadata.as_ref()?;
    let game_name = metadata.get("game_name")?.as_str()?;
    let vote = metadata.get("vote")?.as_str()?;

    // Only show "Yes" votes - don't reveal who voted
    if vote != "Yes" {
        return None;
    }

    let message = format!("'{}' got a vote! 🗳️", game_name);

    Some(ActivityTickerEvent {
        id: event.id,
        timestamp: event.timestamp,
        message,
        icon: "👍".to_string(),
        event_type: "game_vote".to_string(),
        user_handle: None, // Don't reveal who voted
        user_avatar_url: None,
    })
}
