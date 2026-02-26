-- Migration 026: PII Separation (GDPR Data Minimization)
--
-- WHY: GDPR Article 5(1)(c) requires data minimization. Currently, PII (email,
-- display_name, avatar_url) is stored directly in the users table alongside
-- behavioral/auth data. This makes GDPR erasure requests complex — you must
-- selectively null columns rather than deleting a row.
--
-- With PII separated into user_pii, erasure becomes:
--   DELETE FROM user_pii WHERE user_id = $1
-- This removes all PII in one operation without touching auth/behavioral data.
--
-- MULTI-STEP DEPLOYMENT PLAN:
--   Step 1 (this migration): Create user_pii table, copy existing PII data.
--   Step 2 (code change): Update application to read/write PII from user_pii.
--   Step 3 (future migration): Drop email, display_name, avatar_url from users.
--
--   DO NOT drop columns from users in this migration. The application still
--   reads from users.email/display_name/avatar_url until the code is updated.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS user_pii;

-- ==================== PII Table ====================

CREATE TABLE IF NOT EXISTS user_pii (
    -- 1:1 relationship with users table
    user_id VARCHAR(50) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

    -- PII fields migrated from users table
    email TEXT,
    display_name TEXT,
    avatar_url TEXT,

    -- Immutable creation timestamp
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==================== Migrate Existing PII ====================
-- Copy PII from users table into user_pii for all existing users.
-- ON CONFLICT DO NOTHING makes this idempotent (safe to re-run).

INSERT INTO user_pii (user_id, email, display_name, avatar_url, created_at)
SELECT id, email, display_name, avatar_url, created_at
FROM users
WHERE id IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- ==================== Comments ====================

COMMENT ON TABLE user_pii IS
  'Separated PII storage for GDPR compliance. Contains email, display_name, '
  'and avatar_url migrated from users table. DELETE FROM user_pii WHERE user_id = $1 '
  'erases all PII for a user without touching auth/behavioral data.';

COMMENT ON COLUMN user_pii.user_id IS
  '1:1 foreign key to users(id). CASCADE delete ensures PII is removed when user is deleted.';

-- NOTE: Do NOT drop columns from the users table in this migration.
-- The application code must be updated first to read/write from user_pii.
-- A future migration (after code deployment) will:
--   ALTER TABLE users DROP COLUMN email;
--   ALTER TABLE users DROP COLUMN display_name;
--   ALTER TABLE users DROP COLUMN avatar_url;
