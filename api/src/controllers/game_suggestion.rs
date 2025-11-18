use std::collections::HashMap;

use sqlx::PgPool;

use crate::{
    controllers::Error,
    repositories::{
        game_suggestion::{self, GameSuggestion},
        invitation, user_games,
    },
    routes::event_games::{
        EventGameResponse, EventGameSuggestionRequest, EventGameSuggestionResponse, EventGames,
        GameVote, Gamer,
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
            comment: game_suggestion.comment,
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

impl From<String> for Gamer {
    fn from(gamer: String) -> Self {
        Self {
            avatar_url: Some(String::new()),
            handle: Some(gamer),
        }
    }
}

// Implement From for EventGameResponse from Game
impl From<crate::repositories::user_games::UserGame> for EventGameResponse {
    fn from(game: crate::repositories::user_games::UserGame) -> Self {
        Self {
            appid: game.appid,
            name: game.name,
            gamer_owned: game
                .emails
                .unwrap_or_default()
                .into_iter()
                .map(std::convert::Into::into)
                .collect(),
            playtime_forever: game
                .playtime_forever
                .unwrap_or_default()
                .try_into()
                .unwrap_or_default(),
            last_modified: game.last_modified.unwrap_or_default(),
        }
    }
}

pub async fn get_all_event_games(
    pool: &PgPool,
    event_id: i32,
    count: i64,
    page: i64,
) -> Result<EventGames, Error> {
    let invitations = match invitation::filter(
        pool,
        invitation::Filter {
            event_id: Some(event_id),
            email: None,
        },
    )
    .await
    {
        Ok(invitations) => invitations,
        Err(e) => {
            return Err(Error::Controller(format!(
                "Unable to get event invitations due to: {e}"
            )))
        }
    };

    // Filter out invitations with a response of 'yes' or 'maybe'
    let invitations: Vec<invitation::Invitation> = invitations
        .into_iter()
        .filter(|i| {
            i.response == Some(invitation::Response::Yes)
                || i.response == Some(invitation::Response::Maybe)
        })
        .collect();

    // Create list of emails from all event inviations
    let emails: Vec<String> = invitations.iter().map(|i| i.email.clone()).collect();

    // Create map of emails to their respective handles and avatar_urls
    let mut email_map: HashMap<String, Gamer> = HashMap::new();
    for invitation in invitations {
        email_map.insert(
            invitation.email.clone().to_lowercase(),
            Gamer {
                avatar_url: invitation.avatar_url,
                handle: invitation.handle,
            },
            // (, ),
        );
    }

    // Build user_games Filter
    let user_games_filter_values = user_games::Filter {
        appid: None,
        emails: Some(emails.clone()),
        count,
        page,
    };

    let event_games = match user_games::filter(pool, user_games_filter_values.clone()).await {
        Ok(games) => {
            let mut event_games = Vec::new();
            //For each Gamer in each event_games, add the Gamer's handle and avatar_url from invitations
            for game in games {
                let gamer_emails = game.emails.unwrap_or_default();

                let gamer_owned: Vec<Gamer> = gamer_emails
                    .iter()
                    .map(|email| {
                        email_map.get(&email.to_lowercase()).unwrap_or(&Gamer {
                            avatar_url: None,
                            handle: None,
                        })
                    })
                    .cloned()
                    .collect();

                event_games.push(EventGameResponse {
                    appid: game.appid,
                    name: game.name,
                    gamer_owned,
                    playtime_forever: game
                        .playtime_forever
                        .unwrap_or_default()
                        .try_into()
                        .unwrap_or_default(),
                    last_modified: game.last_modified.unwrap_or_default(),
                });
            }
            event_games
        }
        Err(e) => {
            return Err(Error::Controller(format!(
                "Unable to get games count for event due to: {e}"
            )))
        }
    };

    let event_games_count = match user_games::count(pool, user_games_filter_values).await {
        Ok(count) => count,
        Err(e) => {
            return Err(Error::Controller(format!(
                "Unable to get games count for event due to: {e}"
            )))
        }
    };

    Ok(EventGames {
        event_games,
        total_count: (event_games_count.unwrap_or(0) + count - 1) / count,
    })
}

pub async fn get(
    pool: &PgPool,
    event_id: i32,
    email: String,
) -> Result<Vec<EventGameSuggestionResponse>, Error> {
    let invitations = match invitation::filter(
        pool,
        invitation::Filter {
            event_id: Some(event_id),
            email: None,
        },
    )
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
    }

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
    }

    let invitations = match invitation::filter(
        pool,
        invitation::Filter {
            event_id: Some(event_id),
            email: None,
        },
    )
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
    match game_suggestion::create(
        pool,
        event_id,
        new_event_game_suggestion.appid,
        email.clone(),
        new_event_game_suggestion.comment.clone(),
    )
    .await
    {
        Ok(game_suggestion) => {
            let result = add_owners_to_game(pool, game_suggestion.clone(), &invitations).await?;

            // Log audit entry
            let metadata = rocket::serde::json::serde_json::json!({
                "event_id": event_id,
                "game_id": new_event_game_suggestion.appid,
                "comment": new_event_game_suggestion.comment,
            });
            crate::util::log_audit(
                pool,
                Some(email),
                "game_suggestion.create".to_string(),
                "game_suggestion".to_string(),
                Some(format!("{}-{}", event_id, new_event_game_suggestion.appid)),
                Some(metadata),
            )
            .await;

            Ok(result)
        }
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
    }

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
    }

    let invitations = match invitation::filter(
        pool,
        invitation::Filter {
            event_id: Some(event_id),
            email: None,
        },
    )
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
    match game_suggestion::edit(pool, event_id, game_id, email.clone(), vote.clone().into()).await {
        Ok(game_suggestion) => {
            let result = add_owners_to_game(pool, game_suggestion, &invitations).await?;

            // Log audit entry for game vote
            let metadata = rocket::serde::json::serde_json::json!({
                "event_id": event_id,
                "game_id": game_id,
                "vote": format!("{:?}", vote),
            });
            crate::util::log_audit(
                pool,
                Some(email),
                "game_vote.update".to_string(),
                "game_vote".to_string(),
                Some(format!("{event_id}-{game_id}")),
                Some(metadata),
            )
            .await;

            Ok(result)
        }
        Err(e) => Err(Error::Controller(format!(
            "Unable to get event due to: {e}"
        ))),
    }
}

async fn add_owners_to_game(
    pool: &PgPool,
    game_suggestion: GameSuggestion,
    invitations: &[invitation::Invitation],
) -> Result<EventGameSuggestionResponse, Error> {
    let mut gamer_owned = Vec::new();
    let mut gamer_unowned = Vec::new();
    let gamer_unknown = Vec::new();

    // Filter invitations to only those with yes/maybe responses
    let attending_invitations: Vec<&invitation::Invitation> = invitations
        .iter()
        .filter(|i| {
            i.response == Some(invitation::Response::Yes)
                || i.response == Some(invitation::Response::Maybe)
        })
        .collect();

    // Get all emails for attending invitations
    let attending_emails: Vec<String> = attending_invitations
        .iter()
        .map(|i| i.email.clone())
        .collect();

    // Batch query: Get all user games for this game_id and all attending emails in one query
    // Use a large count to ensure we get all results without pagination limits
    let user_games = match user_games::filter(
        pool,
        user_games::Filter {
            appid: Some(game_suggestion.game_id),
            emails: Some(attending_emails.clone()),
            count: 1000, // Large enough to handle events with many attendees
            page: 0,
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

    // Build a set of emails that own the game for quick lookup
    let owner_emails: std::collections::HashSet<String> = user_games
        .into_iter()
        .flat_map(|game| game.emails.unwrap_or_default())
        .map(|email| email.to_lowercase())
        .collect();

    // Categorize invitations based on ownership
    for invitation in attending_invitations {
        if owner_emails.contains(&invitation.email.to_lowercase()) {
            gamer_owned.push(Gamer {
                avatar_url: invitation.avatar_url.clone(),
                handle: invitation.handle.clone(),
            });
        } else {
            gamer_unowned.push(Gamer {
                avatar_url: invitation.avatar_url.clone(),
                handle: invitation.handle.clone(),
            });
        }
    }

    Ok(EventGameSuggestionResponse {
        appid: game_suggestion.game_id,
        name: game_suggestion.game_name,
        comment: game_suggestion.comment,
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
