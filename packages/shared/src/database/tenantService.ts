/**
 * Tenant Service
 *
 * Handles multi-tenant operations including tenant lookup, creation, and lifecycle management.
 * This service is the central point for all tenant-related database operations.
 */

import pg from "pg";
import { query, transaction } from "./client.js";
import { createLogger, parseDbCount } from "../core/index.js";
import { NotFoundError } from "../core/errors.js";
import { TENANT_STATUS, AUDIT_ACTIONS, AUDIT_DEFAULTS, AUDIT_QUERIES } from "../constants/index.js";
import type {
  Tenant,
  TenantStatus,
  CreateTenantFromGitHub,
  LinkSlackWorkspace,
  TenantAuditAction,
  TenantAuditEntry,
} from "../core/types.js";

const logger = createLogger("tenant-service");

// ==================== Types ====================

/**
 * Database row type for tenants table
 */
interface TenantRow {
  readonly id: string;
  readonly github_org: string;
  readonly github_installation_id: number | null;
  readonly github_app_installed_at: Date | null;
  readonly slack_workspace_id: string | null;
  readonly slack_team_name: string | null;
  readonly slack_bot_token: string | null;
  readonly slack_bot_user_id: string | null;
  readonly slack_app_installed_at: Date | null;
  readonly status: TenantStatus;
  readonly created_at: Date;
  readonly updated_at: Date;
}

/**
 * Database row type for tenant_audit_log table
 */
interface AuditRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly action: TenantAuditAction;
  readonly actor: string | null;
  readonly metadata: Record<string, unknown>;
  readonly created_at: Date;
}

/**
 * Statistics for a tenant's activity
 */
export interface TenantStatistics {
  readonly failuresAnalyzedToday: number;
  readonly totalAlertsSent: number;
  readonly lastAlertTime: Date | null;
}

// ==================== Row Converters ====================

/**
 * Convert database row to Tenant entity
 */
const rowToTenant = (row: TenantRow): Tenant => ({
  id: row.id,
  githubOrg: row.github_org,
  githubInstallationId: row.github_installation_id,
  githubAppInstalledAt: row.github_app_installed_at,
  slackWorkspaceId: row.slack_workspace_id,
  slackTeamName: row.slack_team_name,
  slackBotToken: row.slack_bot_token,
  slackBotUserId: row.slack_bot_user_id,
  slackAppInstalledAt: row.slack_app_installed_at,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * Convert database row to TenantAuditEntry
 */
const rowToAuditEntry = (row: AuditRow): TenantAuditEntry => ({
  id: row.id,
  tenantId: row.tenant_id,
  action: row.action,
  actor: row.actor,
  metadata: row.metadata,
  createdAt: row.created_at,
});

// ==================== Internal Helpers ====================

/**
 * Extract first row from query result, converting to Tenant or null
 */
const extractTenant = (rows: readonly TenantRow[]): Tenant | null =>
  rows.length > 0 ? rowToTenant(rows[0]) : null;

/**
 * Insert an audit log entry within a transaction
 */
const insertAuditLog = async (
  client: pg.PoolClient,
  tenantId: string,
  action: TenantAuditAction,
  metadata: Record<string, unknown> = {}
): Promise<void> => {
  await client.query(AUDIT_QUERIES.INSERT, [
    tenantId,
    action,
    AUDIT_DEFAULTS.ACTOR,
    JSON.stringify(metadata),
  ]);
};

/**
 * Determine new status after GitHub installation
 */
const getStatusAfterGitHubInstall = (hasSlack: boolean): TenantStatus =>
  hasSlack ? TENANT_STATUS.ACTIVE : TENANT_STATUS.PENDING_SLACK;

/**
 * Determine new status after Slack installation
 */
const getStatusAfterSlackInstall = (hasGitHub: boolean): TenantStatus =>
  hasGitHub ? TENANT_STATUS.ACTIVE : TENANT_STATUS.PENDING_GITHUB;

// ==================== Lookup Methods ====================

/**
 * Find a tenant by GitHub installation ID.
 * Used when processing GitHub webhooks.
 */
export const findByGitHubInstallation = async (installationId: number): Promise<Tenant | null> => {
  const result = await query<TenantRow>(
    `SELECT * FROM tenants WHERE github_installation_id = $1 AND status != $2`,
    [installationId, TENANT_STATUS.DELETED]
  );
  return extractTenant(result.rows);
};

/**
 * Find a tenant by GitHub organization name.
 * Used for matching Slack workspaces to existing tenants.
 */
export const findByGitHubOrg = async (org: string): Promise<Tenant | null> => {
  const result = await query<TenantRow>(
    `SELECT * FROM tenants WHERE LOWER(github_org) = LOWER($1) AND status != $2`,
    [org, TENANT_STATUS.DELETED]
  );
  return extractTenant(result.rows);
};

/**
 * Find a tenant by Slack workspace ID.
 * Used when processing Slack events.
 */
export const findBySlackWorkspace = async (workspaceId: string): Promise<Tenant | null> => {
  const result = await query<TenantRow>(
    `SELECT * FROM tenants WHERE slack_workspace_id = $1 AND status != $2`,
    [workspaceId, TENANT_STATUS.DELETED]
  );
  return extractTenant(result.rows);
};

/**
 * Find a tenant by ID.
 */
export const findById = async (id: string): Promise<Tenant | null> => {
  const result = await query<TenantRow>(`SELECT * FROM tenants WHERE id = $1`, [id]);
  return extractTenant(result.rows);
};

/**
 * Get all active tenants.
 */
export const getActiveTenants = async (): Promise<readonly Tenant[]> => {
  const result = await query<TenantRow>(
    `SELECT * FROM tenants WHERE status = $1 ORDER BY created_at DESC`,
    [TENANT_STATUS.ACTIVE]
  );
  return result.rows.map(rowToTenant);
};

// ==================== Creation/Update Methods ====================

/**
 * Create a new tenant from GitHub App installation.
 * Called when a user installs the GitHub App.
 */
export const createFromGitHubInstall = async (data: CreateTenantFromGitHub): Promise<Tenant> => {
  const result = await transaction(async (client) => {
    // Check if tenant already exists for this org
    const existing = await client.query<TenantRow>(
      `SELECT * FROM tenants WHERE LOWER(github_org) = LOWER($1)`,
      [data.githubOrg]
    );

    if (existing.rows.length > 0) {
      const existingRow = existing.rows[0];
      const newStatus = getStatusAfterGitHubInstall(existingRow.slack_workspace_id !== null);

      const updated = await client.query<TenantRow>(
        `UPDATE tenants
         SET github_installation_id = $1,
             github_app_installed_at = NOW(),
             status = $2,
             updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [data.githubInstallationId, newStatus, existingRow.id]
      );

      await insertAuditLog(client, updated.rows[0].id, AUDIT_ACTIONS.GITHUB_INSTALLED, {
        installationId: data.githubInstallationId,
        reinstall: true,
      });

      return updated.rows[0];
    }

    // Create new tenant
    const created = await client.query<TenantRow>(
      `INSERT INTO tenants (github_org, github_installation_id, github_app_installed_at, status)
       VALUES ($1, $2, NOW(), $3)
       RETURNING *`,
      [data.githubOrg, data.githubInstallationId, TENANT_STATUS.PENDING_SLACK]
    );

    await insertAuditLog(client, created.rows[0].id, AUDIT_ACTIONS.GITHUB_INSTALLED, {
      installationId: data.githubInstallationId,
    });

    return created.rows[0];
  });

  logger.info("Tenant created/updated from GitHub installation", {
    tenantId: result.id,
    githubOrg: data.githubOrg,
    installationId: data.githubInstallationId,
  });

  return rowToTenant(result);
};

/**
 * Link a Slack workspace to an existing tenant.
 * Called after Slack OAuth completes.
 */
export const linkSlackWorkspace = async (data: LinkSlackWorkspace): Promise<Tenant> => {
  const result = await transaction(async (client) => {
    const current = await client.query<TenantRow>(`SELECT * FROM tenants WHERE id = $1`, [
      data.tenantId,
    ]);

    if (current.rows.length === 0) {
      throw new NotFoundError(`Tenant not found: ${data.tenantId}`);
    }

    const newStatus = getStatusAfterSlackInstall(current.rows[0].github_installation_id !== null);

    const updated = await client.query<TenantRow>(
      `UPDATE tenants
       SET slack_workspace_id = $1,
           slack_team_name = $2,
           slack_bot_token = $3,
           slack_bot_user_id = $4,
           slack_app_installed_at = NOW(),
           status = $5,
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [
        data.slackWorkspaceId,
        data.slackTeamName,
        data.slackBotToken,
        data.slackBotUserId ?? null,
        newStatus,
        data.tenantId,
      ]
    );

    await insertAuditLog(client, data.tenantId, AUDIT_ACTIONS.SLACK_INSTALLED, {
      workspaceId: data.slackWorkspaceId,
      teamName: data.slackTeamName,
    });

    // Log activation if tenant is now active
    if (newStatus === TENANT_STATUS.ACTIVE) {
      await insertAuditLog(client, data.tenantId, AUDIT_ACTIONS.ACTIVATED, {});
    }

    return updated.rows[0];
  });

  logger.info("Slack workspace linked to tenant", {
    tenantId: data.tenantId,
    workspaceId: data.slackWorkspaceId,
    status: result.status,
  });

  return rowToTenant(result);
};

/**
 * Create a tenant from Slack installation (before GitHub App is installed).
 */
export const createFromSlackInstall = async (
  slackData: Omit<LinkSlackWorkspace, "tenantId">,
  githubOrgHint?: string
): Promise<Tenant> => {
  const orgName = githubOrgHint || slackData.slackTeamName;

  const result = await transaction(async (client) => {
    const created = await client.query<TenantRow>(
      `INSERT INTO tenants (
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
      [
        orgName,
        slackData.slackWorkspaceId,
        slackData.slackTeamName,
        slackData.slackBotToken,
        slackData.slackBotUserId ?? null,
        TENANT_STATUS.PENDING_GITHUB,
      ]
    );

    await insertAuditLog(client, created.rows[0].id, AUDIT_ACTIONS.SLACK_INSTALLED, {
      workspaceId: slackData.slackWorkspaceId,
      teamName: slackData.slackTeamName,
    });

    return created.rows[0];
  });

  logger.info("Tenant created from Slack installation", {
    tenantId: result.id,
    workspaceId: slackData.slackWorkspaceId,
  });

  return rowToTenant(result);
};

// ==================== Status Management ====================

/**
 * Update tenant status with audit logging
 */
const updateStatus = async (
  tenantId: string,
  newStatus: TenantStatus,
  auditAction: TenantAuditAction,
  metadata: Record<string, unknown> = {}
): Promise<Tenant> => {
  const result = await transaction(async (client) => {
    const updated = await client.query<TenantRow>(
      `UPDATE tenants SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [newStatus, tenantId]
    );

    if (updated.rows.length === 0) {
      throw new NotFoundError(`Tenant not found: ${tenantId}`);
    }

    await insertAuditLog(client, tenantId, auditAction, metadata);
    return updated.rows[0];
  });

  return rowToTenant(result);
};

/**
 * Activate a tenant.
 */
export const activate = async (tenantId: string): Promise<Tenant> => {
  const tenant = await updateStatus(tenantId, TENANT_STATUS.ACTIVE, AUDIT_ACTIONS.ACTIVATED);
  logger.info("Tenant activated", { tenantId });
  return tenant;
};

/**
 * Suspend a tenant.
 */
export const suspend = async (tenantId: string, reason?: string): Promise<Tenant> => {
  const tenant = await updateStatus(tenantId, TENANT_STATUS.SUSPENDED, AUDIT_ACTIONS.SUSPENDED, {
    reason: reason ?? "No reason provided",
  });
  logger.info("Tenant suspended", { tenantId, reason });
  return tenant;
};

/**
 * Soft delete a tenant (typically on GitHub App uninstall).
 */
export const deleteTenant = async (tenantId: string): Promise<void> => {
  await updateStatus(tenantId, TENANT_STATUS.DELETED, AUDIT_ACTIONS.DELETED);
  logger.info("Tenant deleted", { tenantId });
};

/**
 * Handle GitHub App uninstallation.
 */
export const handleGitHubUninstall = async (installationId: number): Promise<void> => {
  const tenant = await findByGitHubInstallation(installationId);

  if (!tenant) {
    logger.warn("GitHub uninstall for unknown installation", { installationId });
    return;
  }

  await transaction(async (client) => {
    await client.query(
      `UPDATE tenants
       SET github_installation_id = NULL,
           status = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [TENANT_STATUS.DELETED, tenant.id]
    );

    await insertAuditLog(client, tenant.id, AUDIT_ACTIONS.GITHUB_UNINSTALLED, { installationId });
  });

  logger.info("Handled GitHub App uninstallation", {
    tenantId: tenant.id,
    installationId,
  });
};

// ==================== Audit Log ====================

/**
 * Log an audit event for a tenant.
 */
export const logAuditEvent = async (
  tenantId: string,
  action: TenantAuditAction,
  metadata: Record<string, unknown> = {},
  actor: string = AUDIT_DEFAULTS.ACTOR
): Promise<void> => {
  await query(AUDIT_QUERIES.INSERT, [tenantId, action, actor, JSON.stringify(metadata)]);
};

/**
 * Get audit log entries for a tenant.
 */
export const getAuditLog = async (
  tenantId: string,
  limit: number = AUDIT_DEFAULTS.LIMIT
): Promise<readonly TenantAuditEntry[]> => {
  const result = await query<AuditRow>(AUDIT_QUERIES.SELECT_BY_TENANT, [tenantId, limit]);
  return result.rows.map(rowToAuditEntry);
};

// ==================== Statistics ====================

/**
 * Get activity statistics for a tenant.
 * Used for the App Home dashboard display.
 */
export const getTenantStatistics = async (tenantId: string): Promise<TenantStatistics> => {
  const [analysesToday, alertsTotal, lastAlert] = await Promise.all([
    query<{ count: string }>(
      `SELECT COUNT(*) as count FROM analyses
       WHERE tenant_id = $1 AND created_at >= CURRENT_DATE`,
      [tenantId]
    ),
    query<{ count: string }>(`SELECT COUNT(*) as count FROM slack_messages WHERE tenant_id = $1`, [
      tenantId,
    ]),
    query<{ created_at: Date }>(
      `SELECT created_at FROM slack_messages
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [tenantId]
    ),
  ]);

  return {
    failuresAnalyzedToday: parseDbCount(analysesToday.rows),
    totalAlertsSent: parseDbCount(alertsTotal.rows),
    lastAlertTime: lastAlert.rows[0]?.created_at ?? null,
  };
};

// ==================== Utility ====================

/**
 * Update Slack bot token for a tenant.
 * Used when tokens are refreshed.
 */
export const updateSlackToken = async (tenantId: string, newToken: string): Promise<void> => {
  await query(`UPDATE tenants SET slack_bot_token = $1, updated_at = NOW() WHERE id = $2`, [
    newToken,
    tenantId,
  ]);
  logger.info("Slack token updated", { tenantId });
};

/**
 * Get Slack credentials for a tenant by GitHub installation ID.
 * Used by the Slack bot to get tenant-specific credentials.
 */
export const getSlackCredentials = async (
  installationId: number
): Promise<{ token: string; workspaceId: string; botUserId: string | null } | null> => {
  const tenant = await findByGitHubInstallation(installationId);

  if (!tenant?.slackBotToken || !tenant.slackWorkspaceId) {
    return null;
  }

  return {
    token: tenant.slackBotToken,
    workspaceId: tenant.slackWorkspaceId,
    botUserId: tenant.slackBotUserId,
  };
};
