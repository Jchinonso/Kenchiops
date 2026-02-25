/**
 * Migration 032: API Keys
 *
 * Creates the api_keys table for role-based API key authentication.
 * Keys are stored as SHA-256 hashes (the plaintext is shown once at creation).
 * Each key has scopes, expiration, and rate limit metadata.
 */

CREATE TABLE IF NOT EXISTS api_keys (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(64) NOT NULL UNIQUE,
    key_prefix VARCHAR(12) NOT NULL,
    scopes TEXT[] NOT NULL DEFAULT '{}',
    role VARCHAR(50) NOT NULL DEFAULT 'member',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_api_key_status CHECK (status IN ('active', 'revoked')),
    CONSTRAINT chk_api_key_role CHECK (role IN ('owner', 'admin', 'member', 'viewer'))
);

-- Index for hash-based lookup (authentication)
CREATE INDEX IF NOT EXISTS idx_api_keys_hash
    ON api_keys(key_hash) WHERE status = 'active';

-- Index for listing keys by tenant
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant
    ON api_keys(tenant_id, status);

-- Index for listing keys by user
CREATE INDEX IF NOT EXISTS idx_api_keys_user
    ON api_keys(user_id);
