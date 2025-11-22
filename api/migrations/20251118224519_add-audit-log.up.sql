-- Add up migration script here
CREATE TABLE audit_log (
   id BIGSERIAL PRIMARY KEY,
   timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   user_id VARCHAR(255),
   action VARCHAR(100) NOT NULL,
   entity_type VARCHAR(50) NOT NULL,
   entity_id VARCHAR(100),
   metadata JSONB,
   ip_address VARCHAR(45),
   user_agent TEXT
);

-- Create indexes for common query patterns
CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp DESC);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);
