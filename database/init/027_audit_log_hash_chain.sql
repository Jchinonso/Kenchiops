-- Migration 027: Audit Log Hash Chain (SOC 2 Type II Compliance)
--
-- WHY: The tenant_audit_log table exists but is not tamper-evident. SOC 2 Type II
-- requires that audit logs be immutable and verifiable. Adding a hash chain means
-- each entry includes a SHA-256 hash of itself and the previous entry's hash.
-- If any entry is tampered with, the chain breaks and verification fails.
--
-- HASH COMPUTATION (application layer):
--   entry_hash = SHA256(previous_hash + tenant_id + action + metadata + created_at)
--
-- The first entry in each tenant's chain has previous_hash = NULL (genesis entry).
-- Chain verification walks entries in created_at order per tenant and recomputes hashes.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_tenant_audit_entry_hash;
--   ALTER TABLE tenant_audit_log DROP COLUMN IF EXISTS entry_hash;
--   ALTER TABLE tenant_audit_log DROP COLUMN IF EXISTS previous_hash;

-- ==================== Add Hash Chain Columns ====================

-- previous_hash: SHA-256 hex digest of the preceding audit log entry's entry_hash.
-- NULL for the first entry in each tenant's chain (genesis entry).
ALTER TABLE tenant_audit_log
ADD COLUMN IF NOT EXISTS previous_hash VARCHAR(64);

-- entry_hash: SHA-256 hex digest of this entry's contents + previous_hash.
-- Computed at insert time by the application layer.
ALTER TABLE tenant_audit_log
ADD COLUMN IF NOT EXISTS entry_hash VARCHAR(64);

-- ==================== Indexes ====================

-- Index on entry_hash for chain verification queries.
-- When verifying the chain, we need to look up entries by their hash.
CREATE INDEX IF NOT EXISTS idx_tenant_audit_entry_hash
    ON tenant_audit_log (entry_hash)
    WHERE entry_hash IS NOT NULL;

-- Composite index for walking the chain per tenant in order.
-- Supports: SELECT * FROM tenant_audit_log WHERE tenant_id = $1 ORDER BY created_at
CREATE INDEX IF NOT EXISTS idx_tenant_audit_chain_walk
    ON tenant_audit_log (tenant_id, created_at ASC)
    WHERE entry_hash IS NOT NULL;

-- ==================== Comments ====================

COMMENT ON COLUMN tenant_audit_log.previous_hash IS
  'SHA-256 hex digest of the preceding entry''s entry_hash in this tenant''s chain. '
  'NULL for the genesis (first) entry. Forms a tamper-evident linked list.';

COMMENT ON COLUMN tenant_audit_log.entry_hash IS
  'SHA-256 hex digest of: previous_hash + tenant_id + action + metadata + created_at. '
  'Computed at insert time by the application. Any tampering breaks the chain.';
