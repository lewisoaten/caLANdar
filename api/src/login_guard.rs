//! Abuse protection for the unauthenticated `POST /login`.
//!
//! `/login` emails a sign-in link to whatever address it is given, so left
//! alone it is a free "send an email to anyone" button. Two defences live here:
//!
//! * [`LoginLimiter`]: in-memory sliding-window limits per address, per client
//!   IP, and overall. State is per Cloud Run instance, so the effective limit
//!   is a small multiple of the configured one; that is fine for a backstop.
//! * [`Turnstile`]: optional Cloudflare Turnstile verification, enabled by
//!   setting `TURNSTILE_SECRET_KEY`.

use std::collections::{HashMap, VecDeque};
use std::sync::{Mutex, PoisonError};
use std::time::{Duration, Instant};

use rocket::request::{FromRequest, Outcome, Request};
use rocket::serde::json::{json, Value};
use rocket::serde::Deserialize;

/// Sign-in links per address per window. A real user who lost the email needs
/// a couple of retries, not dozens.
const PER_EMAIL: usize = 3;
const PER_EMAIL_WINDOW: Duration = Duration::from_mins(30);

/// Per client IP. Generous because a LAN party shares one public address.
const PER_IP: usize = 30;
/// Across everyone: caps what a distributed run can send through Resend.
const GLOBAL: usize = 120;
const HOUR: Duration = Duration::from_hours(1);

/// Keys kept before idle ones are swept, bounding memory under a flood of
/// distinct addresses.
const SWEEP_AT: usize = 10_000;

#[derive(Debug, PartialEq, Eq)]
pub struct Limited {
    pub retry_after: Duration,
}

#[derive(Default)]
struct Windows {
    hits: HashMap<String, VecDeque<Instant>>,
}

impl Windows {
    /// Drop hits older than `window`, then report how long until the oldest
    /// remaining hit expires if `limit` is already reached.
    fn blocked(
        &mut self,
        key: &str,
        limit: usize,
        window: Duration,
        now: Instant,
    ) -> Option<Duration> {
        let queue = self.hits.get_mut(key)?;
        while queue
            .front()
            .is_some_and(|t| now.duration_since(*t) >= window)
        {
            queue.pop_front();
        }
        if queue.len() >= limit {
            queue
                .front()
                .map(|oldest| window.saturating_sub(now.duration_since(*oldest)))
        } else {
            None
        }
    }

    fn record(&mut self, key: &str, now: Instant) {
        self.hits.entry(key.to_string()).or_default().push_back(now);
    }

    fn sweep(&mut self, now: Instant) {
        if self.hits.len() > SWEEP_AT {
            self.hits
                .retain(|_, q| q.back().is_some_and(|t| now.duration_since(*t) < HOUR));
        }
    }
}

#[derive(Default)]
pub struct LoginLimiter {
    windows: Mutex<Windows>,
}

impl LoginLimiter {
    /// Would a request for `email` (already normalised) from `ip` be refused
    /// right now? Records nothing, so it is safe to call before the CAPTCHA:
    /// callers who have not proven they are human cannot use up anyone's
    /// quota, only be turned away early.
    pub fn peek(&self, email: &str, ip: Option<&str>) -> Result<(), Limited> {
        self.peek_at(email, ip, Instant::now())
    }

    pub fn peek_at(&self, email: &str, ip: Option<&str>, now: Instant) -> Result<(), Limited> {
        let mut w = self.windows.lock().unwrap_or_else(PoisonError::into_inner);
        Self::refusal(&mut w, email, ip, now)
    }

    /// Count a sign-in request, atomically re-checking the limits first (they
    /// may have filled since [`peek`](Self::peek), and two requests can race).
    /// Nothing is recorded when the request is refused, so a blocked caller
    /// cannot extend their own lockout by hammering. Call this only for
    /// requests that have passed the CAPTCHA and are about to send an email.
    pub fn check(&self, email: &str, ip: Option<&str>) -> Result<(), Limited> {
        self.check_at(email, ip, Instant::now())
    }

    pub fn check_at(&self, email: &str, ip: Option<&str>, now: Instant) -> Result<(), Limited> {
        let mut w = self.windows.lock().unwrap_or_else(PoisonError::into_inner);
        Self::refusal(&mut w, email, ip, now)?;
        w.sweep(now);
        w.record(&format!("email:{email}"), now);
        if let Some(ip) = ip {
            w.record(&format!("ip:{ip}"), now);
        }
        w.record("global", now);
        drop(w);
        Ok(())
    }

    fn refusal(
        w: &mut Windows,
        email: &str,
        ip: Option<&str>,
        now: Instant,
    ) -> Result<(), Limited> {
        let mut worst: Option<Duration> = None;
        let mut note = |d: Option<Duration>| {
            if let Some(d) = d {
                worst = Some(worst.map_or(d, |w| w.max(d)));
            }
        };
        note(w.blocked(&format!("email:{email}"), PER_EMAIL, PER_EMAIL_WINDOW, now));
        if let Some(ip) = ip {
            note(w.blocked(&format!("ip:{ip}"), PER_IP, HOUR, now));
        }
        note(w.blocked("global", GLOBAL, HOUR, now));
        worst.map_or(Ok(()), |retry_after| Err(Limited { retry_after }))
    }
}

/// Who is calling: the address and browser string, for throttling and for the
/// audit log. Netlify proxies `/api/*` to Cloud Run, so the TCP peer is always
/// Netlify; the real client is the first `X-Forwarded-For` entry. A caller can
/// forge that header to dodge the per-IP limit, which is why the per-address
/// and global limits exist too.
pub struct ClientMeta {
    /// Only ever a parsed IP address, so it is safe for `audit_log.ip_address`
    /// (`VARCHAR(45)`) however much junk a caller puts in the header.
    pub ip: Option<String>,
    pub user_agent: Option<String>,
}

/// Longest browser string kept; they are attacker controlled.
const MAX_USER_AGENT: usize = 300;

fn parse_forwarded_ip(header: &str) -> Option<String> {
    header
        .split(',')
        .next()
        .map(str::trim)
        .and_then(|first| first.parse::<std::net::IpAddr>().ok())
        .map(|ip| ip.to_string())
}

#[rocket::async_trait]
impl<'r> FromRequest<'r> for ClientMeta {
    type Error = std::convert::Infallible;

    async fn from_request(request: &'r Request<'_>) -> Outcome<Self, Self::Error> {
        let ip = request
            .headers()
            .get_one("X-Forwarded-For")
            .and_then(parse_forwarded_ip)
            .or_else(|| request.remote().map(|a| a.ip().to_string()));
        let user_agent = request
            .headers()
            .get_one("User-Agent")
            .map(|ua| ua.chars().take(MAX_USER_AGENT).collect());
        Outcome::Success(Self { ip, user_agent })
    }
}

impl rocket_okapi::request::OpenApiFromRequest<'_> for ClientMeta {
    fn from_request_input(
        _gen: &mut rocket_okapi::gen::OpenApiGenerator,
        _name: String,
        _required: bool,
    ) -> rocket_okapi::Result<rocket_okapi::request::RequestHeaderInput> {
        Ok(rocket_okapi::request::RequestHeaderInput::None)
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum TurnstileError {
    /// No token was supplied.
    Missing,
    /// Cloudflare said the token is not valid.
    Rejected,
    /// Cloudflare could not be asked. Treated as a refusal (fail closed).
    Unavailable,
}

#[derive(Deserialize)]
#[serde(crate = "rocket::serde")]
struct SiteVerify {
    success: bool,
}

/// Cloudflare Turnstile verifier. With no secret configured every request
/// passes, so local development and tests need no keys.
pub struct Turnstile {
    secret: Option<String>,
    client: reqwest::Client,
}

const SITEVERIFY: &str = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

impl Turnstile {
    pub fn from_env() -> Self {
        let secret = std::env::var("TURNSTILE_SECRET_KEY")
            .ok()
            .filter(|s| !s.is_empty());
        if secret.is_some() {
            log::info!("Turnstile enabled for sign-in.");
        } else {
            log::warn!("TURNSTILE_SECRET_KEY not set: sign-in has no CAPTCHA.");
        }
        Self {
            secret,
            client: reqwest::Client::new(),
        }
    }

    pub async fn verify(
        &self,
        token: Option<&str>,
        ip: Option<&str>,
    ) -> Result<(), TurnstileError> {
        let Some(secret) = &self.secret else {
            return Ok(());
        };
        let Some(token) = token.filter(|t| !t.is_empty()) else {
            return Err(TurnstileError::Missing);
        };
        let mut body = json!({ "secret": secret, "response": token });
        if let Some(ip) = ip {
            body["remoteip"] = Value::from(ip);
        }
        let response = self
            .client
            .post(SITEVERIFY)
            .timeout(Duration::from_secs(5))
            .json(&body)
            .send()
            .await
            .map_err(|e| {
                log::error!("Turnstile siteverify request failed: {e}");
                TurnstileError::Unavailable
            })?;
        let verdict: SiteVerify = response.json().await.map_err(|e| {
            log::error!("Turnstile siteverify response unreadable: {e}");
            TurnstileError::Unavailable
        })?;
        if verdict.success {
            Ok(())
        } else {
            Err(TurnstileError::Rejected)
        }
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    #[test]
    fn peeking_never_uses_up_quota() {
        let (l, t) = limiter();
        // A caller who never gets past the CAPTCHA only ever peeks.
        for _ in 0..(GLOBAL * 2) {
            assert!(l.peek_at("victim@x.co", Some("1.1.1.1"), t).is_ok());
        }
        for _ in 0..PER_EMAIL {
            assert!(l.check_at("victim@x.co", Some("1.1.1.1"), t).is_ok());
        }
    }

    #[test]
    fn peek_sees_a_full_quota() {
        let (l, t) = limiter();
        for _ in 0..PER_EMAIL {
            l.check_at("a@b.co", None, t).unwrap();
        }
        assert_eq!(
            l.peek_at("a@b.co", None, t).unwrap_err().retry_after,
            PER_EMAIL_WINDOW
        );
        // ...and still records nothing of its own.
        assert!(l.peek_at("a@b.co", None, t + PER_EMAIL_WINDOW).is_ok());
    }

    #[test]
    fn forwarded_ip_takes_the_first_valid_entry_only() {
        assert_eq!(
            parse_forwarded_ip("203.0.113.9, 10.0.0.1").as_deref(),
            Some("203.0.113.9")
        );
        assert_eq!(
            parse_forwarded_ip("2001:db8::1").as_deref(),
            Some("2001:db8::1")
        );
        // Junk must never reach the VARCHAR(45) column.
        assert_eq!(parse_forwarded_ip("not-an-ip, 1.2.3.4"), None);
        assert_eq!(parse_forwarded_ip(&"9".repeat(200)), None);
        assert_eq!(parse_forwarded_ip(""), None);
    }

    fn limiter() -> (LoginLimiter, Instant) {
        (LoginLimiter::default(), Instant::now())
    }

    #[test]
    fn allows_a_few_links_per_address_then_blocks() {
        let (l, t) = limiter();
        for _ in 0..PER_EMAIL {
            assert!(l.check_at("a@b.co", Some("1.1.1.1"), t).is_ok());
        }
        let err = l.check_at("a@b.co", Some("1.1.1.1"), t).unwrap_err();
        assert_eq!(err.retry_after, PER_EMAIL_WINDOW);
        // A different address from the same IP is unaffected.
        assert!(l.check_at("c@d.co", Some("1.1.1.1"), t).is_ok());
    }

    #[test]
    fn window_slides() {
        let (l, t) = limiter();
        for _ in 0..PER_EMAIL {
            l.check_at("a@b.co", None, t).unwrap();
        }
        assert!(l.check_at("a@b.co", None, t + PER_EMAIL_WINDOW).is_ok());
    }

    #[test]
    fn refused_requests_do_not_extend_the_lockout() {
        let (l, t) = limiter();
        for _ in 0..PER_EMAIL {
            l.check_at("a@b.co", None, t).unwrap();
        }
        for i in 1..10 {
            assert!(l
                .check_at("a@b.co", None, t + Duration::from_secs(i))
                .is_err());
        }
        assert!(l.check_at("a@b.co", None, t + PER_EMAIL_WINDOW).is_ok());
    }

    #[test]
    fn one_ip_is_capped_across_addresses() {
        let (l, t) = limiter();
        for i in 0..PER_IP {
            assert!(l
                .check_at(&format!("u{i}@x.co"), Some("9.9.9.9"), t)
                .is_ok());
        }
        assert!(l.check_at("new@x.co", Some("9.9.9.9"), t).is_err());
        assert!(l.check_at("new@x.co", Some("8.8.8.8"), t).is_ok());
    }

    #[test]
    fn everyone_together_is_capped() {
        let (l, t) = limiter();
        for i in 0..GLOBAL {
            assert!(l
                .check_at(&format!("u{i}@x.co"), Some(&format!("10.0.{i}.1")), t)
                .is_ok());
        }
        assert!(l.check_at("late@x.co", Some("10.1.0.1"), t).is_err());
    }

    #[tokio::test]
    async fn turnstile_is_off_without_a_secret() {
        let t = Turnstile {
            secret: None,
            client: reqwest::Client::new(),
        };
        assert_eq!(t.verify(None, None).await, Ok(()));
    }

    #[tokio::test]
    async fn turnstile_requires_a_token_when_enabled() {
        let t = Turnstile {
            secret: Some("s".into()),
            client: reqwest::Client::new(),
        };
        assert_eq!(t.verify(None, None).await, Err(TurnstileError::Missing));
        assert_eq!(t.verify(Some(""), None).await, Err(TurnstileError::Missing));
    }
}
