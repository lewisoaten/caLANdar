use sha2::{Digest, Sha256};
use sqlx::PgPool;

/// Links are valid for 30 minutes, so anything older than this can no longer
/// be replayed and its row is dead weight.
const KEEP_FOR: &str = "1 day";

fn hash(token: &str) -> String {
    Sha256::digest(token.as_bytes())
        .iter()
        .fold(String::with_capacity(64), |mut out, b| {
            use std::fmt::Write;
            let _ = write!(out, "{b:02x}");
            out
        })
}

/// Spend a sign-in token. Returns `true` the first time it is seen and `false`
/// for every later attempt. The insert is atomic, so two concurrent requests
/// with the same link cannot both win.
pub async fn consume(pool: &PgPool, token: &str) -> Result<bool, sqlx::Error> {
    let inserted = sqlx::query(
        "INSERT INTO used_login_tokens (token_hash) VALUES ($1) ON CONFLICT DO NOTHING",
    )
    .bind(hash(token))
    .execute(pool)
    .await?
    .rows_affected();

    // Housekeeping rides along with real use; failing to prune is harmless.
    if let Err(e) = sqlx::query(&format!(
        "DELETE FROM used_login_tokens WHERE used_at < NOW() - INTERVAL '{KEEP_FOR}'"
    ))
    .execute(pool)
    .await
    {
        log::warn!("Could not prune used_login_tokens: {e}");
    }

    Ok(inserted == 1)
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    #[test]
    fn hash_is_stable_hex_sha256() {
        assert_eq!(
            hash("abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[ignore = "needs a database"]
    #[sqlx::test(migrations = "./migrations")]
    async fn a_token_can_only_be_spent_once(pool: PgPool) {
        assert!(consume(&pool, "v4.local.one").await.unwrap());
        assert!(!consume(&pool, "v4.local.one").await.unwrap());
        assert!(consume(&pool, "v4.local.two").await.unwrap());
    }

    #[ignore = "needs a database"]
    #[sqlx::test(migrations = "./migrations")]
    async fn old_rows_are_pruned(pool: PgPool) {
        sqlx::query(
            "INSERT INTO used_login_tokens (token_hash, used_at) VALUES ('old', NOW() - INTERVAL '2 days')",
        )
        .execute(&pool)
        .await
        .unwrap();
        consume(&pool, "fresh").await.unwrap();
        let left: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM used_login_tokens")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(left, 1);
    }
}
