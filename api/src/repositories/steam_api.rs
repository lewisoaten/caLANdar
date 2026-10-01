use rocket::serde::{json::serde_json, Deserialize};

const MAX_RETRIES: u32 = 3;

/// At most `max` characters of `text`, cut on a char boundary (Steam error
/// pages are HTML and may contain multi-byte characters), for log lines.
fn snippet(text: &str, max: usize) -> &str {
    text.char_indices()
        .nth(max)
        .map_or(text, |(i, _)| &text[..i])
}

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
                        log::error!(
                            "Steam API returned status {status}: {}",
                            snippet(&error_text, 500)
                        );

                        if attempts < MAX_RETRIES {
                            log::warn!("Retrying request (attempt {attempts}/{MAX_RETRIES})");
                            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                            continue;
                        }
                        // The body is usually an HTML error page: logged above,
                        // never returned to callers.
                        return Err(format!(
                            "Steam API error after {MAX_RETRIES} attempts (status {status})"
                        ));
                    }

                    // Get the response body as text first for debugging
                    let response_text = match response.text().await {
                        Ok(text) => text,
                        Err(e) => {
                            // `without_url` keeps the API key out of logs and errors.
                            let e = e.without_url();
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
                                snippet(&response_text, 500)
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
                            return Err(format!(
                                "Failed to parse Steam API response after {MAX_RETRIES} attempts: {e}"
                            ));
                        }
                    }
                }
                Err(e) => {
                    let e = e.without_url();
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

    log::info!("Requesting owned games from Steam API for {steam_id}");

    // The request URL carries the API key; strip it from any error.
    reqwest::get(&request_url)
        .await
        .map_err(reqwest::Error::without_url)?
        .json()
        .await
        .map_err(reqwest::Error::without_url)
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

    log::info!("Requesting current game from Steam API for {steam_id}");

    let response = reqwest::get(&request_url)
        .await
        .map_err(reqwest::Error::without_url)?;

    let player_summaries: PlayerSummaries =
        response.json().await.map_err(reqwest::Error::without_url)?;

    Ok(player_summaries
        .response
        .players
        .first()
        .and_then(|p| p.gameid.clone()))
}

#[derive(Clone, Deserialize)]
#[serde(crate = "rocket::serde")]
pub struct ResolveVanityUrlResponse {
    pub steamid: Option<String>,
    pub success: i32,
}

#[derive(Clone, Deserialize)]
#[serde(crate = "rocket::serde")]
pub struct ResolveVanityUrl {
    pub response: ResolveVanityUrlResponse,
}

/// Resolve a `steamcommunity.com/id/<vanity>` name to a `SteamID64`.
/// Returns `Ok(None)` when Steam reports no match.
pub async fn resolve_vanity_url(
    steam_api_key: &String,
    vanity: &str,
) -> Result<Option<String>, reqwest::Error> {
    let request_url = format!(
        "https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key={steam_api_key}&vanityurl={vanity}",
    );

    log::info!("Resolving Steam vanity URL {vanity}");

    let resolved: ResolveVanityUrl = reqwest::get(&request_url)
        .await
        .map_err(reqwest::Error::without_url)?
        .json()
        .await
        .map_err(reqwest::Error::without_url)?;

    Ok(if resolved.response.success == 1 {
        resolved.response.steamid
    } else {
        None
    })
}

/// Hosts Steam serves store artwork from. A host is accepted when it equals
/// one of these or is a subdomain of one (`shared.akamai.steamstatic.com`).
/// The generic `akamaihd.net` is deliberately absent: any Akamai customer
/// can serve from it, so only Steam's own `steamcdn-a` host is allowed.
const STEAM_CDN_HOSTS: [&str; 2] = ["steamstatic.com", "steamcdn-a.akamaihd.net"];

/// Timeout for one store `appdetails` lookup.
const APPDETAILS_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(5);

/// `raw` as an https URL on a Steam CDN host, without query or fragment,
/// or `None` when it is anything else.
pub fn steam_cdn_image_url(raw: &str) -> Option<String> {
    let mut url = reqwest::Url::parse(raw).ok()?;
    if url.scheme() != "https" || url.port().is_some() || !url.username().is_empty() {
        return None;
    }
    let host = url.host_str()?.to_ascii_lowercase();
    let allowed = STEAM_CDN_HOSTS.iter().any(|allowed| {
        host == *allowed
            || host
                .strip_suffix(allowed)
                .is_some_and(|prefix| prefix.ends_with('.'))
    });
    if !allowed {
        return None;
    }
    url.set_query(None);
    url.set_fragment(None);
    Some(url.into())
}

#[derive(Deserialize)]
#[serde(crate = "rocket::serde")]
struct AppDetailsEntry {
    success: bool,
    data: Option<AppDetailsData>,
}

#[derive(Deserialize)]
#[serde(crate = "rocket::serde")]
struct AppDetailsData {
    header_image: Option<String>,
}

/// The validated `header_image` from a store `appdetails` response body.
fn header_image_from_appdetails(appid: u32, body: &str) -> Result<Option<String>, String> {
    let mut parsed: std::collections::HashMap<String, AppDetailsEntry> =
        serde_json::from_str(body).map_err(|e| format!("unparseable appdetails: {e}"))?;
    Ok(parsed
        .remove(&appid.to_string())
        .filter(|entry| entry.success)
        .and_then(|entry| entry.data)
        .and_then(|data| data.header_image)
        .and_then(|raw| steam_cdn_image_url(&raw)))
}

/// Look up a game's store header image. Newer games have no image at the
/// legacy `steam/apps/<appid>/header.jpg` path; the store API knows the
/// hashed path. `Ok(None)` when Steam has no (acceptable) image for it.
pub async fn get_header_image(appid: u32) -> Result<Option<String>, String> {
    let request_url =
        format!("https://store.steampowered.com/api/appdetails?appids={appid}&filters=basic");
    let client = reqwest::Client::builder()
        .timeout(APPDETAILS_TIMEOUT)
        .build()
        .map_err(|e| format!("client: {}", e.without_url()))?;
    let response = client
        .get(&request_url)
        .send()
        .await
        .map_err(|e| format!("request: {}", e.without_url()))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("status {status}"));
    }
    let body = response
        .text()
        .await
        .map_err(|e| format!("body: {}", e.without_url()))?;
    header_image_from_appdetails(appid, &body)
}

#[cfg(test)]
mod tests {
    use super::{header_image_from_appdetails, snippet, steam_cdn_image_url};

    #[test]
    fn accepts_steam_cdn_hosts_and_strips_query() {
        assert_eq!(
            steam_cdn_image_url(
                "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3949040/abc/header.jpg?t=1789134289"
            )
            .as_deref(),
            Some("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3949040/abc/header.jpg")
        );
        assert!(steam_cdn_image_url("https://fastly.steamstatic.com/a.jpg#x").is_some());
        assert!(steam_cdn_image_url("https://steamstatic.com/a.jpg").is_some());
        assert!(steam_cdn_image_url("https://steamcdn-a.akamaihd.net/a.jpg").is_some());
        assert!(steam_cdn_image_url("https://CDN.Cloudflare.SteamStatic.com/a.jpg").is_some());
    }

    #[test]
    fn rejects_other_hosts_and_schemes() {
        for url in [
            "http://shared.akamai.steamstatic.com/a.jpg",
            "https://evilsteamstatic.com/a.jpg",
            "https://steamstatic.com.evil.example/a.jpg",
            "https://evil.akamaihd.net/a.jpg",
            "https://evil-steamcdn-a.akamaihd.net/a.jpg",
            "https://user@shared.akamai.steamstatic.com/a.jpg",
            "https://shared.akamai.steamstatic.com:8443/a.jpg",
            "javascript:alert(1)",
            "data:image/png;base64,AAAA",
            "//shared.akamai.steamstatic.com/a.jpg",
            "not a url",
            "",
        ] {
            assert_eq!(steam_cdn_image_url(url), None, "{url}");
        }
    }

    #[test]
    fn parses_appdetails() {
        let hit = r#"{"42":{"success":true,"data":{"header_image":"https://shared.akamai.steamstatic.com/h.jpg?t=1"}}}"#;
        assert_eq!(
            header_image_from_appdetails(42, hit)
                .ok()
                .flatten()
                .as_deref(),
            Some("https://shared.akamai.steamstatic.com/h.jpg")
        );
        let miss = r#"{"42":{"success":false}}"#;
        assert_eq!(header_image_from_appdetails(42, miss).ok(), Some(None));
        let foreign =
            r#"{"42":{"success":true,"data":{"header_image":"https://evil.example/h.jpg"}}}"#;
        assert_eq!(header_image_from_appdetails(42, foreign).ok(), Some(None));
        let other_app = r#"{"7":{"success":true,"data":{"header_image":"https://shared.akamai.steamstatic.com/h.jpg"}}}"#;
        assert_eq!(header_image_from_appdetails(42, other_app).ok(), Some(None));
        assert!(header_image_from_appdetails(42, "<html>").is_err());
    }

    #[test]
    fn snippet_cuts_on_char_boundaries() {
        assert_eq!(snippet("short", 500), "short");
        assert_eq!(snippet("abcdef", 3), "abc");
        // Slicing bytes at 2 would split the 2-byte "é" and panic.
        assert_eq!(snippet("aéb", 2), "aé");
        assert_eq!(snippet("", 10), "");
    }
}
