use rocket::serde::{json::serde_json, Deserialize};

const MAX_RETRIES: u32 = 3;

#[derive(Clone, Deserialize)]
#[serde(crate = "rocket::serde")]
pub struct SteamAPIApp {
    pub appid: i64,
    pub name: String,
}

#[derive(Clone, Deserialize)]
#[serde(crate = "rocket::serde")]
pub struct SteamAPIAppListResponse {
    pub apps: Vec<SteamAPIApp>,
    pub have_more_results: bool,
    pub last_appid: i64,
}

#[derive(Clone, Deserialize)]
#[serde(crate = "rocket::serde")]
pub struct SteamAPIAppListWrapper {
    pub response: SteamAPIAppListResponse,
}

/// Fetch all apps from the Steam Store API using pagination
/// Uses IStoreService/GetAppList/v1 endpoint which supports pagination
#[allow(clippy::too_many_lines)]
pub async fn get_app_list(steam_api_key: &String) -> Result<Vec<SteamAPIApp>, String> {
    let mut all_apps = Vec::new();
    let mut last_appid = 0;
    let max_results = 50000; // Maximum allowed by the API

    loop {
        let request_url = format!(
            "https://api.steampowered.com/IStoreService/GetAppList/v1/?key={steam_api_key}&max_results={max_results}&last_appid={last_appid}&include_games=true&include_dlc=true&include_software=true&include_videos=false&include_hardware=false"
        );

        log::info!(
            "Requesting games from Steam API using IStoreService/GetAppList (last_appid: {last_appid})"
        );

        // Retry logic for transient failures
        let mut attempts = 0;
        let wrapper = loop {
            attempts += 1;

            match reqwest::get(&request_url).await {
                Ok(response) => {
                    let status = response.status();

                    if !status.is_success() {
                        let error_text = response
                            .text()
                            .await
                            .unwrap_or_else(|_| "Unable to read error response".to_string());
                        log::error!("Steam API returned status {status}: {error_text}");

                        if attempts < MAX_RETRIES {
                            log::warn!("Retrying request (attempt {attempts}/{MAX_RETRIES})");
                            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                            continue;
                        }
                        return Err(format!(
                            "Steam API error after {MAX_RETRIES} attempts (status {status}): {error_text}"
                        ));
                    }

                    // Get the response body as text first for debugging
                    let response_text = match response.text().await {
                        Ok(text) => text,
                        Err(e) => {
                            log::error!("Failed to read response body: {e}");

                            if attempts < MAX_RETRIES {
                                log::warn!("Retrying request (attempt {attempts}/{MAX_RETRIES})");
                                tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                                continue;
                            }
                            return Err(format!(
                                "Failed to read response body after {MAX_RETRIES} attempts: {e}"
                            ));
                        }
                    };

                    // Try to parse the JSON response
                    match serde_json::from_str::<SteamAPIAppListWrapper>(&response_text) {
                        Ok(wrapper) => break wrapper,
                        Err(e) => {
                            log::error!("Failed to parse Steam API response: {e}");
                            log::error!(
                                "Response body (first 500 chars): {}",
                                if response_text.len() > 500 {
                                    &response_text[..500]
                                } else {
                                    &response_text
                                }
                            );

                            if attempts < MAX_RETRIES {
                                log::warn!("Retrying request (attempt {attempts}/{MAX_RETRIES})");
                                tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                                continue;
                            }
                            // If we've collected some apps, log a warning and continue with what we have
                            if !all_apps.is_empty() {
                                log::warn!(
                                    "Failed to parse page after {} apps collected. Stopping pagination and returning {} apps.",
                                    all_apps.len(), all_apps.len()
                                );
                                log::info!("Total apps retrieved (partial): {}", all_apps.len());
                                return Ok(all_apps);
                            }
                            return Err(format!("Failed to parse Steam API response after {} attempts: {}. Response: {}",
                                MAX_RETRIES, e,
                                if response_text.len() > 200 {
                                    &response_text[..200]
                                } else {
                                    &response_text
                                }));
                        }
                    }
                }
                Err(e) => {
                    log::error!("Network error requesting Steam API: {e}");

                    if attempts < MAX_RETRIES {
                        log::warn!("Retrying request (attempt {attempts}/{MAX_RETRIES})");
                        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                        continue;
                    }
                    return Err(format!("Network error after {MAX_RETRIES} attempts: {e}"));
                }
            }
        };

        let app_count = wrapper.response.apps.len();
        log::info!(
            "Retrieved {} apps from Steam API (page total: {})",
            app_count,
            all_apps.len() + app_count
        );

        all_apps.extend(wrapper.response.apps);

        if !wrapper.response.have_more_results {
            log::info!("No more results to fetch from Steam API");
            break;
        }

        last_appid = wrapper.response.last_appid;

        // Small delay between requests to avoid rate limiting
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    }

    log::info!("Total apps retrieved: {}", all_apps.len());
    Ok(all_apps)
}

#[derive(Clone, Deserialize)]
#[serde(crate = "rocket::serde")]
#[allow(dead_code)]
pub struct SteamAPIOwnedGame {
    pub appid: i64,
    pub playtime_2weeks: Option<i32>,
    pub playtime_forever: i32,
    pub playtime_windows_forever: Option<i32>,
    pub playtime_mac_forever: Option<i32>,
    pub playtime_linux_forever: Option<i32>,
    pub playtime_disconnected: Option<i32>,
    pub rtime_last_played: Option<i64>,
}

#[derive(Clone, Deserialize)]
#[serde(crate = "rocket::serde")]
#[allow(dead_code)]
pub struct SteamAPIOwnedGamesListResponse {
    pub game_count: i64,
    pub games: Vec<SteamAPIOwnedGame>,
}

#[derive(Clone, Deserialize)]
#[serde(crate = "rocket::serde")]
#[allow(dead_code)]
pub struct SteamAPIOwnedGamesList {
    pub response: SteamAPIOwnedGamesListResponse,
}

pub async fn get_owned_games(
    steam_api_key: &String,
    steam_id: &String,
) -> Result<SteamAPIOwnedGamesList, reqwest::Error> {
    let include_played_free_games = true;
    let include_free_sub = true;

    let request_url = format!(
        "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key={steam_api_key}&steamid={steam_id}&include_played_free_games={include_played_free_games}&include_free_sub={include_free_sub}",
    );

    log::info!("Requesting owned games from steam API using url: {request_url}");

    let response = match reqwest::get(&request_url).await {
        Ok(response) => response,
        Err(e) => return Err(e),
    };

    match response.json().await {
        Ok(owned_games) => Ok(owned_games),
        Err(e) => Err(e),
    }
}

#[derive(Clone, Deserialize)]
#[serde(crate = "rocket::serde")]
#[allow(dead_code)]
pub struct PlayerSummaries {
    pub response: PlayerSummariesResponse,
}

#[derive(Clone, Deserialize)]
#[serde(crate = "rocket::serde")]
#[allow(dead_code)]
pub struct PlayerSummariesResponse {
    pub players: Vec<PlayerSummary>,
}

//   {
//     "response": {
//       "players": [
//         {
//           "steamid": "76561197990048341",
//           "communityvisibilitystate": 3,
//           "profilestate": 1,
//           "personaname": "Caecus",
//           "profileurl": "https://steamcommunity.com/id/caecus/",
//           "avatar": "https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb.jpg",
//           "avatarmedium": "https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_medium.jpg",
//           "avatarfull": "https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg",
//           "avatarhash": "fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb",
//           "lastlogoff": 1729005871,
//           "personastate": 0,
//           "realname": "Lewis Oaten",
//           "primaryclanid": "103582791474246703",
//           "timecreated": 1180017502,
//           "personastateflags": 0,
//           "loccountrycode": "GB"
//         }
//       ]
//     }
//   }

//   {
//     "response": {
//       "players": [
//         {
//           "steamid": "76561197971093005",
//           "communityvisibilitystate": 3,
//           "profilestate": 1,
//           "personaname": "oatman",
//           "profileurl": "https://steamcommunity.com/id/thelastanomaly/",
//           "avatar": "https://avatars.steamstatic.com/71c4d1d08939b9ae3ac8d71380a1c1588d22b51b.jpg",
//           "avatarmedium": "https://avatars.steamstatic.com/71c4d1d08939b9ae3ac8d71380a1c1588d22b51b_medium.jpg",
//           "avatarfull": "https://avatars.steamstatic.com/71c4d1d08939b9ae3ac8d71380a1c1588d22b51b_full.jpg",
//           "avatarhash": "71c4d1d08939b9ae3ac8d71380a1c1588d22b51b",
//           "lastlogoff": 1728939320,
//           "personastate": 1,
//           "primaryclanid": "103582791429521408",
//           "timecreated": 1101315166,
//           "personastateflags": 0,
//           "loccountrycode": "GB"
//         }
//       ]
//     }
//   }
#[derive(Clone, Deserialize)]
#[serde(crate = "rocket::serde")]
#[allow(dead_code)]
pub struct PlayerSummary {
    pub steamid: String,
    pub personaname: String,
    pub profileurl: String,
    pub avatar: String,
    pub avatarmedium: String,
    pub avatarfull: String,
    pub personastate: i32,
    pub communityvisibilitystate: i32,
    pub profilestate: i32,
    pub lastlogoff: i64,
    pub commentpermission: i32,
    pub realname: Option<String>,
    pub primaryclanid: String,
    pub timecreated: i64,
    pub personastateflags: i32,
    pub gameid: Option<String>,
}

#[allow(dead_code)]
pub async fn get_current_game(
    steam_api_key: &String,
    steam_id: &String,
) -> Result<Option<String>, reqwest::Error> {
    let request_url = format!(
        "http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key={steam_api_key}&steamids={steam_id}",
    );

    log::info!("Requesting current game from steam API using url: {request_url}");

    let response = reqwest::get(&request_url).await?;

    let player_summaries: PlayerSummaries = response.json().await?;

    Ok(player_summaries.response.players[0].gameid.clone())
}
