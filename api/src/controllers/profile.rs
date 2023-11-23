use sqlx::PgPool;

use crate::{
    controllers::Error,
    repositories::{profile, steam_api, user_games},
    routes::profiles::{Profile, ProfileSubmit, UserGame},
};

// Implement From for Profile from repositories::profile::Profile
impl From<crate::repositories::profile::Profile> for Profile {
    fn from(profile: crate::repositories::profile::Profile) -> Self {
        Self {
            email: profile.email,
            steam_id: profile.steam_id.to_string(),
            games: None,
        }
    }
}

impl From<reqwest::Error> for Error {
    fn from(error: reqwest::Error) -> Self {
        Error::Controller(format!("Request error: {error}"))
    }
}

impl From<user_games::UserGame> for UserGame {
    fn from(game: user_games::UserGame) -> Self {
        Self {
            appid: game.appid,
            playtime_forever: game.playtime_forever,
        }
    }
}

pub async fn get(pool: &PgPool, email: String) -> Result<Profile, Error> {
    // Return profile from repository for selected email address
    let mut profile: Profile = match profile::read(pool, email.clone()).await {
        Ok(Some(profile)) => profile.into(),
        Ok(None) => return Err(Error::NoData(format!("Profile for {email} not found"))),
        Err(e) => {
            return Err(Error::Controller(format!(
                "Unable to get profile due to: {e}"
            )))
        }
    };

    // Return profile with games from user_games repository
    profile.games = match user_games::read(pool, email.clone()).await {
        Ok(user_games) => Some(
            user_games
                .into_iter()
                .map(std::convert::Into::into)
                .collect(),
        ),
        Err(e) => {
            return Err(Error::Controller(format!(
                "Unable to get user games due to: {e}"
            )))
        }
    };

    Ok(profile)
}

pub async fn edit(
    pool: &PgPool,
    email: String,
    new_profile: ProfileSubmit,
) -> Result<Profile, Error> {
    let new_steam_id = match new_profile.steam_id.parse::<i64>() {
        Ok(id) => id,
        Err(_) => return Err(Error::BadInput("Unable to parse steam ID".to_string())),
    };

    match profile::update(pool, email.clone(), Some(new_steam_id), None).await {
        Ok(profile) => Ok(Profile::from(profile)),
        Err(e) => Err(Error::Controller(format!(
            "Unable to update profile due to: {e}"
        ))),
    }
}

pub async fn update_user_games(
    pool: &PgPool,
    email: String,
    steam_api_key: &String,
) -> Result<Profile, Error> {
    let profile = get(pool, email.clone()).await?;

    let user_games = steam_api::get_owned_games(steam_api_key, &profile.steam_id).await?;

    // Create each user game in the user_games.rs repository
    for game in user_games.response.games {
        let user_game = user_games::UserGame {
            email: email.clone(),
            appid: game.appid,
            playtime_forever: game.playtime_forever,
        };

        match user_games::create(pool, &user_game).await {
            Ok(_) => (),
            Err(e) => {
                return Err(Error::Controller(format!(
                    "Unable to create user game due to: {e}"
                )))
            }
        }
    }

    // Return the updated profile
    match profile::read(pool, email.clone()).await {
        Ok(Some(profile)) => Ok(profile.into()),
        Ok(None) => Err(Error::NoData(format!("Profile for {email} not found"))),
        Err(e) => Err(Error::Controller(format!(
            "Unable to get profile due to: {e}"
        ))),
    }
}
