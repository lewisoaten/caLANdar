use chrono::{DateTime, Utc};
use rocket::serde::json::serde_json::Value as JsonValue;
use sqlx::PgPool;

#[derive(Debug, Clone, sqlx::FromRow)]
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

#[derive(Debug, Clone)]
pub struct AuditLogInsert {
    pub user_id: Option<String>,
    pub action: String,
    pub entity_type: String,
    pub entity_id: Option<String>,
    pub metadata: Option<JsonValue>,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct AuditLogFilter {
    pub user_id: Option<String>,
    pub entity_type: Option<String>,
    pub action: Option<String>,
    pub from_timestamp: Option<DateTime<Utc>>,
    pub to_timestamp: Option<DateTime<Utc>>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// Insert a new audit log entry
pub async fn insert(pool: &PgPool, audit: AuditLogInsert) -> Result<AuditLog, sqlx::Error> {
    let result = sqlx::query_as::<_, AuditLog>(
        r"
        INSERT INTO audit_log (user_id, action, entity_type, entity_id, metadata, ip_address, user_agent)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, timestamp, user_id, action, entity_type, entity_id, metadata, ip_address, user_agent
        "
    )
    .bind(audit.user_id)
    .bind(audit.action)
    .bind(audit.entity_type)
    .bind(audit.entity_id)
    .bind(audit.metadata)
    .bind(audit.ip_address)
    .bind(audit.user_agent)
    .fetch_one(pool)
    .await?;

    Ok(result)
}

/// Query audit logs with filters
pub async fn filter(pool: &PgPool, filter: AuditLogFilter) -> Result<Vec<AuditLog>, sqlx::Error> {
    let limit = filter.limit.unwrap_or(50);
    let offset = filter.offset.unwrap_or(0);

    let mut query = sqlx::QueryBuilder::new(
        "SELECT id, timestamp, user_id, action, entity_type, entity_id, metadata, ip_address, user_agent FROM audit_log WHERE 1=1"
    );

    if let Some(user_id) = &filter.user_id {
        query.push(" AND user_id = ");
        query.push_bind(user_id);
    }

    if let Some(entity_type) = &filter.entity_type {
        query.push(" AND entity_type = ");
        query.push_bind(entity_type);
    }

    if let Some(action) = &filter.action {
        query.push(" AND action = ");
        query.push_bind(action);
    }

    if let Some(from_timestamp) = filter.from_timestamp {
        query.push(" AND timestamp >= ");
        query.push_bind(from_timestamp);
    }

    if let Some(to_timestamp) = filter.to_timestamp {
        query.push(" AND timestamp <= ");
        query.push_bind(to_timestamp);
    }

    query.push(" ORDER BY timestamp DESC LIMIT ");
    query.push_bind(limit);
    query.push(" OFFSET ");
    query.push_bind(offset);

    let results = query.build_query_as::<AuditLog>().fetch_all(pool).await?;

    Ok(results)
}

/// Count audit logs matching the filter (for pagination)
pub async fn count(pool: &PgPool, filter: AuditLogFilter) -> Result<i64, sqlx::Error> {
    let mut query = sqlx::QueryBuilder::new("SELECT COUNT(*) as count FROM audit_log WHERE 1=1");

    if let Some(user_id) = &filter.user_id {
        query.push(" AND user_id = ");
        query.push_bind(user_id);
    }

    if let Some(entity_type) = &filter.entity_type {
        query.push(" AND entity_type = ");
        query.push_bind(entity_type);
    }

    if let Some(action) = &filter.action {
        query.push(" AND action = ");
        query.push_bind(action);
    }

    if let Some(from_timestamp) = filter.from_timestamp {
        query.push(" AND timestamp >= ");
        query.push_bind(from_timestamp);
    }

    if let Some(to_timestamp) = filter.to_timestamp {
        query.push(" AND timestamp <= ");
        query.push_bind(to_timestamp);
    }

    let result: (i64,) = query.build_query_as().fetch_one(pool).await?;

    Ok(result.0)
}
