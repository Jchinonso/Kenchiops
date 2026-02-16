-- Webhook Activity Log
-- Tracks incoming webhook deliveries for debugging and visibility.

CREATE TABLE IF NOT EXISTS webhook_activity (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) REFERENCES tenants(id) ON DELETE SET NULL,
    delivery_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    source VARCHAR(50) NOT NULL DEFAULT 'github',
    status VARCHAR(50) NOT NULL,
    processing_time_ms INTEGER,
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_activity_tenant_created
    ON webhook_activity(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_activity_delivery_id
    ON webhook_activity(delivery_id);
