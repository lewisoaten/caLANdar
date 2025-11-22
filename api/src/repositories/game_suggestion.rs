use chrono::{DateTime, Utc};
use sqlx::PgPool;

#[derive(Clone, sqlx::Type)]
#[sqlx(type_name = "vote", rename_all = "lowercase")]
pub enum GameVote {
    Yes,
    NoVote,
    No, // Not used for now
}

#[allow(dead_code)]
#[derive(Clone)]
pub struct GameSuggestion {
    pub event_id: i32,
    pub game_id: i64,
    pub game_name: String,
    pub user_email: String,
    pub comment: Option<String>,
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
    comment: Option<String>,
) -> Result<GameSuggestion, sqlx::Error> {
    // Insert new game suggestion
    sqlx::query_as!(
        GameSuggestion,
        r#"
        WITH event_game_suggestion_response AS (
            INSERT INTO event_game (event_id, game_id, user_email, comment, last_modified)
                VALUES ($1, $2, $3, $4, NOW())
                RETURNING event_id, game_id, user_email, comment, requested_at, last_modified
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
            event_game_suggestion_response.comment AS comment,
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
        comment,
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
            event_game.comment AS comment,
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
        GROUP BY event_game.event_id, event_game.game_id, steam_game.name, event_game.user_email, event_game.comment, self_votes.vote, event_game.requested_at, event_game.last_modified
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
            event_game.comment AS comment,
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
        GROUP BY event_game.event_id, event_game.game_id, steam_game.name, steam_game.last_modified, event_game.user_email, event_game.comment, event_game.requested_at, event_game.last_modified, self_vote.vote"#,
        event_id,
        game_id,
        email,
        vote as _,
    )
    .fetch_one(pool)
    .await
}

pub async fn update_comment(
    pool: &PgPool,
    event_id: i32,
    game_id: i64,
    email: String,
    comment: Option<String>,
) -> Result<GameSuggestion, sqlx::Error> {
    // Update comment on game suggestion
    // First, check that the user is the owner of the game suggestion
    let existing = sqlx::query!(
        r#"
        SELECT user_email
        FROM event_game
        WHERE event_id = $1 AND game_id = $2
        "#,
        event_id,
        game_id,
    )
    .fetch_one(pool)
    .await?;

    // Check if the user owns this suggestion
    if existing.user_email.to_lowercase() != email.to_lowercase() {
        return Err(sqlx::Error::RowNotFound);
    }

    // Update the comment
    sqlx::query_as!(
        GameSuggestion,
        r#"
        WITH event_game_update_response AS (
            UPDATE event_game
            SET comment = $4, last_modified = NOW()
            WHERE event_id = $1 AND game_id = $2
            RETURNING event_id, game_id, user_email, comment, requested_at, last_modified
        ) SELECT
            event_game_update_response.event_id AS event_id,
            event_game_update_response.game_id AS game_id,
            steam_game.name AS game_name,
            event_game_update_response.user_email AS user_email,
            event_game_update_response.comment AS comment,
            self_vote.vote AS "self_vote: _",
            count(all_votes.*) AS votes,
            event_game_update_response.requested_at AS requested_at,
            event_game_update_response.last_modified AS last_modified
        FROM event_game_update_response
        INNER JOIN steam_game
            ON event_game_update_response.game_id = steam_game.appid
        LEFT JOIN event_game_vote AS self_vote
            ON event_game_update_response.event_id = self_vote.event_id
            AND event_game_update_response.game_id = self_vote.game_id
            AND LOWER(self_vote.email) = LOWER($3)
        LEFT JOIN event_game_vote AS all_votes
            ON event_game_update_response.event_id = all_votes.event_id
            AND event_game_update_response.game_id = all_votes.game_id
            AND all_votes.vote = 'yes'::vote
        GROUP BY event_game_update_response.event_id, event_game_update_response.game_id, steam_game.name, event_game_update_response.user_email, event_game_update_response.comment, event_game_update_response.requested_at, event_game_update_response.last_modified, self_vote.vote
        "#,
        event_id,
        game_id,
        email,
        comment,
    )
    .fetch_one(pool)
    .await
}
