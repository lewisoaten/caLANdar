use rocket::serde::Deserialize;

#[derive(Clone, Deserialize)]
#[serde(crate = "rocket::serde")]
pub struct SteamAPISteamGameV2 {
    pub appid: i64,
    pub name: String,
}

#[derive(Clone, Deserialize)]
#[serde(crate = "rocket::serde")]
pub struct SteamAPISteamGameApplistV2 {
    pub apps: Vec<SteamAPISteamGameV2>,
}

#[derive(Clone, Deserialize)]
#[serde(crate = "rocket::serde")]
pub struct SteamAPISteamGameApplistWrapperV2 {
    pub applist: SteamAPISteamGameApplistV2,
}

pub async fn get_app_list_v2(
    steam_api_key: &String,
) -> Result<SteamAPISteamGameApplistWrapperV2, reqwest::Error> {
    let request_url =
        format!("https://api.steampowered.com/ISteamApps/GetAppList/v2/?key={steam_api_key}",);

    log::info!(
        "Requesting games from steam API v2 using url: {}",
        request_url
    );

    let response = match reqwest::get(&request_url).await {
        Ok(response) => response,
        Err(e) => return Err(e),
    };

    match response.json().await {
        Ok(steam_games) => Ok(steam_games),
        Err(e) => Err(e),
    }
}

#[derive(Clone, Deserialize)]
#[serde(crate = "rocket::serde")]
pub struct SteamAPIOwnedGame {
    pub appid: i64,
    pub playtime_2weeks: Option<i32>,
    pub playtime_forever: i32,
    pub playtime_windows_forever: i32,
    pub playtime_mac_forever: i32,
    pub playtime_linux_forever: i32,
    pub playtime_disconnected: i32,
    pub rtime_last_played: i64,
}

#[derive(Clone, Deserialize)]
#[serde(crate = "rocket::serde")]
pub struct SteamAPIOwnedGamesListResponse {
    pub game_count: i64,
    pub games: Vec<SteamAPIOwnedGame>,
}

#[derive(Clone, Deserialize)]
#[serde(crate = "rocket::serde")]
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

    log::info!(
        "Requesting owned games from steam API using url: {}",
        request_url
    );

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
pub struct PlayerSummaries {
    pub response: PlayerSummariesResponse,
}

#[derive(Clone, Deserialize)]
#[serde(crate = "rocket::serde")]
pub struct PlayerSummariesResponse {
    pub players: Vec<PlayerSummary>,
}

#[derive(Clone, Deserialize)]
#[serde(crate = "rocket::serde")]
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

pub async fn get_current_game(
    steam_api_key: &String,
    steam_id: &String,
) -> Result<Option<String>, reqwest::Error> {
    let request_url = format!(
        "http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key={steam_api_key}&steamids={steam_id}",
    );

    log::info!(
        "Requesting current game from steam API using url: {}",
        request_url
    );

    let response = reqwest::get(&request_url).await?;

    let player_summaries: PlayerSummaries = response.json().await?;

    Ok(player_summaries.response.players[0].gameid.clone())
}
