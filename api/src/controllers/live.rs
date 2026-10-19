//! Live controller: access checks and the write path for Live.

use sqlx::PgPool;

use crate::{
    auth::is_admin,
    controllers::{ensure_user_invited, Error},
    live::log::{self, Audience, NewLogRow, Viewer},
};

/// Longest admin post.
pub const MAX_POST_LEN: usize = 280;

/// The viewer for a signed-in user: invited gamers and admins only.
pub async fn viewer_for(pool: &PgPool, event_id: i32, email: &str) -> Result<Viewer, Error> {
    let admin = is_admin(email);
    if !admin {
        ensure_user_invited(pool, event_id, email).await?;
    }
    Ok(Viewer::Gamer {
        email: email.to_string(),
        admin,
    })
}

/// How long an admin post stays on screen.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PostTtl {
    TenMinutes,
    UntilDismissed,
}

impl PostTtl {
    pub fn parse(value: &str) -> Result<Self, Error> {
        match value {
            "10m" => Ok(Self::TenMinutes),
            "dismiss" => Ok(Self::UntilDismissed),
            other => Err(Error::BadInput(format!(
                "Unknown ttl \"{other}\", expected 10m or dismiss"
            ))),
        }
    }

    const fn as_str(self) -> &'static str {
        match self {
            Self::TenMinutes => "10m",
            Self::UntilDismissed => "dismiss",
        }
    }
}

/// Post a message to everyone at the event (an amber admin toast).
pub async fn post_to_everyone(
    pool: &PgPool,
    event_id: i32,
    admin_email: &str,
    text: &str,
    ttl: PostTtl,
    tv: bool,
) -> Result<i64, Error> {
    let text = text.trim();
    if text.is_empty() {
        return Err(Error::BadInput("A post needs some text".to_string()));
    }
    if text.chars().count() > MAX_POST_LEN {
        return Err(Error::BadInput(format!(
            "A post can be at most {MAX_POST_LEN} characters"
        )));
    }

    let mut tx = pool
        .begin()
        .await
        .map_err(|e| Error::Controller(format!("Unable to start transaction: {e}")))?;
    let rows = log::append(
        &mut tx,
        event_id,
        vec![NewLogRow::new(
            "toast.admin",
            rocket::serde::json::json!({
                "text": text,
                "ttl": ttl.as_str(),
                "tv": tv,
            }),
        )
        .actor(format!("admin:{admin_email}"))
        .audience(Audience::Everyone)],
    )
    .await
    .map_err(|e| Error::Controller(format!("Unable to write the post: {e}")))?;
    tx.commit()
        .await
        .map_err(|e| Error::Controller(format!("Unable to commit the post: {e}")))?;

    crate::util::log_audit(
        pool,
        Some(admin_email.to_string()),
        "live.post".to_string(),
        "event".to_string(),
        Some(event_id.to_string()),
        Some(rocket::serde::json::json!({ "text": text })),
    )
    .await;

    Ok(rows.last().map_or(0, |r| r.seq))
}
