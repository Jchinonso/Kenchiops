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
} as const;

/**
 * Default values for audit logging
 */
export const AUDIT_DEFAULTS = {
  ACTOR: "system",
  LIMIT: 100,
  EMPTY_METADATA: "{}",
} as const;

// ==================== Query Templates ====================

/**
 * SQL query templates for tenant operations
 */
export const TENANT_QUERIES = {
  SELECT_ALL_FIELDS: "SELECT * FROM tenants",
  EXCLUDE_DELETED: "status != 'deleted'",
  ORDER_BY_CREATED: "ORDER BY created_at DESC",
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
