# Database Migration & Query Expert - Agent Memory

## Schema Conventions (confirmed from migrations 001-016)

### ID Generation

- **Convention**: `VARCHAR(50) PRIMARY KEY DEFAULT 'prefix_' || replace(gen_random_uuid()::text, '-', '')`
- Prefixes: `evt_`, `ana_`, `act_`, `chk_`, `doc_`, `fb_`, `msg_`, `rcm_`, `aud_`, `usr_`, `oid_`, `rtk_`, `ost_`, `prc_`
- **Exception**: `analysis_jobs` (010) uses bare `UUID` -- likely oversight, not a new convention
- `tenants.id` is `VARCHAR(50)`, NOT `UUID` -- all `tenant_id` FK columns must be `VARCHAR(50)`

### Tenant ID Type

- `tenants.id` = `VARCHAR(50)` with `'ten_'` prefix
- ALL `tenant_id` foreign key columns use `VARCHAR(50)` to match
- Using `UUID` for `tenant_id` will cause FK constraint failure

### Timestamps

- Use `TIMESTAMPTZ`, never bare `TIMESTAMP`
- `DEFAULT NOW()` on `created_at` and `updated_at`
- Every table with `updated_at` has a trigger using `update_updated_at_column()` (defined in 001)

### Triggers

- Shared function: `update_updated_at_column()` in 001_schema.sql
- Some modules define their own (e.g., `update_rcm_updated_at()` in 003, `update_auth_updated_at()` in 012)
- 015 uses `DO $$ BEGIN IF NOT EXISTS ... END $$` pattern for conditional trigger creation

### Table Comments

- Every table gets a `COMMENT ON TABLE` statement

### Migration File Naming

- Sequential numbering: `001_`, `002_`, ..., `016_`
- No formal up/down framework -- all files are in `database/init/`
- Files are idempotent (`IF NOT EXISTS`, `IF NOT EXISTS`)

### Known Schema Gaps

- `analysis_jobs` (010) lacks `tenant_id` column -- pre-existing gap
- `analysis_jobs` uses bare `UUID` PK instead of prefixed VARCHAR(50)

## Column Type Preferences (from CLAUDE.md)

- `TEXT` over `VARCHAR` unless length constraint is business-critical
- `TIMESTAMPTZ` never `TIMESTAMP`
- `UUIDs` for PKs (but project actually uses VARCHAR(50) with prefix -- follow actual pattern)
- `readonly` on all TypeScript interfaces

## Common Patterns

- Adding columns to existing tables: `ALTER TABLE x ADD COLUMN IF NOT EXISTS y`
- Backfill migrations: separate file (see 013_backfill_analysis_repository.sql)
- Multi-step column addition: nullable first -> deploy -> backfill -> NOT NULL constraint later
- Partial indexes: `WHERE column IS NOT NULL` or `WHERE status = 'active'`
- JSONB columns: `DEFAULT '{}'` or `DEFAULT '[]'`

## Link: [patterns.md](./patterns.md) for query and repository patterns
