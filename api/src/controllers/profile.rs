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
            games: vec![],
            game_count: 0,
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
            name: game.name,
            playtime_forever: game
                .playtime_forever
                .unwrap_or_default()
                .try_into()
                .unwrap_or_default(),
            last_modified: game.last_modified.unwrap_or_default(),
        }
    }
}

pub async fn get(pool: &PgPool, email: String, count: i64, page: i64) -> Result<Profile, Error> {
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
    let filter = user_games::Filter {
        emails: Some(vec![email.clone()]),
        appid: None,
        count,
        page,
    };

    profile.games = match user_games::filter(pool, filter.clone()).await {
        Ok(user_games) => user_games
            .into_iter()
            .map(std::convert::Into::into)
            .collect(),
        Err(e) => {
            return Err(Error::Controller(format!(
                "Unable to get user games due to: {e}"
            )))
        }
    };

    profile.game_count = match user_games::count(pool, filter).await {
        Ok(Some(game_count)) => (game_count + count - 1) / count,
        Ok(None) => 0,
        Err(e) => {
            return Err(Error::Controller(format!(
                "Unable to get user game count due to: {e}"
            )))
        }
    };

    Ok(profile)
}

pub async fn edit(
    pool: &PgPool,
    email: String,
    new_profile: ProfileSubmit,
    admin_email: Option<String>,
) -> Result<Profile, Error> {
    let new_steam_id = match new_profile.steam_id {
        Some(steam_id) if !steam_id.is_empty() => steam_id
            .parse::<i64>()
            .map_err(|_| Error::BadInput("Unable to parse steam ID".to_string()))?,
        _ => {
            return Err(Error::BadInput("Steam ID is required".to_string()));
        }
    };

    match profile::update(pool, email.clone(), Some(new_steam_id), None).await {
        Ok(profile) => {
            // Log audit entry for profile update
            let metadata = rocket::serde::json::serde_json::json!({
                "steam_id": new_steam_id,
                "edited_user": email.clone(),
            });
            crate::util::log_audit(
                pool,
                admin_email.or(Some(email)),
                "profile.update".to_string(),
                "profile".to_string(),
                Some(new_steam_id.to_string()),
                Some(metadata),
            )
            .await;

            Ok(Profile::from(profile))
        }
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
    let profile = get(pool, email.clone(), 1, 1).await?;

    let user_games = steam_api::get_owned_games(steam_api_key, &profile.steam_id).await?;

    let games_count = user_games.response.games.len();

    // Create each user game in the user_games.rs repository
    for game in user_games.response.games {
        match user_games::create(pool, email.clone(), game.appid, game.playtime_forever).await {
            Ok(_) => (),
            Err(e) => {
                return Err(Error::Controller(format!(
                    "Unable to create user game due to: {e}"
                )))
            }
        }
    }

    // Log audit entry for games refresh
    let metadata = rocket::serde::json::serde_json::json!({
        "games_count": games_count,
        "steam_id": &profile.steam_id,
    });
    crate::util::log_audit(
        pool,
        Some(email.clone()),
        "profile.games_refresh".to_string(),
        "profile".to_string(),
        Some(email.clone()),
        Some(metadata),
    )
    .await;

    // Return the updated profile
    match profile::read(pool, email.clone()).await {
        Ok(Some(profile)) => Ok(profile.into()),
        Ok(None) => Err(Error::NoData(format!("Profile for {email} not found"))),
        Err(e) => Err(Error::Controller(format!(
            "Unable to get profile due to: {e}"
        ))),
    }
}
