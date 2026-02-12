-- ============================================================
-- 012_users_and_sessions.sql
-- User authentication tables for multi-provider OAuth
-- ============================================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'usr_' || replace(gen_random_uuid()::text, '-', ''),
    tenant_id VARCHAR(50) REFERENCES tenants(id) ON DELETE SET NULL,
    email VARCHAR(255),
    display_name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    role VARCHAR(50) NOT NULL DEFAULT 'member',
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status) WHERE status != 'deleted';

-- OAuth identities (one user can have multiple providers)
CREATE TABLE IF NOT EXISTS oauth_identities (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'oid_' || replace(gen_random_uuid()::text, '-', ''),
    user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    provider_user_id VARCHAR(255) NOT NULL,
    provider_username VARCHAR(255),
    provider_email VARCHAR(255),
    provider_avatar_url TEXT,
    instance_url TEXT,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,
    scopes TEXT[],
    raw_profile JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_identities_provider_unique
    ON oauth_identities(provider, provider_user_id, COALESCE(instance_url, ''));
CREATE INDEX IF NOT EXISTS idx_oauth_identities_user_id ON oauth_identities(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_identities_provider_lookup
    ON oauth_identities(provider, provider_user_id);

-- Refresh tokens (stored server-side for rotation)
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'rtk_' || replace(gen_random_uuid()::text, '-', ''),
    user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    family_id VARCHAR(50) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    replaced_by VARCHAR(50),
    user_agent TEXT,
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family_id ON refresh_tokens(family_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at)
    WHERE revoked_at IS NULL;

-- OAuth state tokens (CSRF protection, replaces in-memory Map)
CREATE TABLE IF NOT EXISTS oauth_states (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'ost_' || replace(gen_random_uuid()::text, '-', ''),
    state_token VARCHAR(255) NOT NULL UNIQUE,
    provider VARCHAR(50) NOT NULL,
    instance_url TEXT,
    redirect_after TEXT,
    metadata JSONB DEFAULT '{}',
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_token ON oauth_states(state_token)
    WHERE consumed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON oauth_states(expires_at);

-- Trigger to update updated_at on users and oauth_identities
CREATE OR REPLACE FUNCTION update_auth_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'users_updated_at') THEN
        CREATE TRIGGER users_updated_at
            BEFORE UPDATE ON users
            FOR EACH ROW EXECUTE FUNCTION update_auth_updated_at();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'oauth_identities_updated_at') THEN
        CREATE TRIGGER oauth_identities_updated_at
            BEFORE UPDATE ON oauth_identities
            FOR EACH ROW EXECUTE FUNCTION update_auth_updated_at();
    END IF;
END;
$$;

COMMENT ON TABLE users IS 'User accounts linked to tenants via OAuth providers';
COMMENT ON TABLE oauth_identities IS 'OAuth provider identities linked to user accounts (one user, many providers)';
COMMENT ON TABLE refresh_tokens IS 'JWT refresh token families with rotation detection';
COMMENT ON TABLE oauth_states IS 'CSRF state tokens for OAuth flows';
