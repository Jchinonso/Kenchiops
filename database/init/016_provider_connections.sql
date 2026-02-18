-- Migration 016: CI Provider Connections
--
-- Adds infrastructure for multi-provider CI/CD log analysis.
-- Tracks per-tenant CI provider configurations and adds provider
-- tracking to existing analysis tables.

-- Track CI provider connections per tenant
CREATE TABLE IF NOT EXISTS provider_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  webhook_secret VARCHAR(255),
  access_token_encrypted TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_provider_connections_tenant
  ON provider_connections(tenant_id);

CREATE INDEX IF NOT EXISTS idx_provider_connections_provider
  ON provider_connections(provider) WHERE is_active = true;

-- Add provider column to analyses table for tracking
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS ci_provider VARCHAR(50) DEFAULT 'github_actions';

-- Add provider column to analysis_jobs table
ALTER TABLE analysis_jobs ADD COLUMN IF NOT EXISTS ci_provider VARCHAR(50) DEFAULT 'github_actions';
