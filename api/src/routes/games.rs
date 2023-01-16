use crate::auth::{AdminUser, User};
use chrono::{prelude::Utc, DateTime, NaiveDateTime};
use futures::future::join_all;
use rocket::{
    get, post,
    serde::{json::Json, Deserialize, Serialize},
    State,
};
use rocket_okapi::okapi::schemars;
use rocket_okapi::okapi::schemars::JsonSchema;
use rocket_okapi::openapi;
use sqlx::postgres::PgPool;

#[derive(Serialize, JsonSchema, Debug)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
struct SteamGameUpdate {
    id: i32,
    update_time: DateTime<Utc>,
}

#[derive(Serialize, Deserialize, JsonSchema, Debug)]
#[serde(crate = "rocket::serde")]
struct SteamAPISteamGame {
    appid: i64,
    name: String,
    last_modified: i64,
    price_change_number: Option<i32>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(crate = "rocket::serde")]
struct SteamAPISteamGameResponse {
    apps: Vec<SteamAPISteamGame>,
    have_more_results: Option<bool>,
    last_appid: Option<i64>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(crate = "rocket::serde")]
struct SteamAPISteamGameResponseWrapper {
    response: SteamAPISteamGameResponse,
}

// {"applist":{"apps":[{"appid":1941401,"name":""},{"appid":2170321,"name":""},{"appid":1825161,"name":""}]}}

#[allow(clippy::too_many_lines)]
#[openapi(tag = "Games")]
#[post("/steam-game-update?<full>&<_as_admin>")]
/// Update the list of games from the Steam API
pub async fn steam_game_update(
    pool: &State<PgPool>,
    steam_api_key: &State<String>,
    full: Option<bool>,
    _as_admin: Option<bool>,
    _user: AdminUser,
) -> Result<Json<()>, rocket::response::status::BadRequest<String>> {
    let blank_steam_game_update = SteamGameUpdate {
        id: 0,
        update_time: DateTime::<Utc>::from_utc(
            NaiveDateTime::from_timestamp_opt(0, 0).expect("Timestamp 0 is valid."),
            Utc,
        ),
    };

    let last_update: SteamGameUpdate = match full {
        Some(true) => blank_steam_game_update,
        _ => match sqlx::query_as!(
            SteamGameUpdate,
            "SELECT id, update_time FROM steam_game_update ORDER BY update_time DESC LIMIT 1",
        )
        .fetch_one(pool.inner())
        .await
        {
            Ok(last_update) => {
                log::info!(
                    "Found last update time, checking for updates since {:?}",
                    last_update
                );
                last_update
            }
            Err(e) => {
                log::info!("Unable to get last update time: {}", e);
                // Return earliest unix timestamp
                blank_steam_game_update
            }
        },
    };

    // Insert new event and return it
    let steam_game_update: SteamGameUpdate = match sqlx::query_as!(
        SteamGameUpdate,
        "INSERT INTO steam_game_update DEFAULT VALUES RETURNING id, update_time",
    )
    .fetch_one(pool.inner())
    .await
    {
        Ok(steam_game_update) => steam_game_update,
        Err(_) => {
            return Err(rocket::response::status::BadRequest(Some(
                "Error getting database ID".to_string(),
            )))
        }
    };

    let mut has_more_results = true;
    let mut last_appid = 0;

    while has_more_results {
        let request_url = format!("https://api.steampowered.com/IStoreService/GetAppList/v1/?key={key}&if_modified_since={if_modified_since}&last_appid={last_appid}&max_results={max_results}&include_games=true&include_dlc=true",
                                key = steam_api_key,
                                if_modified_since = last_update.update_time.timestamp(),
                                last_appid = last_appid,
                                max_results = 50000,
                            );
        log::info!("Requesting games from steam API using url: {}", request_url);
        let response = match reqwest::get(&request_url).await {
            Ok(response) => response,
            Err(e) => {
                return Err(rocket::response::status::BadRequest(Some(format!(
                    "Error getting steam game list: {}",
                    e
                ))))
            }
        };

        let steam_games: SteamAPISteamGameResponseWrapper = match response.json().await {
            Ok(steam_games) => steam_games,
            Err(e) => {
                return Err(rocket::response::status::BadRequest(Some(format!(
                    "Error parsing steam game list: {}",
                    e
                ))))
            }
        };
        log::info!(
            "Parsed steam games response. Last appid: {}, more results: {}, count of results: {}",
            steam_games.response.last_appid.unwrap_or(0),
            steam_games.response.have_more_results.unwrap_or(false),
            steam_games.response.apps.len()
        );

        has_more_results = steam_games.response.have_more_results.unwrap_or(false);
        last_appid = steam_games.response.last_appid.unwrap_or(0);

        let mut insert_promises = vec![];

        for steam_game in &steam_games.response.apps {
            let insert_promise = sqlx::query!(
                "INSERT INTO steam_game (appid, update_id, name, last_modified)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (appid) DO UPDATE SET update_id = $2, name = $3, last_modified = $4",
                steam_game.appid,
                steam_game_update.id,
                steam_game.name,
                DateTime::<Utc>::from_utc(
                    if let Some(naive_date_time) =
                        NaiveDateTime::from_timestamp_opt(steam_game.last_modified, 0)
                    {
                        naive_date_time
                    } else {
                        log::warn!(
                            "Unable to parse last modified date for steam game: {}",
                            steam_game.appid
                        );
                        continue;
                    },
                    Utc
                ),
            )
            .execute(pool.inner());

            insert_promises.push(insert_promise);
        }

        join_all(insert_promises).await;
        log::info!(
            "Inserted or updated {} steam games",
            steam_games.response.apps.len()
        );
    }

    Ok(Json(()))
}

#[derive(Serialize, Deserialize, JsonSchema, Debug)]
#[serde(crate = "rocket::serde")]
struct SteamAPISteamGameV2 {
    appid: i64,
    name: String,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(crate = "rocket::serde")]
struct SteamAPISteamGameApplistV2 {
    apps: Vec<SteamAPISteamGameV2>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(crate = "rocket::serde")]
struct SteamAPISteamGameApplistWrapperV2 {
    applist: SteamAPISteamGameApplistV2,
}

// {"applist":{"apps":[{"appid":1941401,"name":""},{"appid":2170321,"name":""},{"appid":1825161,"name":""}]}}

#[allow(clippy::too_many_lines)]
#[openapi(tag = "Games")]
#[post("/steam-game-update-v2?<_as_admin>")]
/// Update the list of games from the Steam API v2
pub async fn steam_game_update_v2(
    pool: &State<PgPool>,
    steam_api_key: &State<String>,
    _as_admin: Option<bool>,
    _user: AdminUser,
) -> Result<Json<()>, rocket::response::status::BadRequest<String>> {
    // Insert new game update event and return it
    let steam_game_update: SteamGameUpdate = match sqlx::query_as!(
        SteamGameUpdate,
        "INSERT INTO steam_game_update DEFAULT VALUES RETURNING id, update_time",
    )
    .fetch_one(pool.inner())
    .await
    {
        Ok(steam_game_update) => steam_game_update,
        Err(_) => {
            return Err(rocket::response::status::BadRequest(Some(
                "Error getting database ID".to_string(),
            )))
        }
    };

    let request_url = format!(
        "https://api.steampowered.com/ISteamApps/GetAppList/v2/?key={key}",
        key = steam_api_key,
    );
    log::info!(
        "Requesting games from steam API v2 using url: {}",
        request_url
    );
    let response = match reqwest::get(&request_url).await {
        Ok(response) => response,
        Err(e) => {
            return Err(rocket::response::status::BadRequest(Some(format!(
                "Error getting steam game list: {}",
                e
            ))))
        }
    };

    let steam_games: SteamAPISteamGameApplistWrapperV2 = match response.json().await {
        Ok(steam_games) => steam_games,
        Err(e) => {
            return Err(rocket::response::status::BadRequest(Some(format!(
                "Error parsing steam game list: {}",
                e
            ))))
        }
    };

    let mut insert_promises = vec![];

    for steam_game in &steam_games.applist.apps {
        let insert_promise = sqlx::query!(
            "INSERT INTO steam_game (appid, update_id, name, last_modified)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (appid) DO UPDATE SET update_id = $2, name = $3, last_modified = NOW()",
            steam_game.appid,
            steam_game_update.id,
            steam_game.name,
        )
        .execute(pool.inner());

        insert_promises.push(insert_promise);
    }

    join_all(insert_promises).await;
    log::info!(
        "Inserted or updated {} steam games",
        steam_games.applist.apps.len()
    );

    Ok(Json(()))
}

#[derive(Serialize, Deserialize, JsonSchema, Debug)]
#[serde(crate = "rocket::serde")]
pub struct SteamGameResponse {
    appid: i64,
    name: String,
    last_modified: DateTime<Utc>,
    rank: Option<f32>,
}

custom_errors!(SteamGameError, Unauthorized, BadRequest);

#[openapi(tag = "Games")]
#[get("/steam-game?<query>&<page>")]
pub async fn get_steam_game(
    query: String,
    page: Option<i64>,
    pool: &State<PgPool>,
    _user: User,
) -> Result<Json<Vec<SteamGameResponse>>, SteamGameError> {
    const COUNT: i64 = 10;

    let page = page.unwrap_or(0);

    // Return games matching search query
    match sqlx::query_as!(
        SteamGameResponse,
        r#"
        SELECT appid, name, last_modified, ts_rank_cd(to_tsvector('english', name), query, 32 /* rank/(rank+1) */) AS rank
        FROM steam_game, plainto_tsquery('english', $1) query
        WHERE query @@ to_tsvector('english', name)
        ORDER BY lower(name) LIKE lower($1) DESC, rank DESC
        LIMIT $2
        OFFSET $3
        "#,
        query,
        COUNT,
        page * COUNT,
    )
    .fetch_all(pool.inner())
    .await
    {
        Ok(games) => Ok(Json(games)),
        Err(e) => Err(SteamGameError::BadRequest(format!(
            "Error searching steam games: {}",
            e
        ))),
    }
}
