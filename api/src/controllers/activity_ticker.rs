use chrono::{DateTime, Duration, Utc};
use sqlx::PgPool;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

use crate::repositories::audit_log;

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
/// Returns up to 20 events from the last week, or at least 10 events if available
pub async fn get_ticker_events(
    pool: &PgPool,
    event_id: i32,
) -> Result<Vec<ActivityTickerEvent>, Error> {
    // First, try to get events from the last week (up to 20)
    let one_week_ago = Utc::now() - Duration::days(7);

    let week_events = get_events_for_period(pool, event_id, Some(one_week_ago), 20).await?;

    // If we have at least 10 events from the last week, use those
    let events = if week_events.len() >= 10 {
        week_events
    } else {
        // Otherwise, get the last 10 events regardless of time
        get_events_for_period(pool, event_id, None, 10).await?
    };

    // Randomly shuffle the events using a seeded RNG for thread safety
    let mut shuffled_events = events;
    use rand::rngs::StdRng;
    use rand::seq::SliceRandom;
    use rand::SeedableRng;

    // Use a deterministic but varying seed based on current time
    let seed = Utc::now().timestamp() as u64;
    let mut rng = StdRng::seed_from_u64(seed);
    shuffled_events.shuffle(&mut rng);

    // Format the events
    let mut ticker_events = Vec::new();
    for event in &shuffled_events {
        if let Some(formatted) = format_ticker_event(pool, event_id, event).await {
            ticker_events.push(formatted);
        }
    }

    Ok(ticker_events)
}

/// Helper function to get events for a specific period
async fn get_events_for_period(
    pool: &PgPool,
    event_id: i32,
    from_timestamp: Option<DateTime<Utc>>,
    limit: i64,
) -> Result<Vec<audit_log::AuditLog>, Error> {
    // Query audit logs with custom SQL
    let query = if let Some(from_ts) = from_timestamp {
        sqlx::query_as::<_, audit_log::AuditLog>(
            r"
            SELECT
                al.id,
                al.timestamp,
                al.user_id,
                al.action,
                al.entity_type,
                al.entity_id,
                al.metadata,
                al.ip_address,
                al.user_agent
            FROM audit_log al
            WHERE (
                (al.action = 'event.create' AND al.entity_type = 'event' AND al.entity_id = $1::text)
                OR (al.action = 'rsvp.update' AND al.entity_type = 'rsvp' AND al.entity_id = $1::text)
                OR (al.action = 'game_suggestion.create' AND al.entity_type = 'game_suggestion' AND al.entity_id LIKE $2)
                OR (al.action = 'game_vote.update' AND al.entity_type = 'game_vote' AND al.entity_id LIKE $2)
                OR (al.action = 'seat_reservation.create' AND al.entity_type = 'seat_reservation' AND al.entity_id = $1::text)
            )
            AND al.timestamp >= $3
            ORDER BY al.timestamp DESC
            LIMIT $4
            "
        )
        .bind(event_id.to_string())
        .bind(format!("{event_id}-%"))
        .bind(from_ts)
        .bind(limit)
    } else {
        sqlx::query_as::<_, audit_log::AuditLog>(
            r"
            SELECT
                al.id,
                al.timestamp,
                al.user_id,
                al.action,
                al.entity_type,
                al.entity_id,
                al.metadata,
                al.ip_address,
                al.user_agent
            FROM audit_log al
            WHERE (
                (al.action = 'event.create' AND al.entity_type = 'event' AND al.entity_id = $1::text)
                OR (al.action = 'rsvp.update' AND al.entity_type = 'rsvp' AND al.entity_id = $1::text)
                OR (al.action = 'game_suggestion.create' AND al.entity_type = 'game_suggestion' AND al.entity_id LIKE $2)
                OR (al.action = 'game_vote.update' AND al.entity_type = 'game_vote' AND al.entity_id LIKE $2)
                OR (al.action = 'seat_reservation.create' AND al.entity_type = 'seat_reservation' AND al.entity_id = $1::text)
            )
            ORDER BY al.timestamp DESC
            LIMIT $3
            "
        )
        .bind(event_id.to_string())
        .bind(format!("{event_id}-%"))
        .bind(limit)
    };

    let events = query
        .fetch_all(pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

    Ok(events)
}

/// Get user handle for an event from the invitation table
async fn get_user_handle(pool: &PgPool, event_id: i32, user_id: &str) -> Option<String> {
    let result = sqlx::query_scalar::<_, Option<String>>(
        "SELECT handle FROM invitation WHERE event_id = $1 AND LOWER(email) = LOWER($2)",
    )
    .bind(event_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .ok()?;

    result.flatten()
}

/// Format a raw audit log event into a user-friendly ticker event
async fn format_ticker_event(
    pool: &PgPool,
    event_id: i32,
    event: &audit_log::AuditLog,
) -> Option<ActivityTickerEvent> {
    match event.action.as_str() {
        "event.create" => format_event_create(pool, event_id, event).await,
        "rsvp.update" => format_rsvp_event(pool, event_id, event).await,
        "game_suggestion.create" => format_game_suggestion_event(pool, event_id, event).await,
        "game_vote.update" => format_game_vote_event(pool, event_id, event).await,
        "seat_reservation.create" => format_seat_reservation_event(pool, event_id, event).await,
        _ => None,
    }
}

async fn format_event_create(
    pool: &PgPool,
    event_id: i32,
    event: &audit_log::AuditLog,
) -> Option<ActivityTickerEvent> {
    let metadata = event.metadata.as_ref()?;
    let event_name = metadata.get("name")?.as_str()?;

    // Get user handle if available
    let user_handle = if let Some(user_id) = &event.user_id {
        get_user_handle(pool, event_id, user_id).await
    } else {
        None
    };

    // Generate avatar URL only if we have user_id (email)
    let user_avatar_url = event.user_id.as_ref().map(|email| {
        let digest = md5::compute(email.to_lowercase().as_bytes());
        format!("https://www.gravatar.com/avatar/{digest:x}?d=robohash")
    });

    let display_name = user_handle.clone().unwrap_or_else(|| "Someone".to_string());

    // Phrase variations for event creation
    let phrases = [
        "{name} created the event '{event}'! 🎊",
        "{name} started planning '{event}'!",
        "'{event}' is happening! Created by {name}",
    ];
    let template = get_phrase(&phrases, &event.id);
    let message = template
        .replace("{name}", &display_name)
        .replace("{event}", event_name);

    Some(ActivityTickerEvent {
        id: event.id,
        timestamp: event.timestamp,
        message,
        icon: "🎊".to_string(),
        event_type: "event_create".to_string(),
        user_handle,
        user_avatar_url,
    })
}

async fn format_rsvp_event(
    pool: &PgPool,
    event_id: i32,
    event: &audit_log::AuditLog,
) -> Option<ActivityTickerEvent> {
    let metadata = event.metadata.as_ref()?;
    let response = metadata.get("response")?.as_str()?;

    // Skip "No" responses - we only want positive activity
    if response == "No" {
        return None;
    }

    // Get handle from metadata first, then from database
    let user_handle = metadata
        .get("handle")
        .and_then(|v| v.as_str())
        .map(String::from)
        .or_else(|| {
            if let Some(user_id) = &event.user_id {
                futures::executor::block_on(get_user_handle(pool, event_id, user_id))
            } else {
                None
            }
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

async fn format_game_suggestion_event(
    pool: &PgPool,
    event_id: i32,
    event: &audit_log::AuditLog,
) -> Option<ActivityTickerEvent> {
    let metadata = event.metadata.as_ref()?;
    let game_name = metadata.get("game_name")?.as_str()?;
    let comment = metadata.get("comment").and_then(|v| v.as_str());

    // Get user handle
    let user_handle = if let Some(user_id) = &event.user_id {
        get_user_handle(pool, event_id, user_id).await
    } else {
        None
    };

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

async fn format_game_vote_event(
    pool: &PgPool,
    event_id: i32,
    event: &audit_log::AuditLog,
) -> Option<ActivityTickerEvent> {
    let metadata = event.metadata.as_ref()?;
    let game_name = metadata.get("game_name")?.as_str()?;
    let vote = metadata.get("vote")?.as_str()?;

    // Only show "Yes" votes
    if vote != "Yes" {
        return None;
    }

    // Get user handle
    let user_handle = if let Some(user_id) = &event.user_id {
        get_user_handle(pool, event_id, user_id).await
    } else {
        None
    };

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

async fn format_seat_reservation_event(
    pool: &PgPool,
    event_id: i32,
    event: &audit_log::AuditLog,
) -> Option<ActivityTickerEvent> {
    let metadata = event.metadata.as_ref()?;
    let seat = metadata.get("seat")?.as_str()?;

    // Get user handle
    let user_handle = if let Some(user_id) = &event.user_id {
        get_user_handle(pool, event_id, user_id).await
    } else {
        None
    };

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
