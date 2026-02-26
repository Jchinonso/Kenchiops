/**
 * Migration 031: Team Invitations
 *
 * Creates the team_invitations table for email-based team invites.
 * Invitations have a unique token, role, expiry, and status tracking.
 */

CREATE TABLE IF NOT EXISTS team_invitations (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(320) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'member',
    token VARCHAR(128) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    invited_by VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
    accepted_by VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_invitation_status CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'revoked')),
    CONSTRAINT chk_invitation_role CHECK (role IN ('owner', 'admin', 'member', 'viewer'))
);

-- Index for looking up pending invitations by tenant
CREATE INDEX IF NOT EXISTS idx_team_invitations_tenant_status
    ON team_invitations(tenant_id, status);

-- Index for looking up invitations by email (for checking duplicates)
CREATE INDEX IF NOT EXISTS idx_team_invitations_email
    ON team_invitations(email, tenant_id, status);

-- Index for token-based lookup (accept/decline flow)
CREATE INDEX IF NOT EXISTS idx_team_invitations_token
    ON team_invitations(token);

-- Prevent duplicate pending invitations for the same email+tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_invitations_unique_pending
    ON team_invitations(tenant_id, email)
    WHERE status = 'pending';
