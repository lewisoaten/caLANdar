-- The audit-log user filter compares LOWER(user_id), because entries logged
-- before sign-in normalised email addresses keep the casing the user typed.
-- A plain index on user_id cannot serve that comparison, so replace it with
-- one on the expression. Nothing else filters on the raw column.
DROP INDEX IF EXISTS idx_audit_log_user_id;
CREATE INDEX idx_audit_log_lower_user_id ON audit_log (LOWER(user_id));
