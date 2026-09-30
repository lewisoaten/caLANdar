use sqlx::PgPool;

use crate::{
    controllers::Error,
    repositories::{profile, steam_api, user_games},
    routes::profiles::{Callsign, Me, Profile, ProfileSubmit, UserGame},
};

/// A Steam account reference typed by a user.
#[derive(Debug, PartialEq, Eq)]
pub enum SteamIdInput {
    /// A numeric `SteamID64`.
    Id(i64),
    /// A custom `steamcommunity.com/id/<vanity>` name that must be resolved.
    Vanity(String),
}

fn is_steam_id64(value: &str) -> bool {
    value.len() == 17 && value.bytes().all(|b| b.is_ascii_digit())
}

/// Parse a 17-digit `SteamID64` or a `steamcommunity.com/id|profiles/...` URL.
pub fn parse_steam_id_input(input: &str) -> Result<SteamIdInput, String> {
    const INVALID: &str =
        "Enter a 17-digit SteamID64 or a steamcommunity.com/id/... or /profiles/... URL";
    let value = input.trim();

    if is_steam_id64(value) {
        return value
            .parse::<i64>()
            .map(SteamIdInput::Id)
            .map_err(|_| INVALID.to_string());
    }

    let lower = value.to_ascii_lowercase();
    let mut rest = value;
    for prefix in ["https://", "http://"] {
        if lower.starts_with(prefix) {
            rest = &value[prefix.len()..];
            break;
        }
    }
    if rest.to_ascii_lowercase().starts_with("www.") {
        rest = &rest[4..];
    }
    let Some(path) = rest
        .get(..18)
        .filter(|host| host.eq_ignore_ascii_case("steamcommunity.com"))
        .map(|_| &rest[18..])
    else {
        return Err(INVALID.to_string());
    };
    let path = path.strip_prefix('/').ok_or_else(|| INVALID.to_string())?;
    let path = path.strip_suffix('/').unwrap_or(path);

    let (kind, segment) = path.split_once('/').ok_or_else(|| INVALID.to_string())?;
    let valid_segment = !segment.is_empty()
        && segment
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-');
    if !valid_segment {
        return Err(INVALID.to_string());
    }

    match kind {
        "profiles" if is_steam_id64(segment) => segment
            .parse::<i64>()
            .map(SteamIdInput::Id)
            .map_err(|_| INVALID.to_string()),
        "id" => Ok(SteamIdInput::Vanity(segment.to_string())),
        _ => Err(INVALID.to_string()),
    }
}

/// Parse and, if needed, resolve the user's Steam input to a `SteamID64`.
async fn resolve_steam_id(input: &str, steam_api_key: &String) -> Result<i64, Error> {
    match parse_steam_id_input(input).map_err(Error::BadInput)? {
        SteamIdInput::Id(id) => Ok(id),
        SteamIdInput::Vanity(vanity) => {
            match steam_api::resolve_vanity_url(steam_api_key, &vanity).await {
                Ok(Some(id)) => id.parse::<i64>().map_err(|_| {
                    Error::Controller(format!("Steam returned an invalid ID for {vanity}"))
                }),
                Ok(None) => Err(Error::BadInput(format!(
                    "No Steam profile found for custom URL \"{vanity}\""
                ))),
                Err(e) => Err(Error::Controller(format!(
                    "Unable to resolve Steam custom URL due to: {e}"
                ))),
            }
        }
    }
}

// Implement From for Profile from repositories::profile::Profile
impl From<crate::repositories::profile::Profile> for Profile {
    fn from(profile: crate::repositories::profile::Profile) -> Self {
        Self {
            avatar_url: crate::util::gravatar_url(&profile.email),
            email: profile.email,
            steam_id: profile.steam_id.to_string(),
            games: vec![],
            game_count: 0,
            total_games: 0,
            library_games: 0,
            max_playtime_forever: 0,
            last_synced: None,
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

pub async fn get(
    pool: &PgPool,
    email: String,
    count: i64,
    page: i64,
    search: Option<String>,
    sort: user_games::LibrarySort,
) -> Result<Profile, Error> {
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

    let count = count.clamp(1, 100);
    let page = page.max(0);
    let search = crate::util::non_blank(search);

    profile.games =
        match user_games::library(pool, &email, search.as_deref(), sort, count, page).await {
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

    let stats = user_games::library_stats(pool, &email, search.as_deref())
        .await
        .map_err(|e| Error::Controller(format!("Unable to get user game count due to: {e}")))?;

    // `game_count` has always been the number of pages; kept for existing callers.
    profile.game_count = (stats.matching + count - 1) / count;
    profile.total_games = stats.matching;
    profile.library_games = stats.total;
    profile.max_playtime_forever = stats.max_playtime_forever;
    profile.last_synced = stats.last_synced;

    Ok(profile)
}

pub async fn edit(
    pool: &PgPool,
    email: String,
    new_profile: ProfileSubmit,
    admin_email: Option<String>,
    steam_api_key: &String,
) -> Result<Profile, Error> {
    let new_steam_id = match new_profile.steam_id {
        Some(steam_id) if !steam_id.trim().is_empty() => {
            resolve_steam_id(&steam_id, steam_api_key).await?
        }
        _ => {
            return Err(Error::BadInput("Steam ID is required".to_string()));
        }
    };

    let previous_steam_id = match profile::read(pool, email.clone()).await {
        Ok(existing) => existing.map(|p| p.steam_id),
        Err(e) => {
            return Err(Error::Controller(format!(
                "Unable to read profile due to: {e}"
            )))
        }
    };

    match profile::update(pool, email.clone(), Some(new_steam_id), None).await {
        Ok(profile) => {
            // A different Steam account: drop the old library so it doesn't
            // linger until (and after) the next resync.
            let steam_id_changed = previous_steam_id.is_some_and(|old| old != new_steam_id);
            if steam_id_changed {
                if let Err(e) = user_games::delete_for_email(pool, &email).await {
                    log::error!("Unable to clear old Steam library for {email}: {e}");
                }
            }

            // Log audit entry for profile update
            let metadata = rocket::serde::json::serde_json::json!({
                "steam_id": new_steam_id,
                "edited_user": email.clone(),
                "steam_id_changed": steam_id_changed,
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

/// Identity of the signed-in user plus the callsigns they have used.
pub async fn me(pool: &PgPool, email: String) -> Result<Me, Error> {
    let mut callsigns: Vec<Callsign> = profile::callsigns(pool, &email)
        .await
        .map_err(|e| Error::Controller(format!("Unable to get callsigns due to: {e}")))?
        .into_iter()
        .map(|c| Callsign {
            handle: c.handle,
            event_count: c.event_count,
            last_event_id: c.last_event_id,
            last_event_title: c.last_event_title,
            last_used: c.last_used,
        })
        .collect();
    callsigns.sort_by_key(|c| std::cmp::Reverse(c.last_used));

    Ok(Me {
        avatar_url: crate::util::gravatar_url(&email),
        is_admin: crate::auth::is_admin(&email),
        email,
        callsigns,
    })
}

pub async fn update_user_games(
    pool: &PgPool,
    email: String,
    steam_api_key: &String,
) -> Result<Profile, Error> {
    let profile = get(
        pool,
        email.clone(),
        1,
        0,
        None,
        user_games::LibrarySort::Playtime,
    )
    .await?;

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

#[cfg(test)]
mod tests {
    use super::{parse_steam_id_input, SteamIdInput};

    #[test]
    fn accepts_bare_steam_id64() {
        assert_eq!(
            parse_steam_id_input(" 76561197960287930 "),
            Ok(SteamIdInput::Id(76_561_197_960_287_930))
        );
    }

    #[test]
    fn accepts_profile_urls_with_or_without_scheme_and_www() {
        for url in [
            "https://steamcommunity.com/profiles/76561197960287930",
            "http://www.steamcommunity.com/profiles/76561197960287930/",
            "steamcommunity.com/profiles/76561197960287930",
            "HTTPS://SteamCommunity.com/profiles/76561197960287930",
        ] {
            assert_eq!(
                parse_steam_id_input(url),
                Ok(SteamIdInput::Id(76_561_197_960_287_930)),
                "{url}"
            );
        }
    }

    #[test]
    fn accepts_vanity_urls() {
        assert_eq!(
            parse_steam_id_input("https://steamcommunity.com/id/the_last-anomaly/"),
            Ok(SteamIdInput::Vanity("the_last-anomaly".to_string()))
        );
    }

    #[test]
    fn rejects_everything_else() {
        for bad in [
            "",
            "1234",
            "765611979602879301",
            "7656119796028793a",
            "https://steamcommunity.com/profiles/notanumber",
            "https://steamcommunity.com/id/",
            "https://steamcommunity.com/id/a/b",
            "https://steamcommunity.com/groups/foo",
            "https://evil.example/id/foo",
            "https://steamcommunity.com.evil.example/id/foo",
            "https://steamcommunity.com/id/foo?x=1",
            "https://steamcommunity.com/id/f%20oo",
        ] {
            assert!(
                parse_steam_id_input(bad).is_err(),
                "{bad:?} should be rejected"
            );
        }
    }
}
