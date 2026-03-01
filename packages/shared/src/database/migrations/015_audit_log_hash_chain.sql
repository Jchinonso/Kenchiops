-- Add hash chain columns for SOC 2 Type II tamper-evident audit log.
-- entry_hash = SHA-256(previous_hash + tenant_id + action + actor + metadata + timestamp)

ALTER TABLE tenant_audit_log
  ADD COLUMN IF NOT EXISTS previous_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS entry_hash VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_tenant_audit_entry_hash
  ON tenant_audit_log (entry_hash);
