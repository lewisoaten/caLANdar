DROP INDEX IF EXISTS idx_audit_log_lower_user_id;
CREATE INDEX idx_audit_log_user_id ON audit_log (user_id);
