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
  SLACK_INSTALLED: "slack_installed",
  SLACK_UNINSTALLED: "slack_uninstalled",
  ACTIVATED: "activated",
  SUSPENDED: "suspended",
  DELETED: "deleted",
  PLAN_CHANGED: "plan_changed",
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
  // Lookup queries
  FIND_BY_GITHUB_INSTALLATION: `SELECT * FROM tenants WHERE github_installation_id = $1 AND status != $2`,
  FIND_BY_GITHUB_ORG: `SELECT * FROM tenants WHERE LOWER(github_org) = LOWER($1) AND status != $2`,
  FIND_BY_GITHUB_ORG_ANY_STATUS: `SELECT * FROM tenants WHERE LOWER(github_org) = LOWER($1)`,
  FIND_BY_SLACK_WORKSPACE: `SELECT * FROM tenants WHERE slack_workspace_id = $1 AND status != $2`,
  FIND_BY_ID: `SELECT * FROM tenants WHERE id = $1`,
  FIND_ACTIVE: `SELECT * FROM tenants WHERE status = $1 ORDER BY created_at DESC`,

  // Insert queries
  INSERT_FROM_GITHUB: `INSERT INTO tenants (github_org, github_installation_id, github_app_installed_at, status)
     VALUES ($1, $2, NOW(), $3)
     RETURNING *`,
  INSERT_FROM_SLACK: `INSERT INTO tenants (
       github_org,
       slack_workspace_id,
       slack_team_name,
       slack_bot_token,
       slack_bot_user_id,
       slack_app_installed_at,
       status
     )
     VALUES ($1, $2, $3, $4, $5, NOW(), $6)
     RETURNING *`,

  // Update queries
  UPDATE_GITHUB_INSTALL: `UPDATE tenants
     SET github_installation_id = $1,
         github_app_installed_at = NOW(),
         status = $2,
         updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
  UPDATE_SLACK_LINK: `UPDATE tenants
     SET slack_workspace_id = $1,
         slack_team_name = $2,
         slack_bot_token = $3,
         slack_bot_user_id = $4,
         slack_app_installed_at = NOW(),
         status = $5,
         updated_at = NOW()
     WHERE id = $6
     RETURNING *`,
  UPDATE_STATUS: `UPDATE tenants SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
  UPDATE_SLACK_TOKEN: `UPDATE tenants SET slack_bot_token = $1, updated_at = NOW() WHERE id = $2`,
  UPDATE_GITHUB_UNINSTALL: `UPDATE tenants
     SET github_installation_id = NULL,
         status = $1,
         updated_at = NOW()
     WHERE id = $2`,

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
  INSERT: `INSERT INTO tenant_audit_log (tenant_id, action, actor, metadata)
           VALUES ($1, $2, $3, $4)`,
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
  github_org: "githubOrg",
  github_installation_id: "githubInstallationId",
  github_app_installed_at: "githubAppInstalledAt",
  slack_workspace_id: "slackWorkspaceId",
  slack_team_name: "slackTeamName",
  slack_bot_token: "slackBotToken",
  slack_bot_user_id: "slackBotUserId",
  slack_app_installed_at: "slackAppInstalledAt",
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
