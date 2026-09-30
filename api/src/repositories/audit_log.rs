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
    /// Case-insensitive substring of `user_id`.
    pub user_search: Option<String>,
    pub entity_type: Option<String>,
    /// Match any of these entity types.
    pub entity_types: Option<Vec<String>>,
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

/// Append the WHERE conditions shared by `filter` and `count`.
fn push_conditions<'a>(
    query: &mut sqlx::QueryBuilder<'a, sqlx::Postgres>,
    filter: &'a AuditLogFilter,
) {
    if let Some(user_id) = &filter.user_id {
        // Case-insensitive: entries logged before sign-in normalised email
        // addresses keep the casing the user typed.
        query.push(" AND LOWER(user_id) = LOWER(");
        query.push_bind(user_id);
        query.push(")");
    }

    if let Some(user_search) = &filter.user_search {
        query.push(" AND user_id ILIKE ");
        query.push_bind(crate::util::like_pattern(user_search));
    }

    if let Some(entity_type) = &filter.entity_type {
        query.push(" AND entity_type = ");
        query.push_bind(entity_type);
    }

    if let Some(entity_types) = &filter.entity_types {
        query.push(" AND entity_type = ANY(");
        query.push_bind(entity_types);
        query.push(")");
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
}

/// Query audit logs with filters
pub async fn filter(pool: &PgPool, filter: AuditLogFilter) -> Result<Vec<AuditLog>, sqlx::Error> {
    let limit = filter.limit.unwrap_or(50);
    let offset = filter.offset.unwrap_or(0);

    let mut query = sqlx::QueryBuilder::new(
        "SELECT id, timestamp, user_id, action, entity_type, entity_id, metadata, ip_address, user_agent FROM audit_log WHERE 1=1"
    );
    push_conditions(&mut query, &filter);

    query.push(" ORDER BY timestamp DESC, id DESC LIMIT ");
    query.push_bind(limit);
    query.push(" OFFSET ");
    query.push_bind(offset);

    let results = query.build_query_as::<AuditLog>().fetch_all(pool).await?;

    Ok(results)
}

/// Count audit logs matching the filter (for pagination)
pub async fn count(pool: &PgPool, filter: AuditLogFilter) -> Result<i64, sqlx::Error> {
    let mut query = sqlx::QueryBuilder::new("SELECT COUNT(*) as count FROM audit_log WHERE 1=1");
    push_conditions(&mut query, &filter);

    let result: (i64,) = query.build_query_as().fetch_one(pool).await?;

    Ok(result.0)
}

/// Distinct entity types present in the audit log.
pub async fn entity_types(pool: &PgPool) -> Result<Vec<String>, sqlx::Error> {
    sqlx::query_scalar::<_, String>(
        "SELECT DISTINCT entity_type FROM audit_log ORDER BY entity_type",
    )
    .fetch_all(pool)
    .await
}
