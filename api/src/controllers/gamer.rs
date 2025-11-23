use sqlx::PgPool;
use std::collections::{HashMap, HashSet};

use crate::{
    controllers::Error,
    repositories::{event, invitation, profile, user_games},
    routes::{events::Event, gamers::Gamer},
};
use chrono::{prelude::Utc, DateTime};

#[derive(Clone)]
/// A user of the system
struct GamerBuild {
    email: String,
    avatar_url: String,
    handles: HashSet<String>,
    steam_id: Option<String>,
    events_invited: HashSet<Event>,
    events_accepted: HashSet<Event>,
    events_tentative: HashSet<Event>,
    events_declined: HashSet<Event>,
    events_last_response: Option<DateTime<Utc>>,
    games_owned_count: u16,
    games_owned_last_modified: Option<DateTime<Utc>>,
}

impl From<GamerBuild> for Gamer {
    fn from(gamer_build: GamerBuild) -> Self {
        Self {
            email: gamer_build.email,
            avatar_url: gamer_build.avatar_url,
            handles: gamer_build.handles.into_iter().collect(),
            steam_id: gamer_build.steam_id,
            events_invited: gamer_build.events_invited.into_iter().collect(),
            events_accepted: gamer_build.events_accepted.into_iter().collect(),
            events_tentative: gamer_build.events_tentative.into_iter().collect(),
            events_declined: gamer_build.events_declined.into_iter().collect(),
            events_last_response: gamer_build.events_last_response,
            games_owned_count: gamer_build.games_owned_count,
            games_owned_last_modified: gamer_build.games_owned_last_modified,
        }
    }
}

pub async fn get_all(pool: &PgPool) -> Result<Vec<Gamer>, Error> {
    // Return all invitations across all events
    let invitation_filter_values = invitation::Filter {
        event_id: None,
        email: None,
    };

    match invitation::filter(pool, invitation_filter_values).await {
        Ok(invitations) => {
            let mut gamers: HashMap<String, GamerBuild> = HashMap::new();
            for invitation in invitations {
                let key = invitation.email.clone();

                let event_filter_values = event::Filter {
                    ids: Some(vec![invitation.event_id]),
                };

                let event: Event = match event::filter(pool, event_filter_values).await {
                    Ok(event) => event[0].clone().into(),
                    Err(e) => {
                        log::error!("Unable to get event for invitation: {e}");
                        continue;
                    }
                };

                let gamer = if let Some(gamer) = gamers.get_mut(&key) {
                    gamer
                } else {
                    let gamer = GamerBuild {
                        email: invitation.email.clone(),
                        avatar_url: invitation.avatar_url.clone().expect("Avatar URL not found"),
                        handles: HashSet::new(),
                        steam_id: None,
                        events_invited: HashSet::new(),
                        events_accepted: HashSet::new(),
                        events_tentative: HashSet::new(),
                        events_declined: HashSet::new(),
                        events_last_response: Option::None,
                        games_owned_count: 0,
                        games_owned_last_modified: Option::None,
                    };
                    gamers.insert(key.clone(), gamer);
                    gamers
                        .get_mut(&key)
                        .expect("Gamer should exist after insert")
                };

                match invitation.handle {
                    Some(handle) => gamer.handles.insert(handle),
                    None => false,
                };

                gamer.events_invited.insert(event.clone());

                match invitation.response {
                    Some(invitation::Response::Yes) => gamer.events_accepted.insert(event.clone()),
                    Some(invitation::Response::No) => gamer.events_declined.insert(event.clone()),
                    Some(invitation::Response::Maybe) => {
                        gamer.events_tentative.insert(event.clone())
                    }
                    None => false,
                };

                if let Some(responded_at) = invitation.responded_at {
                    if let Some(last_response) = gamer.events_last_response {
                        if responded_at > last_response {
                            gamer.events_last_response = Some(responded_at);
                        }
                    } else {
                        gamer.events_last_response = Some(responded_at);
                    }
                }
            }

            let mut gamer_list: Vec<GamerBuild> = gamers.values().cloned().collect();
            // Annotate gamer list with games owned and steam_id
            for gamer in &mut gamer_list {
                let filter = user_games::Filter {
                    emails: Some(vec![gamer.email.clone()]),
                    appid: None,
                    count: 9999,
                    page: 0,
                };
                match user_games::filter(pool, filter).await {
                    Ok(user_games) => {
                        gamer.games_owned_count =
                            u16::try_from(user_games.len()).unwrap_or(u16::MAX);
                        gamer.games_owned_last_modified = user_games
                            .iter()
                            .max_by_key(|user_game| user_game.last_modified.unwrap_or_default())
                            .map(|user_game| user_game.last_modified.unwrap_or_default());
                    }
                    Err(e) => {
                        log::error!("Unable to get games owned by gamer: {e}");
                    }
                }

                // Fetch Steam ID from profile
                match profile::read(pool, gamer.email.clone()).await {
                    Ok(Some(profile_data)) => {
                        gamer.steam_id = Some(profile_data.steam_id.to_string());
                    }
                    Ok(None) => {
                        // No profile exists for this gamer
                        gamer.steam_id = None;
                    }
                    Err(e) => {
                        log::error!("Unable to get profile for gamer: {e}");
                        gamer.steam_id = None;
                    }
                }
            }

            Ok(gamer_list.into_iter().map(Gamer::from).collect())
        }
        Err(e) => Err(Error::Controller(format!(
            "Unable to get list of events due to: {e}"
        ))),
    }
}
