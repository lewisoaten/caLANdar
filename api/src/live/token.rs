//! Scoped stream tokens (DESIGN.md §3.4).
//!
//! Native `EventSource` cannot send an `Authorization` header, so the stream
//! is authorised by a short-lived PASETO passed as `?st=`. It is read-only
//! and bound to one event's stream, so leaking it exposes no more than the
//! wall-board link already does.

use chrono::{Duration, Utc};
use rocket::serde::{json, Deserialize};
use rusty_paseto::prelude::*;

use super::log::Viewer;

/// Token identifier (`jti`) for stream tokens; API tokens use `api`.
const TOKEN_ID: &str = "live";
/// Subject used by wall-board tokens.
const WALLBOARD_SUB: &str = "wallboard";

/// How long a stream token lasts. The client refreshes it before expiry.
pub const TTL_HOURS: i64 = 12;

#[derive(Deserialize)]
#[serde(crate = "rocket::serde")]
struct Claims {
    sub: String,
    /// Event id.
    e: String,
    /// "1" for admins.
    a: Option<String>,
}

/// A random token (the wall-board link), as for room backgrounds.
pub fn random_token() -> String {
    format!("{:032x}", rand::random::<u128>())
}

/// Mint a stream token for `viewer` on `event_id`.
pub fn mint(
    key: &PasetoSymmetricKey<V4, Local>,
    event_id: i32,
    viewer: &Viewer,
) -> Result<String, String> {
    let expiration =
        ExpirationClaim::try_from((Utc::now() + Duration::hours(TTL_HOURS)).to_rfc3339())
            .map_err(|e| format!("Can't create expiration claim: {e}"))?;
    let event_claim = CustomClaim::try_from(("e", event_id.to_string()))
        .map_err(|e| format!("Can't create event claim: {e}"))?;
    let admin_claim =
        CustomClaim::try_from(("a", if viewer.is_admin() { "1" } else { "0" }.to_string()))
            .map_err(|e| format!("Can't create admin claim: {e}"))?;
    let sub = viewer.email().unwrap_or(WALLBOARD_SUB);

    PasetoBuilder::<V4, Local>::default()
        .set_claim(expiration)
        .set_claim(IssuerClaim::from("calandar.org"))
        .set_claim(TokenIdentifierClaim::from(TOKEN_ID))
        .set_claim(SubjectClaim::from(sub))
        .set_claim(event_claim)
        .set_claim(admin_claim)
        .build(key)
        .map_err(|e| format!("Error building stream token: {e}"))
}

/// Check a stream token for `event_id` and return who it is for.
pub fn verify(
    key: &PasetoSymmetricKey<V4, Local>,
    token: &str,
    event_id: i32,
) -> Result<Viewer, String> {
    let generic = PasetoParser::<V4, Local>::default()
        .check_claim(IssuerClaim::from("calandar.org"))
        .check_claim(TokenIdentifierClaim::from(TOKEN_ID))
        .parse(token, key)
        .map_err(|_| "Invalid stream token".to_string())?;
    let claims: Claims =
        json::from_value(generic).map_err(|_| "Malformed stream token".to_string())?;
    if claims.e != event_id.to_string() {
        return Err("Stream token is for another event".to_string());
    }
    if claims.sub == WALLBOARD_SUB {
        return Ok(Viewer::Wallboard);
    }
    Ok(Viewer::Gamer {
        email: crate::util::normalise_email(&claims.sub),
        admin: claims.a.as_deref() == Some("1"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key() -> PasetoSymmetricKey<V4, Local> {
        PasetoSymmetricKey::<V4, Local>::from(Key::from([7; 32]))
    }

    #[test]
    fn round_trips_a_gamer() {
        let viewer = Viewer::Gamer {
            email: "a@example.com".to_string(),
            admin: true,
        };
        let token = mint(&key(), 4, &viewer).expect("minted");
        assert_eq!(verify(&key(), &token, 4), Ok(viewer));
    }

    #[test]
    fn round_trips_the_wallboard() {
        let token = mint(&key(), 4, &Viewer::Wallboard).expect("minted");
        assert_eq!(verify(&key(), &token, 4), Ok(Viewer::Wallboard));
    }

    #[test]
    fn rejects_another_event() {
        let token = mint(&key(), 4, &Viewer::Wallboard).expect("minted");
        assert!(verify(&key(), &token, 5).is_err());
    }

    #[test]
    fn rejects_an_api_token() {
        let api = PasetoBuilder::<V4, Local>::default()
            .set_claim(IssuerClaim::from("calandar.org"))
            .set_claim(TokenIdentifierClaim::from("api"))
            .set_claim(SubjectClaim::from("a@example.com"))
            .build(&key())
            .expect("built");
        assert!(verify(&key(), &api, 4).is_err());
    }
}
