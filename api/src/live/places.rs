//! Food near the venue (DESIGN.md Q6, phase 4): Google Places Text Search
//! (New) around the event's venue. Optional: with no
//! `GOOGLE_PLACES_API_KEY` the propose sheet offers free text only. The
//! key never reaches the browser; photos go through a redirecting proxy.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD as B64, Engine};
use hkdf::Hkdf;
use rocket::serde::{json::serde_json::Value as JsonValue, Serialize};
use rocket_okapi::okapi::schemars::{self, JsonSchema};
use sha2::Sha256;

fn key() -> Option<String> {
    std::env::var("GOOGLE_PLACES_API_KEY")
        .ok()
        .filter(|k| !k.trim().is_empty())
}

pub fn enabled() -> bool {
    key().is_some()
}

/// The signature on a photo URL: HMAC-SHA256 of the photo name under the
/// server secret (HKDF's extract step is exactly that), truncated. Photos
/// load as CSS backgrounds, which can't send a bearer token, so the URL
/// itself carries the permission; without it the proxy would spend our
/// Places quota for anyone. No expiry: food lobbies keep the URL.
fn photo_sig_with(secret: &[u8], name: &str) -> String {
    let (mac, _) = Hkdf::<Sha256>::extract(Some(secret), format!("places-photo:{name}").as_bytes());
    B64.encode(&mac[..16])
}

fn secret() -> Option<Vec<u8>> {
    std::env::var("PASETO_SECRET_KEY")
        .ok()
        .map(String::into_bytes)
}

fn photo_url(secret: &[u8], name: &str) -> String {
    format!(
        "/api/live/places/photo?name={}&sig={}",
        name.replace('/', "%2F"),
        photo_sig_with(secret, name)
    )
}

/// Constant-time check of a photo URL's signature.
fn photo_sig_ok(secret: &[u8], name: &str, sig: &str) -> bool {
    let want = photo_sig_with(secret, name);
    want.len() == sig.len()
        && want
            .bytes()
            .zip(sig.bytes())
            .fold(0u8, |acc, (a, b)| acc | (a ^ b))
            == 0
}

#[derive(Debug, Clone, Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct PlaceHit {
    pub place_id: String,
    pub name: String,
    pub rating: Option<f64>,
    pub address: Option<String>,
    /// Through our proxy, so the key stays server-side.
    pub photo_url: Option<String>,
    pub distance_m: Option<f64>,
}

/// Great-circle distance in metres.
pub fn distance_m(a: (f64, f64), b: (f64, f64)) -> f64 {
    let (lat1, lng1) = (a.0.to_radians(), a.1.to_radians());
    let (lat2, lng2) = (b.0.to_radians(), b.1.to_radians());
    let dlat = ((lat2 - lat1) / 2.0).sin();
    let dlng = ((lng2 - lng1) / 2.0).sin();
    let h = (lat1.cos() * lat2.cos()).mul_add(dlng * dlng, dlat * dlat);
    2.0 * 6_371_000.0 * h.sqrt().asin()
}

/// Places matching `query` near `(lat, lng)`.
pub async fn search(query: &str, lat: f64, lng: f64) -> Result<Vec<PlaceHit>, String> {
    let key = key().ok_or("Food search isn't set up")?;
    let body = rocket::serde::json::json!({
        "textQuery": query,
        "maxResultCount": 8,
        "locationBias": { "circle": { "center": { "latitude": lat, "longitude": lng }, "radius": 5000.0 } },
    });
    let response = reqwest::Client::new()
        .post("https://places.googleapis.com/v1/places:searchText")
        .header("X-Goog-Api-Key", key)
        .header(
            "X-Goog-FieldMask",
            "places.id,places.displayName,places.rating,places.formattedAddress,places.location,places.photos",
        )
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Places search failed: {}", e.without_url()))?;
    if !response.status().is_success() {
        return Err(format!("Places search answered {}", response.status()));
    }
    let json: JsonValue = response
        .json()
        .await
        .map_err(|e| format!("Places search answered nonsense: {}", e.without_url()))?;
    Ok(json["places"]
        .as_array()
        .map(|places| {
            let secret = secret();
            places
                .iter()
                .filter_map(|p| hit(p, (lat, lng), secret.as_deref()))
                .collect()
        })
        .unwrap_or_default())
}

fn hit(place: &JsonValue, venue: (f64, f64), secret: Option<&[u8]>) -> Option<PlaceHit> {
    let location = (
        place["location"]["latitude"].as_f64(),
        place["location"]["longitude"].as_f64(),
    );
    Some(PlaceHit {
        place_id: place["id"].as_str()?.to_string(),
        name: place["displayName"]["text"].as_str()?.to_string(),
        rating: place["rating"].as_f64(),
        address: place["formattedAddress"].as_str().map(ToString::to_string),
        photo_url: place["photos"][0]["name"]
            .as_str()
            .zip(secret)
            .map(|(name, secret)| photo_url(secret, name)),
        distance_m: match location {
            (Some(lat), Some(lng)) => Some(distance_m(venue, (lat, lng)).round()),
            _ => None,
        },
    })
}

/// A short-lived URL for a place photo (`places/…/photos/…`), for a photo
/// URL we signed.
pub async fn photo_uri(name: &str, sig: &str) -> Result<String, String> {
    let key = key().ok_or("Food search isn't set up")?;
    if !secret().is_some_and(|secret| photo_sig_ok(&secret, name, sig)) {
        return Err("Bad photo link".to_string());
    }
    if !name.starts_with("places/") || name.contains("..") {
        return Err("Bad photo name".to_string());
    }
    let response = reqwest::Client::new()
        .get(format!("https://places.googleapis.com/v1/{name}/media"))
        .query(&[
            ("maxWidthPx", "400"),
            ("skipHttpRedirect", "true"),
            ("key", &key),
        ])
        .send()
        .await
        .map_err(|e| format!("Places photo failed: {}", e.without_url()))?;
    let json: JsonValue = response
        .json()
        .await
        .map_err(|e| format!("Places photo answered nonsense: {}", e.without_url()))?;
    json["photoUri"]
        .as_str()
        .map(ToString::to_string)
        .ok_or_else(|| "No photo".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_place() {
        let place = rocket::serde::json::json!({
            "id": "abc",
            "displayName": { "text": "Mario's" },
            "rating": 4.5,
            "formattedAddress": "1 High St",
            "location": { "latitude": 51.5081, "longitude": -0.1281 },
            "photos": [{ "name": "places/abc/photos/xyz" }]
        });
        let hit = hit(&place, (51.5072, -0.1276), Some(b"secret")).expect("parsed");
        assert_eq!(hit.name, "Mario's");
        let url = hit.photo_url.expect("photo url");
        assert!(
            url.starts_with("/api/live/places/photo?name=places%2Fabc%2Fphotos%2Fxyz&sig="),
            "{url}"
        );
        let d = hit.distance_m.expect("distance");
        assert!((100.0..120.0).contains(&d), "about 106m, got {d}");
    }

    #[test]
    fn photo_links_are_signed_per_photo() {
        let secret = b"wubbalubbadubdubwubbalubbadubdub";
        let name = "places/abc/photos/xyz";
        let url = photo_url(secret, name);
        let sig = url.rsplit("sig=").next().expect("sig");
        assert!(photo_sig_ok(secret, name, sig));
        assert!(!photo_sig_ok(secret, "places/abc/photos/other", sig));
        assert!(!photo_sig_ok(b"another secret", name, sig));
        assert!(!photo_sig_ok(secret, name, ""));
    }
}
