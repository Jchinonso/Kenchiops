-- Track encryption key version per tenant for rotation support.
-- Default version 1 represents the legacy global-key encryption.
-- Version 2+ indicates per-tenant HKDF-derived keys.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS encryption_key_version INTEGER NOT NULL DEFAULT 1;
COMMENT ON COLUMN tenants.encryption_key_version IS 'Tracks which encryption key version was used for this tenant''s data';
