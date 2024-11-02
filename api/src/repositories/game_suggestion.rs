use chrono::{DateTime, Utc};
use sqlx::PgPool;

#[derive(sqlx::Type)]
#[sqlx(type_name = "vote", rename_all = "lowercase")]
pub enum GameVote {
    Yes,
    NoVote,
    No, // Not used for now
}

pub struct GameSuggestion {
    pub event_id: i32,
    // game: Game,  // TODO: Figure out how to do this
    pub game_id: i64,
    pub game_name: String,
    pub user_email: String,
    pub self_vote: Option<GameVote>,
    pub votes: Option<i64>,
    pub requested_at: DateTime<Utc>,
    pub last_modified: DateTime<Utc>,
}

pub struct Filter {
    pub event_id: Option<i32>,
    pub game_id: Option<i64>,
}

pub async fn create(
    pool: &PgPool,
    event_id: i32,
    game_id: i64,
    email: String,
) -> Result<GameSuggestion, sqlx::Error> {
    // Insert new game suggestion
    sqlx::query_as!(
        GameSuggestion,
        r#"
        WITH event_game_suggestion_response AS (
            INSERT INTO event_game (event_id, game_id, user_email, last_modified)
                VALUES ($1, $2, $3, NOW())
                RETURNING event_id, game_id, user_email, requested_at, last_modified
        ), event_game_patch_response AS (
            INSERT INTO event_game_vote (event_id, game_id, email, vote)
                SELECT event_id, game_id, user_email, 'yes'::vote AS vote FROM event_game_suggestion_response
                ON CONFLICT (event_id, game_id, email) DO UPDATE SET vote = 'yes'::vote, last_modified = NOW()
                RETURNING event_id, game_id, email, vote, vote_date, last_modified
        ) SELECT
            event_game_suggestion_response.event_id AS event_id,
            event_game_suggestion_response.game_id AS game_id,
            steam_game.name AS game_name,
            event_game_suggestion_response.user_email AS user_email,
            'yes'::vote AS "self_vote: _",
            1 AS "votes: i64",
            event_game_suggestion_response.requested_at AS requested_at,
            event_game_suggestion_response.last_modified AS last_modified
        FROM event_game_suggestion_response
        INNER JOIN steam_game
            ON event_game_suggestion_response.game_id = steam_game.appid
        "#,
        event_id,
        game_id,
        email,
    )
    .fetch_one(pool)
    .await
}

pub async fn filter(
    pool: &PgPool,
    filter: Filter,
    email: String,
) -> Result<Vec<GameSuggestion>, sqlx::Error> {
    let event_id = filter
        .event_id
        .map_or((0, true), |event_id| (event_id, false));

    let game_id = filter.game_id.map_or((0, true), |game_id| (game_id, false));

    sqlx::query_as!(
        GameSuggestion,
        r#"
        SELECT
            event_game.event_id AS event_id,
            event_game.game_id AS game_id,
            steam_game.name AS game_name,
            event_game.user_email AS user_email,
            self_votes.vote AS "self_vote: _",
            count(all_votes.*) AS votes,
            event_game.requested_at AS requested_at,
            event_game.last_modified AS last_modified
        FROM event_game
        INNER JOIN steam_game
            ON event_game.game_id = steam_game.appid
        LEFT JOIN event_game_vote AS self_votes
            ON event_game.event_id = self_votes.event_id
            AND event_game.game_id = self_votes.game_id
            AND LOWER(self_votes.email) = LOWER($5)
        LEFT JOIN event_game_vote AS all_votes
            ON event_game.event_id = all_votes.event_id
            AND event_game.game_id = all_votes.game_id
            AND all_votes.vote = 'yes'::vote
        WHERE (event_game.event_id = $1 OR $2)
        AND (event_game.game_id = $3 OR $4)
        GROUP BY event_game.event_id, event_game.game_id, steam_game.name, self_votes.vote, event_game.requested_at, event_game.last_modified
        "#,
        event_id.0,
        event_id.1,
        game_id.0,
        game_id.1,
        email,
    )
    .fetch_all(pool)
    .await
}

pub async fn edit(
    pool: &PgPool,
    event_id: i32,
    game_id: i64,
    email: String,
    vote: GameVote,
) -> Result<GameSuggestion, sqlx::Error> {
    // Update vote on game suggestion
    sqlx::query_as!(
        GameSuggestion,
        r#"WITH event_game_patch_response AS (
            INSERT INTO event_game_vote (event_id, game_id, email, vote)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (event_id, game_id, email) DO UPDATE SET vote = $4, last_modified = NOW()
                RETURNING event_id, game_id, email, vote, vote_date, last_modified
        ) SELECT
            event_game.event_id AS event_id,
            event_game.game_id AS game_id,
            steam_game.name AS game_name,
            event_game.user_email AS user_email,
            self_vote.vote AS "self_vote: _",
            CASE
                WHEN self_vote.vote = 'yes'::vote THEN count(all_votes.*) + 1
                ELSE count(all_votes.*) - 1
            END AS votes,
            event_game.requested_at AS requested_at,
            event_game.last_modified AS last_modified
        FROM event_game
        INNER JOIN steam_game
            ON event_game.game_id = steam_game.appid
        LEFT JOIN event_game_patch_response AS self_vote
            ON event_game.event_id = self_vote.event_id
            AND event_game.game_id = self_vote.game_id
        LEFT JOIN event_game_vote AS all_votes
            ON event_game.event_id = all_votes.event_id
            AND event_game.game_id = all_votes.game_id
            AND all_votes.vote = 'yes'::vote
        WHERE event_game.event_id = $1
        AND event_game.game_id = $2
        GROUP BY event_game.event_id, event_game.game_id, steam_game.name, steam_game.last_modified, event_game.requested_at, event_game.last_modified, self_vote.vote"#,
        event_id,
        game_id,
        email,
        vote as _,
    )
    .fetch_one(pool)
    .await
}
