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
