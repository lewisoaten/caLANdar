use crate::{
    auth::AdminUser,
    controllers::audit_log::{self, AuditLogFilter},
};
use chrono::{DateTime, Utc};
use rocket::{
    get,
    serde::{json::serde_json::Value as JsonValue, json::Json, Deserialize, Serialize},
    State,
};
use rocket_okapi::okapi::schemars;
use rocket_okapi::okapi::schemars::JsonSchema;
use rocket_okapi::openapi;
use sqlx::PgPool;

use super::SchemaExample;

#[derive(Clone, Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
#[schemars(example = "Self::example")]
pub struct AuditLogEntry {
    pub id: i64,
    pub timestamp: DateTime<Utc>,
    pub user_id: Option<String>,
    pub action: String,
    pub entity_type: String,
    pub entity_id: Option<String>,
    pub metadata: Option<JsonValue>,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
}

impl SchemaExample for AuditLogEntry {
    fn example() -> Self {
        Self {
            id: 1,
            timestamp: Utc::now(),
            user_id: Some("user@example.com".to_string()),
            action: "event.create".to_string(),
            entity_type: "event".to_string(),
            entity_id: Some("42".to_string()),
            metadata: None,
            ip_address: Some("192.168.1.1".to_string()),
            user_agent: Some("Mozilla/5.0".to_string()),
        }
    }
}

impl From<audit_log::AuditLog> for AuditLogEntry {
    fn from(log: audit_log::AuditLog) -> Self {
        Self {
            id: log.id,
            timestamp: log.timestamp,
            user_id: log.user_id,
            action: log.action,
            entity_type: log.entity_type,
            entity_id: log.entity_id,
            metadata: log.metadata,
            ip_address: log.ip_address,
            user_agent: log.user_agent,
        }
    }
}

#[derive(Serialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
#[schemars(example = "Self::example")]
pub struct AuditLogsResponse {
    pub logs: Vec<AuditLogEntry>,
    pub total_count: i64,
    pub limit: i64,
    pub offset: i64,
}

impl SchemaExample for AuditLogsResponse {
    fn example() -> Self {
        Self {
            logs: vec![AuditLogEntry::example()],
            total_count: 1,
            limit: 50,
            offset: 0,
        }
    }
}

#[derive(Deserialize, JsonSchema)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct AuditLogsQueryParams {
    pub user_id: Option<String>,
    pub entity_type: Option<String>,
    pub action: Option<String>,
    pub from_timestamp: Option<DateTime<Utc>>,
    pub to_timestamp: Option<DateTime<Utc>>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

custom_errors!(AuditLogsGetError, Unauthorized, InternalServerError);

/// Get audit logs (admin only)
#[allow(clippy::too_many_arguments)]
#[openapi(tag = "Audit")]
#[get("/audit-logs?<user_id>&<entity_type>&<action>&<from_timestamp>&<to_timestamp>&<limit>&<offset>&<_as_admin>")]
pub async fn get_audit_logs(
    pool: &State<PgPool>,
    user_id: Option<String>,
    entity_type: Option<String>,
    action: Option<String>,
    from_timestamp: Option<String>,
    to_timestamp: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
    _as_admin: Option<bool>,
    _admin: AdminUser,
) -> Result<Json<AuditLogsResponse>, AuditLogsGetError> {
    // Parse timestamps if provided
    let from_ts = from_timestamp
        .as_ref()
        .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
        .map(|dt| dt.with_timezone(&Utc));

    let to_ts = to_timestamp
        .as_ref()
        .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
        .map(|dt| dt.with_timezone(&Utc));

    let filter = AuditLogFilter {
        user_id,
        entity_type,
        action,
        from_timestamp: from_ts,
        to_timestamp: to_ts,
        limit,
        offset,
    };

    match audit_log::get_logs(pool, filter).await {
        Ok(result) => Ok(Json(AuditLogsResponse {
            logs: result.logs.into_iter().map(AuditLogEntry::from).collect(),
            total_count: result.total_count,
            limit: limit.unwrap_or(50),
            offset: offset.unwrap_or(0),
        })),
        Err(e) => Err(AuditLogsGetError::InternalServerError(format!(
            "Error retrieving audit logs: {e}"
        ))),
    }
}
