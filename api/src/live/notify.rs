//! What leaves the building after a step commits (DESIGN.md §8): Web Push
//! for the alerts that matter when your phone is locked, and Discord posts
//! for results, proposals and admin posts.
//!
//! [`notices`] is pure: it compares the state before and after a step. The
//! delivery runs in the background so a slow push service never holds up a
//! command.

use std::sync::OnceLock;

use chrono::{DateTime, Utc};
use rocket::serde::json::json;
use sqlx::PgPool;

use super::{
    engine::Outcome,
    model::{pid, Email, LiveState, Lobby, LobbyStatus},
    push::{self, Subscription, Vapid},
};

/// A push to some people.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Notice {
    pub to: Vec<Email>,
    pub title: String,
    pub body: String,
    /// Replaces an earlier notification with the same tag.
    pub tag: String,
}

/// Everything to send for one step.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Outbox {
    pub pushes: Vec<Notice>,
    pub discord: Vec<String>,
}

impl Outbox {
    pub fn is_empty(&self) -> bool {
        self.pushes.is_empty() && self.discord.is_empty()
    }
}

/// The server's VAPID key, if push is configured.
pub fn vapid() -> Option<&'static Vapid> {
    static VAPID: OnceLock<Option<Vapid>> = OnceLock::new();
    VAPID.get_or_init(Vapid::from_env).as_ref()
}

fn local(state: &LiveState, t: DateTime<Utc>) -> String {
    let tz: chrono_tz::Tz = state
        .event
        .timezone
        .parse()
        .unwrap_or(chrono_tz::Europe::London);
    t.with_timezone(&tz).format("%H:%M").to_string()
}

/// People in for a lobby (pre-joined or its proposer) who aren't in it.
fn interested_elsewhere(state: &LiveState, lobby: &Lobby) -> Vec<Email> {
    let inside: Vec<&str> = state
        .members_of(lobby.id)
        .map(|m| m.email.as_str())
        .collect();
    let mut out: Vec<Email> = state
        .prejoins_of(lobby.id)
        .map(|p| p.email.clone())
        .chain(lobby.proposed_by.clone())
        .filter(|e| !inside.contains(&e.as_str()))
        .collect();
    out.sort();
    out.dedup();
    out
}

/// What to send for a step.
pub fn notices(before: &LiveState, after: &LiveState, outcome: &Outcome) -> Outbox {
    let mut out = Outbox::default();
    for lobby in after.lobbies.values() {
        let was = before.lobbies.get(&lobby.id).map(|l| l.status);
        if was == Some(lobby.status) {
            continue;
        }
        match lobby.status {
            LobbyStatus::Waiting => out.pushes.push(Notice {
                to: interested_elsewhere(after, lobby),
                title: format!("Nobody's in yet: {}", lobby.name),
                body: "Join now, or vote to delay the start. You have 5 minutes.".to_string(),
                tag: format!("grace:{}", lobby.id),
            }),
            LobbyStatus::Grace => out.pushes.push(Notice {
                to: interested_elsewhere(after, lobby),
                title: format!("{} is starting: join now", lobby.name),
                body: "Anyone still elsewhere in 5 minutes drops out.".to_string(),
                tag: format!("grace:{}", lobby.id),
            }),
            LobbyStatus::Confirmed if was == Some(LobbyStatus::Proposed) => {
                if let Some(proposer) = &lobby.proposed_by {
                    out.pushes.push(Notice {
                        to: vec![proposer.clone()],
                        title: format!("{} is on", lobby.name),
                        body: format!("Someone backed it: {}.", local(after, lobby.start)),
                        tag: format!("backed:{}", lobby.id),
                    });
                }
            }
            _ => {}
        }
    }
    for toast in &outcome.personal {
        if toast.kind == "nudge" {
            out.pushes.push(Notice {
                to: vec![toast.to.clone()],
                title: "The admins are looking for you".to_string(),
                body: toast.data["text"]
                    .as_str()
                    .unwrap_or("Are you on your way?")
                    .to_string(),
                tag: format!("nudge:{}", pid(&toast.to)),
            });
        }
    }
    out.pushes.retain(|n| !n.to.is_empty());

    for entry in &outcome.feed {
        let lobby = entry.lobby_id.and_then(|id| after.lobbies.get(&id));
        let who = entry
            .actor
            .as_deref()
            .and_then(|e| after.people.get(e))
            .map(super::model::Person::display_name)
            .unwrap_or_default();
        match entry.kind {
            "vote.result" => {
                let title = entry.data["title"].as_str().unwrap_or("A vote").to_string();
                let winner = entry.data["winnerOptionId"].as_str().and_then(|id| {
                    entry.data["options"]
                        .as_array()?
                        .iter()
                        .find(|o| o["id"].as_str() == Some(id))?["name"]
                        .as_str()
                        .map(ToString::to_string)
                });
                let badge = entry.data["badge"].as_str().unwrap_or("FINAL");
                let badge = badge.to_lowercase();
                out.discord.push(winner.map_or_else(
                    || format!("**{title}** ({badge})"),
                    |w| format!("**{title}** → {w} ({badge})"),
                ));
            }
            "lobby.backed" => {
                if let Some(l) = lobby {
                    out.discord.push(format!(
                        "**{}** at {} is on: backed",
                        l.name,
                        local(after, l.start)
                    ));
                }
            }
            "lobby.proposed" => {
                if let Some(l) = lobby {
                    out.discord.push(format!(
                        "{who} proposed **{}** at {}: it needs one backer in the next 5 minutes",
                        l.name,
                        local(after, l.start)
                    ));
                }
            }
            _ => {}
        }
    }
    out
}

/// Send an outbox in the background.
pub fn dispatch(pool: &PgPool, event_id: i32, webhook: Option<String>, outbox: Outbox) {
    if outbox.is_empty() {
        return;
    }
    let pool = pool.clone();
    tokio::spawn(async move {
        if let Some(url) = webhook.filter(|u| !u.is_empty()) {
            for message in &outbox.discord {
                post_discord(&url, message).await;
            }
        }
        if let Some(vapid) = vapid() {
            for notice in &outbox.pushes {
                deliver(&pool, vapid, event_id, notice).await;
            }
        }
    });
}

/// Post a message to a Discord webhook. Best effort.
pub async fn post_discord(url: &str, content: &str) {
    let result = reqwest::Client::new()
        .post(url)
        .json(&json!({ "content": content, "allowed_mentions": { "parse": [] } }))
        .send()
        .await;
    if let Err(e) = result {
        ::log::warn!("live: Discord webhook failed: {}", e.without_url());
    }
}

async fn deliver(pool: &PgPool, vapid: &Vapid, event_id: i32, notice: &Notice) {
    let subs = sqlx::query_as::<_, (i64, String, String, String)>(
        r"
        SELECT id, endpoint, p256dh, auth FROM live_push_subscription
        WHERE event_id = $1 AND email = ANY($2)
        ",
    )
    .bind(event_id)
    .bind(&notice.to)
    .fetch_all(pool)
    .await
    .unwrap_or_default();
    let payload = json!({
        "title": notice.title,
        "body": notice.body,
        "tag": notice.tag,
        "url": format!("/events/{event_id}/live"),
    });
    for (id, endpoint, p256dh, auth) in subs {
        let sub = Subscription {
            endpoint,
            p256dh,
            auth,
        };
        match push::send(vapid, &sub, &payload).await {
            Ok(()) => {}
            Err(push::PushError::Gone) => {
                let _ = sqlx::query("DELETE FROM live_push_subscription WHERE id = $1")
                    .bind(id)
                    .execute(pool)
                    .await;
            }
            Err(push::PushError::Failed(e)) => ::log::warn!("live: push failed: {e}"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::live::engine::{apply, tests as t, Command, Input, LobbyRef};

    #[test]
    fn nobody_in_pushes_to_the_people_pre_joined_and_results_go_to_discord() {
        let mut s = t::state();
        apply(
            &mut s,
            t::cmd(
                t::admin(),
                Command::CreateLobby(crate::live::engine::LobbyEdit {
                    game_id: 1,
                    game_name: "DRG".into(),
                    start: t::t(20, 0),
                    minutes: 60,
                }),
            ),
            t::t(12, 0),
        )
        .expect("planned");
        let id = *s.lobbies.keys().next().expect("lobby");
        apply(
            &mut s,
            t::cmd(
                t::gamer("ana@x.io"),
                Command::Prejoin {
                    lobby: LobbyRef::Stored(id),
                    team: None,
                    random: false,
                },
            ),
            t::t(19, 0),
        )
        .expect("pre-joined");
        let before = s.clone();
        let outcome = apply(&mut s, Input::Tick, t::t(20, 0)).expect("tick");
        let outbox = notices(&before, &s, &outcome);
        assert_eq!(outbox.pushes.len(), 1);
        assert_eq!(outbox.pushes[0].to, vec!["ana@x.io".to_string()]);
        assert!(outbox.pushes[0].title.starts_with("Nobody's in yet"));
        assert!(outbox.discord.is_empty());
    }
}
