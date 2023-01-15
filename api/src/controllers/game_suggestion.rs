use sqlx::PgPool;

use crate::{
    controllers::Error,
    repositories::game_suggestion,
    routes::event_games::{EventGameSuggestionRequest, EventGameSuggestionResponse, GameVote},
    util::{is_attending_event, is_event_active},
};

// Implement From for EventGameSuggestionResponse from Event
impl From<game_suggestion::GameVote> for GameVote {
    fn from(game_vote: game_suggestion::GameVote) -> Self {
        match game_vote {
            game_suggestion::GameVote::Yes => Self::Yes,
            game_suggestion::GameVote::No => Self::No,
            game_suggestion::GameVote::NoVote => Self::NoVote,
        }
    }
}

// Implement From for EventGameSuggestionResponse from Event
impl From<game_suggestion::GameSuggestion> for EventGameSuggestionResponse {
    fn from(game_suggestion: game_suggestion::GameSuggestion) -> Self {
        Self {
            appid: game_suggestion.game_id,
            name: game_suggestion.game_name,
            last_modified: game_suggestion.last_modified,
            requested_at: game_suggestion.requested_at,
            suggestion_last_modified: game_suggestion.last_modified,
            self_vote: game_suggestion.self_vote.map(Into::into),
            votes: game_suggestion.votes,
        }
    }
}

pub async fn get(
    pool: &PgPool,
    event_id: i32,
    email: String,
) -> Result<Vec<EventGameSuggestionResponse>, Error> {
    // Build new EventFilter
    let game_suggestion_filter_values = game_suggestion::Filter {
        event_id: Some(event_id),
        game_id: None,
    };

    // Return all game suggestions for event
    match game_suggestion::filter(pool, game_suggestion_filter_values, email).await {
        Ok(game_suggestions) => Ok(game_suggestions
            .into_iter()
            .map(EventGameSuggestionResponse::from)
            .collect()),
        Err(e) => Err(Error::Controller(format!(
            "Unable to get event due to: {}",
            e
        ))),
    }
}

pub async fn create(
    pool: &PgPool,
    event_id: i32,
    email: String,
    new_event_game_suggestion: EventGameSuggestionRequest,
) -> Result<EventGameSuggestionResponse, Error> {
    match is_event_active(pool, event_id).await {
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
        Ok((true, _event)) => (),
    };

    match is_attending_event(pool, event_id, email.clone()).await {
        Err(e) => {
            return Err(Error::Controller(format!(
                "Unable to check if attending event, due to: {}",
                e
            )))
        }
        Ok(false) => {
            return Err(Error::NotPermitted(
                "You can only suggest games for events you are attending".to_string(),
            ))
        }
        Ok(true) => (),
    };

    // Insert game suggestion
    match game_suggestion::create(pool, event_id, new_event_game_suggestion.appid, email).await {
        Ok(game_suggestions) => Ok(EventGameSuggestionResponse::from(game_suggestions)),
        Err(e) => Err(Error::Controller(format!(
            "Unable to get event due to: {}",
            e
        ))),
    }
}
