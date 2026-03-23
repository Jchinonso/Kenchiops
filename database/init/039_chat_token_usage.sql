-- Chat token usage tracking for daily budget enforcement
CREATE TABLE IF NOT EXISTS chat_token_usage (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  usage_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  tokens_used   BIGINT NOT NULL DEFAULT 0,
  message_count INTEGER NOT NULL DEFAULT 0,
  budget_limit  BIGINT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_chat_token_usage_tenant_date UNIQUE (tenant_id, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_chat_token_usage_tenant_date
  ON chat_token_usage (tenant_id, usage_date);

COMMENT ON TABLE chat_token_usage IS 'Tracks daily chat token consumption per tenant for budget enforcement.';
COMMENT ON COLUMN chat_token_usage.tokens_used IS 'Cumulative input + output tokens consumed today.';
COMMENT ON COLUMN chat_token_usage.budget_limit IS 'Override budget limit. NULL uses plan-tier default.';

DROP TRIGGER IF EXISTS update_chat_token_usage_updated_at ON chat_token_usage;
CREATE TRIGGER update_chat_token_usage_updated_at
  BEFORE UPDATE ON chat_token_usage
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
