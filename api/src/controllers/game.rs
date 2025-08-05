use futures::future::join_all;
use sqlx::PgPool;

use crate::{
    controllers::Error,
    repositories::{game, game_update, steam_api},
    routes::games::SteamGameResponse,
};

// Implement From for SteamGameResponse from Game
impl From<crate::repositories::game::Game> for SteamGameResponse {
    fn from(game: crate::repositories::game::Game) -> Self {
        Self {
            appid: game.appid,
            name: game.name,
            last_modified: game.last_modified,
            rank: game.rank,
        }
    }
}

pub async fn get(
    pool: &PgPool,
    query: String,
    count: i64,
    page: i64,
) -> Result<Vec<SteamGameResponse>, Error> {
    // Build new game Filter
    let game_filter_values = game::Filter { query, count, page };
    // Return all games
    match game::filter(pool, game_filter_values).await {
        Ok(games) => Ok(games.into_iter().map(SteamGameResponse::from).collect()),
        Err(e) => Err(Error::Controller(format!(
            "Unable to get games due to: {e}"
        ))),
    }
}

pub async fn update(pool: &PgPool, steam_api_key: &String) -> Result<(), Error> {
    let Ok(steam_game_update) = game_update::create(pool).await else {
        return Err(Error::Controller(
            "Unable to create game update log".to_string(),
        ));
    };

    let steam_games: steam_api::SteamAPISteamGameApplistWrapperV2 =
        match steam_api::get_app_list_v2(steam_api_key).await {
            Ok(steam_games) => steam_games,
            Err(e) => {
                return Err(Error::Controller(format!(
                    "Error parsing steam game list: {e}"
                )))
            }
        };

    let chunk_size = 20;

    for chunk in steam_games.applist.apps.chunks(chunk_size) {
        let mut insert_promises = vec![];
        for steam_game in chunk {
            insert_promises.push(game::create(
                pool,
                steam_game.appid,
                steam_game_update.id,
                steam_game.name.clone(),
            ));
        }

        let results = join_all(insert_promises).await;

        for result in results {
            if let Err(e) = result {
                log::error!("Failed to insert game: {e}");
                break;
            }
        }

        log::info!("Inserted {chunk_size} games successfully.");
    }

    Ok(())
}
