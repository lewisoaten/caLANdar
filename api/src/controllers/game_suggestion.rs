use sqlx::PgPool;

use crate::{
    controllers::Error,
    repositories::{
        game_suggestion::{self, GameSuggestion},
        user_games,
    },
    routes::{
        event_games::{EventGameSuggestionRequest, EventGameSuggestionResponse, GameVote, Gamer},
        event_invitations::{InvitationResponse, InvitationsResponse},
    },
    util::{is_attending_event, is_event_active},
};

// Implement From for GameVote from game_suggestion::GameVote
impl From<game_suggestion::GameVote> for GameVote {
    fn from(game_vote: game_suggestion::GameVote) -> Self {
        match game_vote {
            game_suggestion::GameVote::Yes => Self::Yes,
            game_suggestion::GameVote::No => Self::No,
            game_suggestion::GameVote::NoVote => Self::NoVote,
        }
    }
}

// Implement From for game_suggestion::GameVote from GameVote
impl From<GameVote> for game_suggestion::GameVote {
    fn from(game_vote: GameVote) -> Self {
        match game_vote {
            GameVote::Yes => Self::Yes,
            GameVote::No => Self::No,
            GameVote::NoVote => Self::NoVote,
        }
    }
}

// Implement From for EventGameSuggestionResponse from game_suggestion::GameSuggestion
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
            gamer_owned: Vec::new(),
            gamer_unowned: Vec::new(),
            gamer_unknown: Vec::new(),
        }
    }
}

pub async fn get(
    pool: &PgPool,
    event_id: i32,
    email: String,
) -> Result<Vec<EventGameSuggestionResponse>, Error> {
    let invitations: Vec<InvitationsResponse> = match sqlx::query_as!(
        InvitationsResponse,
        r#"SELECT event_id, email, 'https://www.gravatar.com/avatar/' || MD5(LOWER(email)) || '?d=robohash' AS avatar_url, handle, invited_at, responded_at, response AS "response: _", attendance, last_modified
        FROM invitation
        WHERE event_id=$1"#,
        event_id
    )
    .fetch_all(pool)
    .await
    {
        Ok(invitations) => invitations,
        Err(e) => {
            return Err(Error::Controller(format!(
                "Unable to get event invitations due to: {e}"
            )))
        }
    };

    // Build new game_suggestion Filter
    let game_suggestion_filter_values = game_suggestion::Filter {
        event_id: Some(event_id),
        game_id: None,
    };

    // Return all game suggestions for event
    match game_suggestion::filter(pool, game_suggestion_filter_values, email).await {
        Ok(game_suggestions) => {
            // Based on the invitations with a response of 'yes' or 'maybe', add whether or not each gamer owns the game in game_suggestions
            let mut game_suggestions_with_gamers = Vec::new();

            for game_suggestion in game_suggestions {
                game_suggestions_with_gamers
                    .push(add_owners_to_game(pool, game_suggestion, &invitations).await?);
            }
            Ok(game_suggestions_with_gamers)
        }
        Err(e) => Err(Error::Controller(format!(
            "Unable to get game suggestions due to: {e}"
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
                "Unable to check if event is active, due to: {e}"
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
                "Unable to check if attending event, due to: {e}"
            )))
        }
        Ok(false) => {
            return Err(Error::NotPermitted(
                "You can only suggest games for events you are attending".to_string(),
            ))
        }
        Ok(true) => (),
    };

    let invitations: Vec<InvitationsResponse> = match sqlx::query_as!(
        InvitationsResponse,
        r#"SELECT event_id, email, 'https://www.gravatar.com/avatar/' || MD5(LOWER(email)) || '?d=robohash' AS avatar_url, handle, invited_at, responded_at, response AS "response: _", attendance, last_modified
        FROM invitation
        WHERE event_id=$1"#,
        event_id
    )
    .fetch_all(pool)
    .await
    {
        Ok(invitations) => invitations,
        Err(e) => {
            return Err(Error::Controller(format!(
                "Unable to get event invitations due to: {e}"
            )))
        }
    };

    // Insert game suggestion
    match game_suggestion::create(pool, event_id, new_event_game_suggestion.appid, email).await {
        Ok(game_suggestion) => Ok(add_owners_to_game(pool, game_suggestion, &invitations).await?),
        Err(e) => Err(Error::Controller(format!(
            "Unable to get event due to: {e}"
        ))),
    }
}

pub async fn vote(
    pool: &PgPool,
    event_id: i32,
    game_id: i64,
    email: String,
    vote: GameVote,
) -> Result<EventGameSuggestionResponse, Error> {
    match is_event_active(pool, event_id).await {
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
        Ok((true, _event)) => (),
    };

    match is_attending_event(pool, event_id, email.clone()).await {
        Err(e) => {
            return Err(Error::Controller(format!(
                "Unable to check if attending event, due to: {e}"
            )))
        }
        Ok(false) => {
            return Err(Error::NotPermitted(
                "You can only suggest games for events you are attending".to_string(),
            ))
        }
        Ok(true) => (),
    };

    let invitations: Vec<InvitationsResponse> = match sqlx::query_as!(
        InvitationsResponse,
        r#"SELECT event_id, email, 'https://www.gravatar.com/avatar/' || MD5(LOWER(email)) || '?d=robohash' AS avatar_url, handle, invited_at, responded_at, response AS "response: _", attendance, last_modified
        FROM invitation
        WHERE event_id=$1"#,
        event_id
    )
    .fetch_all(pool)
    .await
    {
        Ok(invitations) => invitations,
        Err(e) => {
            return Err(Error::Controller(format!(
                "Unable to get event invitations due to: {e}"
            )))
        }
    };

    // Insert game suggestion
    match game_suggestion::edit(pool, event_id, game_id, email, vote.into()).await {
        Ok(game_suggestion) => Ok(add_owners_to_game(pool, game_suggestion, &invitations).await?),
        Err(e) => Err(Error::Controller(format!(
            "Unable to get event due to: {e}"
        ))),
    }
}

async fn add_owners_to_game(
    pool: &PgPool,
    game_suggestion: GameSuggestion,
    invitations: &Vec<InvitationsResponse>,
) -> Result<EventGameSuggestionResponse, Error> {
    let mut gamer_owned = Vec::new();
    let mut gamer_unowned = Vec::new();
    let gamer_unknown = Vec::new();

    for invitation in invitations {
        if invitation.response != Some(InvitationResponse::Yes)
            && invitation.response != Some(InvitationResponse::Maybe)
        {
            continue;
        }

        let user_games = match user_games::filter(
            pool,
            user_games::Filter {
                appid: Some(game_suggestion.game_id),
                email: Some(invitation.email.clone()),
            },
        )
        .await
        {
            Ok(user_games) => user_games,
            Err(e) => {
                return Err(Error::Controller(format!(
                    "Unable to get user games due to: {e}"
                )))
            }
        };

        if user_games.is_empty() {
            gamer_unowned.push(Gamer {
                avatar_url: invitation.avatar_url.clone(),
                handle: invitation.handle.clone(),
            });
        } else {
            gamer_owned.push(Gamer {
                avatar_url: invitation.avatar_url.clone(),
                handle: invitation.handle.clone(),
            });
        }
    }

    Ok(EventGameSuggestionResponse {
        appid: game_suggestion.game_id,
        name: game_suggestion.game_name,
        last_modified: game_suggestion.last_modified,
        requested_at: game_suggestion.requested_at,
        suggestion_last_modified: game_suggestion.last_modified,
        self_vote: game_suggestion.self_vote.map(Into::into),
        votes: game_suggestion.votes,
        gamer_owned,
        gamer_unowned,
        gamer_unknown,
    })
}
