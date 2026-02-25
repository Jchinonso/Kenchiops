/**
 * Tenant Service Constants
 *
 * Centralized configuration for tenant operations, status management,
 * and audit logging.
 */

// ==================== Status Values ====================

/**
 * Tenant status values
 */
export const TENANT_STATUS = {
  PENDING_SLACK: "pending_slack",
  PENDING_GITHUB: "pending_github",
  ACTIVE: "active",
  SUSPENDED: "suspended",
  DELETED: "deleted",
} as const;

// ==================== Audit Configuration ====================

/**
 * Audit action identifiers
 */
export const AUDIT_ACTIONS = {
  GITHUB_INSTALLED: "github_installed",
  GITHUB_UNINSTALLED: "github_uninstalled",
  GITHUB_LINKED: "github_linked",
  GITLAB_LINKED: "gitlab_linked",
  BITBUCKET_LINKED: "bitbucket_linked",
  AZURE_DEVOPS_LINKED: "azure_devops_linked",
  SLACK_INSTALLED: "slack_installed",
  SLACK_UNINSTALLED: "slack_uninstalled",
  ACTIVATED: "activated",
  SUSPENDED: "suspended",
  DELETED: "deleted",
  PLAN_CHANGED: "plan_changed",
  MEMBER_ROLE_CHANGED: "member_role_changed",
  MEMBER_REMOVED: "member_removed",
  MEMBER_ADDED: "member_added",
  ORG_SWITCHED: "org_switched",
  MEMBERSHIP_RECONCILED: "membership_reconciled",
  MEMBER_SESSIONS_REVOKED: "member.sessions_revoked",
  TENANT_SESSIONS_REVOKED: "tenant.sessions_revoked",
} as const;

/**
 * Default values for audit logging
 */
export const AUDIT_DEFAULTS = {
  ACTOR: "system",
  LIMIT: 100,
  EMPTY_METADATA: "{}",
} as const;

/**
 * Default values for tenant operations
 */
export const TENANT_DEFAULTS = {
  SUSPENSION_REASON: "No reason provided",
} as const;

/**
 * Default RAG budget configuration values for tenants
 */
export const RAG_BUDGET_DEFAULTS = {
  MONTHLY_BUDGET_USD: 0,
  PREFERRED_TIER: "STANDARD",
  ALLOW_PREMIUM: false,
  DEGRADE_ON_BUDGET_WARNING: true,
} as const;

// ==================== Query Templates ====================

/**
 * SQL query templates for tenant operations.
 * All queries use parameterized statements to prevent SQL injection.
 */
export const TENANT_QUERIES = {
  // Lookup queries (provider-neutral — provider-specific lookups are in providerConnection/repository)
  FIND_BY_ORG_NAME: `SELECT * FROM tenants WHERE LOWER(org_name) = LOWER($1) AND status != $2`,
  FIND_BY_ORG_NAME_ANY_STATUS: `SELECT * FROM tenants WHERE LOWER(org_name) = LOWER($1)`,
  FIND_BY_ID: `SELECT * FROM tenants WHERE id = $1`,
  FIND_ACTIVE: `SELECT * FROM tenants WHERE status = $1 ORDER BY created_at DESC`,

  // Provider-scoped lookup
  FIND_BY_ORG_NAME_AND_PROVIDER: `SELECT * FROM tenants WHERE LOWER(org_name) = LOWER($1) AND provider = $2 AND status != $3`,

  // Insert queries (provider-neutral — provider connections created separately)
  INSERT_TENANT: `INSERT INTO tenants (org_name, status)
     VALUES ($1, $2)
     RETURNING *`,

  INSERT_TENANT_WITH_PROVIDER: `INSERT INTO tenants (org_name, provider, status)
     VALUES ($1, $2, $3)
     RETURNING *`,

  // Update queries
  UPDATE_STATUS: `UPDATE tenants SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,

  // Statistics queries
  STATS_ANALYSES_TODAY: `SELECT COUNT(*) as count FROM analyses
     WHERE tenant_id = $1 AND created_at >= CURRENT_DATE`,
  STATS_ALERTS_TOTAL: `SELECT COUNT(*) as count FROM slack_messages WHERE tenant_id = $1`,
  STATS_LAST_ALERT: `SELECT created_at FROM slack_messages
     WHERE tenant_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
} as const;

/**
 * Audit log query templates
 */
export const AUDIT_QUERIES = {
  /**
   * Insert with hash chain for tamper evidence (SOC 2 Type II).
   *
   * Computes entry_hash = SHA-256(previous_hash + tenant_id + action + metadata + created_at).
   * The previous_hash is fetched from the most recent entry for this tenant.
   * If no previous entry exists, previous_hash defaults to '0' (genesis entry).
   *
   * Falls back gracefully if hash columns don't exist yet (migration pending).
   */
  INSERT: `
    WITH prev AS (
      SELECT COALESCE(entry_hash, '0') AS prev_hash
      FROM tenant_audit_log
      WHERE tenant_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    ),
    genesis AS (
      SELECT '0' AS prev_hash
    ),
    chain AS (
      SELECT COALESCE((SELECT prev_hash FROM prev), (SELECT prev_hash FROM genesis)) AS prev_hash
    )
    INSERT INTO tenant_audit_log (tenant_id, action, actor, metadata, previous_hash, entry_hash)
    SELECT
      $1, $2, $3, $4,
      chain.prev_hash,
      encode(sha256(convert_to(chain.prev_hash || $1 || $2 || $4 || NOW()::text, 'UTF8')), 'hex')
    FROM chain
  `,
  SELECT_BY_TENANT: `SELECT * FROM tenant_audit_log
                     WHERE tenant_id = $1
                     ORDER BY created_at DESC
                     LIMIT $2`,
} as const;

// ==================== Field Mappings ====================

/**
 * Database column to entity field mappings for tenants
 * Used for consistent row-to-entity transformation
 */
export const TENANT_FIELD_MAP = {
  id: "id",
  org_name: "orgName",
  status: "status",
  created_at: "createdAt",
  updated_at: "updatedAt",
} as const;

/**
 * Database column to entity field mappings for audit entries
 */
export const AUDIT_FIELD_MAP = {
  id: "id",
  tenant_id: "tenantId",
  action: "action",
  actor: "actor",
  metadata: "metadata",
  created_at: "createdAt",
} as const;
