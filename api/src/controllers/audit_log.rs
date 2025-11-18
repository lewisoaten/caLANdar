use chrono::{DateTime, Utc};
use rocket::serde::json::serde_json::Value as JsonValue;
use sqlx::PgPool;

use crate::repositories::audit_log;

#[derive(Debug, Clone)]
pub struct AuditLog {
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

impl From<audit_log::AuditLog> for AuditLog {
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

#[derive(Debug, Clone)]
pub struct AuditLogFilter {
    pub user_id: Option<String>,
    pub entity_type: Option<String>,
    pub action: Option<String>,
    pub from_timestamp: Option<DateTime<Utc>>,
    pub to_timestamp: Option<DateTime<Utc>>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

pub struct AuditLogsResult {
    pub logs: Vec<AuditLog>,
    pub total_count: i64,
}

#[derive(Debug)]
pub enum Error {
    Database(String),
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Database(msg) => write!(f, "Database error: {msg}"),
        }
    }
}

pub async fn get_logs(pool: &PgPool, filter: AuditLogFilter) -> Result<AuditLogsResult, Error> {
    let repo_filter = audit_log::AuditLogFilter {
        user_id: filter.user_id.clone(),
        entity_type: filter.entity_type.clone(),
        action: filter.action.clone(),
        from_timestamp: filter.from_timestamp,
        to_timestamp: filter.to_timestamp,
        limit: filter.limit,
        offset: filter.offset,
    };

    let logs = audit_log::filter(pool, repo_filter.clone())
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

    let total_count = audit_log::count(pool, repo_filter)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

    Ok(AuditLogsResult {
        logs: logs.into_iter().map(AuditLog::from).collect(),
        total_count,
    })
}
