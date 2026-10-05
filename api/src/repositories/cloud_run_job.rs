//! Start a Cloud Run Job execution from the service, using the service's own
//! identity (from the metadata server) to call the Cloud Run Admin API.

use reqwest::Client;
use rocket::serde::{json::serde_json::json, Deserialize};

const METADATA_TOKEN_URL: &str =
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";

#[derive(Deserialize)]
#[serde(crate = "rocket::serde")]
struct AccessToken {
    access_token: String,
}

/// Run `job` (`projects/<p>/locations/<r>/jobs/<name>`) once, with `env`
/// added to its container. Returns once the execution has been accepted, not
/// when it finishes. Errors are for logs only.
pub async fn run(job: &str, env: &[(&str, String)]) -> Result<(), String> {
    let client = Client::new();

    let token = client
        .get(METADATA_TOKEN_URL)
        .header("Metadata-Flavor", "Google")
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(|e| format!("getting an access token: {e}"))?
        .json::<AccessToken>()
        .await
        .map_err(|e| format!("reading the access token: {e}"))?;

    let env: Vec<_> = env
        .iter()
        .map(|(name, value)| json!({ "name": name, "value": value }))
        .collect();

    let response = client
        .post(format!("https://run.googleapis.com/v2/{job}:run"))
        .bearer_auth(token.access_token)
        .json(&json!({ "overrides": { "containerOverrides": [{ "env": env }] } }))
        .send()
        .await
        .map_err(|e| format!("calling the Cloud Run Admin API: {e}"))?;

    let status = response.status();
    if status.is_success() {
        return Ok(());
    }
    let body = response.text().await.unwrap_or_default();
    Err(format!(
        "Cloud Run Admin API returned {status}: {}",
        body.chars().take(500).collect::<String>()
    ))
}
