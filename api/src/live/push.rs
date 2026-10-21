//! Web Push (DESIGN.md §8): pink alerts and nudges reach people whose phone
//! is locked or whose tab is in the background.
//!
//! Messages are encrypted per RFC 8291 (`aes128gcm`, RFC 8188) and the push
//! service is authorised with a VAPID JWT (RFC 8292, ES256). Pure Rust
//! crypto, no OpenSSL. The VAPID key comes from `VAPID_PRIVATE_KEY` (32
//! bytes, base64url); without it push is off and the client never offers it.

use aes_gcm::{aead::Aead, Aes128Gcm, KeyInit, Nonce};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD as B64, Engine};
use chrono::Utc;
use hkdf::Hkdf;
use p256::{
    ecdsa::{signature::Signer, Signature, SigningKey},
    elliptic_curve::sec1::ToEncodedPoint,
    PublicKey, SecretKey,
};
use rocket::serde::json::{json, Value as JsonValue};
use sha2::Sha256;

/// Record size advertised in the `aes128gcm` header.
const RECORD_SIZE: u32 = 4096;
/// Contact for push services (RFC 8292 `sub`).
const SUBJECT: &str = "mailto:lewis+calandar@oaten.name";

/// The server's VAPID key pair.
#[derive(Clone)]
pub struct Vapid {
    secret: SecretKey,
}

impl Vapid {
    /// From `VAPID_PRIVATE_KEY`, if set and valid.
    pub fn from_env() -> Option<Self> {
        let raw = std::env::var("VAPID_PRIVATE_KEY").ok()?;
        let bytes = B64.decode(raw.trim()).ok()?;
        SecretKey::from_slice(&bytes)
            .ok()
            .map(|secret| Self { secret })
    }

    /// A new random key pair (for `calandar-api dev-vapid`).
    pub fn generate() -> Self {
        loop {
            if let Ok(secret) = SecretKey::from_slice(&rand::random::<[u8; 32]>()) {
                return Self { secret };
            }
        }
    }

    pub fn private_base64(&self) -> String {
        B64.encode(self.secret.to_bytes())
    }

    /// The public key, uncompressed, base64url: the browser's
    /// `applicationServerKey`.
    pub fn public_base64(&self) -> String {
        B64.encode(self.secret.public_key().to_encoded_point(false).as_bytes())
    }

    /// The VAPID `Authorization` header for a push endpoint.
    fn authorization(&self, endpoint: &str) -> Option<String> {
        let url = reqwest::Url::parse(endpoint).ok()?;
        let audience = format!("{}://{}", url.scheme(), url.host_str()?);
        let header = B64.encode(br#"{"typ":"JWT","alg":"ES256"}"#);
        let claims = B64.encode(
            json!({
                "aud": audience,
                "exp": (Utc::now() + chrono::Duration::hours(12)).timestamp(),
                "sub": SUBJECT,
            })
            .to_string(),
        );
        let signing_input = format!("{header}.{claims}");
        let signature: Signature = SigningKey::from(&self.secret).sign(signing_input.as_bytes());
        let jwt = format!("{signing_input}.{}", B64.encode(signature.to_bytes()));
        Some(format!("vapid t={jwt}, k={}", self.public_base64()))
    }
}

/// A browser's push subscription.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Subscription {
    pub endpoint: String,
    /// The browser's P-256 public key (base64url, uncompressed).
    pub p256dh: String,
    /// The shared auth secret (base64url, 16 bytes).
    pub auth: String,
}

fn hkdf_expand(prk: &Hkdf<Sha256>, info: &[u8], len: usize) -> Option<Vec<u8>> {
    let mut out = vec![0; len];
    prk.expand(info, &mut out).ok()?;
    Some(out)
}

/// Encrypt `payload` for a subscription (RFC 8291) with the given ephemeral
/// key and salt. Returns the `aes128gcm` body.
fn encrypt_with(
    sub: &Subscription,
    payload: &[u8],
    ephemeral: &SecretKey,
    salt: &[u8; 16],
) -> Option<Vec<u8>> {
    let ua_public_bytes = B64.decode(&sub.p256dh).ok()?;
    let ua_public = PublicKey::from_sec1_bytes(&ua_public_bytes).ok()?;
    let auth = B64.decode(&sub.auth).ok()?;
    let as_public = ephemeral.public_key().to_encoded_point(false);

    let shared = p256::ecdh::diffie_hellman(ephemeral.to_nonzero_scalar(), ua_public.as_affine());
    let mut key_info = b"WebPush: info\0".to_vec();
    key_info.extend_from_slice(&ua_public_bytes);
    key_info.extend_from_slice(as_public.as_bytes());
    let prk_key = Hkdf::<Sha256>::new(Some(&auth), shared.raw_secret_bytes());
    let ikm = hkdf_expand(&prk_key, &key_info, 32)?;

    let prk = Hkdf::<Sha256>::new(Some(salt), &ikm);
    let cek = hkdf_expand(&prk, b"Content-Encoding: aes128gcm\0", 16)?;
    let nonce = hkdf_expand(&prk, b"Content-Encoding: nonce\0", 12)?;

    // One record: the payload and the last-record delimiter.
    let mut plaintext = payload.to_vec();
    plaintext.push(2);
    let cipher = Aes128Gcm::new_from_slice(&cek).ok()?;
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce), plaintext.as_slice())
        .ok()?;

    let mut body = Vec::with_capacity(86 + ciphertext.len());
    body.extend_from_slice(salt);
    body.extend_from_slice(&RECORD_SIZE.to_be_bytes());
    body.push(u8::try_from(as_public.as_bytes().len()).ok()?);
    body.extend_from_slice(as_public.as_bytes());
    body.extend_from_slice(&ciphertext);
    Some(body)
}

/// Why a push failed.
#[derive(Debug, PartialEq, Eq)]
pub enum PushError {
    /// The subscription is gone (404/410): forget it.
    Gone,
    Failed(String),
}

/// Send one push. `payload` is JSON the service worker shows.
pub async fn send(vapid: &Vapid, sub: &Subscription, payload: &JsonValue) -> Result<(), PushError> {
    let ephemeral = Vapid::generate().secret;
    let salt: [u8; 16] = rand::random();
    let body = encrypt_with(sub, payload.to_string().as_bytes(), &ephemeral, &salt)
        .ok_or_else(|| PushError::Failed("Bad subscription keys".to_string()))?;
    let auth = vapid
        .authorization(&sub.endpoint)
        .ok_or_else(|| PushError::Failed("Bad push endpoint".to_string()))?;
    let response = reqwest::Client::new()
        .post(&sub.endpoint)
        .header("Content-Encoding", "aes128gcm")
        .header("Content-Type", "application/octet-stream")
        .header("TTL", "300")
        .header("Urgency", "high")
        .header("Authorization", auth)
        .body(body)
        .send()
        .await
        .map_err(|e| PushError::Failed(e.without_url().to_string()))?;
    match response.status().as_u16() {
        200..=299 => Ok(()),
        404 | 410 => Err(PushError::Gone),
        status => Err(PushError::Failed(format!("Push service answered {status}"))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use p256::ecdsa::{signature::Verifier, VerifyingKey};

    /// The browser's side of RFC 8291, to check what we send decrypts.
    fn decrypt(ua: &SecretKey, auth: &[u8], body: &[u8]) -> Vec<u8> {
        let salt = &body[..16];
        let id_len = body[20] as usize;
        let as_public_bytes = &body[21..21 + id_len];
        let ciphertext = &body[21 + id_len..];
        let as_public = PublicKey::from_sec1_bytes(as_public_bytes).expect("key");
        let shared = p256::ecdh::diffie_hellman(ua.to_nonzero_scalar(), as_public.as_affine());
        let ua_public = ua.public_key().to_encoded_point(false);
        let mut key_info = b"WebPush: info\0".to_vec();
        key_info.extend_from_slice(ua_public.as_bytes());
        key_info.extend_from_slice(as_public_bytes);
        let ikm = hkdf_expand(
            &Hkdf::<Sha256>::new(Some(auth), shared.raw_secret_bytes()),
            &key_info,
            32,
        )
        .expect("ikm");
        let prk = Hkdf::<Sha256>::new(Some(salt), &ikm);
        let cek = hkdf_expand(&prk, b"Content-Encoding: aes128gcm\0", 16).expect("cek");
        let nonce = hkdf_expand(&prk, b"Content-Encoding: nonce\0", 12).expect("nonce");
        let mut plain = Aes128Gcm::new_from_slice(&cek)
            .expect("cipher")
            .decrypt(Nonce::from_slice(&nonce), ciphertext)
            .expect("decrypts");
        assert_eq!(plain.pop(), Some(2), "last-record delimiter");
        plain
    }

    #[test]
    fn encrypts_so_the_browser_can_decrypt() {
        let ua = Vapid::generate().secret;
        let auth: [u8; 16] = rand::random();
        let sub = Subscription {
            endpoint: "https://fcm.googleapis.com/fcm/send/abc".to_string(),
            p256dh: B64.encode(ua.public_key().to_encoded_point(false).as_bytes()),
            auth: B64.encode(auth),
        };
        let body = encrypt_with(
            &sub,
            b"{\"title\":\"Join now\"}",
            &Vapid::generate().secret,
            &[9; 16],
        )
        .expect("encrypted");
        assert_eq!(&body[..16], &[9; 16]);
        assert_eq!(&body[16..20], &RECORD_SIZE.to_be_bytes());
        assert_eq!(decrypt(&ua, &auth, &body), b"{\"title\":\"Join now\"}");
    }

    #[test]
    fn vapid_header_is_a_signed_jwt_for_the_origin() {
        let vapid = Vapid::generate();
        let header = vapid
            .authorization("https://updates.push.services.mozilla.com/wpush/v2/xyz")
            .expect("header");
        let jwt = header
            .strip_prefix("vapid t=")
            .and_then(|h| h.split(", k=").next())
            .expect("jwt");
        let parts: Vec<&str> = jwt.split('.').collect();
        assert_eq!(parts.len(), 3);
        let claims: JsonValue =
            rocket::serde::json::serde_json::from_slice(&B64.decode(parts[1]).expect("b64"))
                .expect("json");
        assert_eq!(claims["aud"], "https://updates.push.services.mozilla.com");
        let signature = Signature::from_slice(&B64.decode(parts[2]).expect("b64")).expect("sig");
        VerifyingKey::from(vapid.secret.public_key())
            .verify(format!("{}.{}", parts[0], parts[1]).as_bytes(), &signature)
            .expect("verifies");
        assert!(header.ends_with(&vapid.public_base64()));
    }

    #[test]
    fn keys_round_trip_through_base64() {
        let vapid = Vapid::generate();
        let again =
            SecretKey::from_slice(&B64.decode(vapid.private_base64()).expect("b64")).expect("key");
        assert_eq!(again.to_bytes(), vapid.secret.to_bytes());
    }
}
