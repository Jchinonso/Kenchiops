/**
 * Tenant Service
 *
 * Handles multi-tenant operations including tenant lookup, creation, and lifecycle management.
 * This service is the central point for all tenant-related database operations.
 */

import { query, transaction } from "./database.js";
import { createLogger } from "./logger.js";
import { NotFoundError } from "./errors.js";
import type {
  Tenant,
  TenantStatus,
  CreateTenantFromGitHub,
  LinkSlackWorkspace,
  TenantAuditAction,
  TenantAuditEntry,
} from "./types.js";

const logger = createLogger("tenant-service");

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

// ==================== Lookup Methods ====================

/**
 * Find a tenant by GitHub installation ID.
 * Used when processing GitHub webhooks.
 *
 * @param installationId - GitHub App installation ID
 * @returns Tenant if found, null otherwise
 */
export const findByGitHubInstallation = async (installationId: number): Promise<Tenant | null> => {
  const result = await query<TenantRow>(
    `SELECT * FROM tenants WHERE github_installation_id = $1 AND status != 'deleted'`,
    [installationId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return rowToTenant(result.rows[0]);
};

/**
 * Find a tenant by GitHub organization name.
 * Used for matching Slack workspaces to existing tenants.
 *
 * @param org - GitHub organization login name
 * @returns Tenant if found, null otherwise
 */
export const findByGitHubOrg = async (org: string): Promise<Tenant | null> => {
  const result = await query<TenantRow>(
    `SELECT * FROM tenants WHERE LOWER(github_org) = LOWER($1) AND status != 'deleted'`,
    [org]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return rowToTenant(result.rows[0]);
};

/**
 * Find a tenant by Slack workspace ID.
 * Used when processing Slack events.
 *
 * @param workspaceId - Slack workspace/team ID
 * @returns Tenant if found, null otherwise
 */
export const findBySlackWorkspace = async (workspaceId: string): Promise<Tenant | null> => {
  const result = await query<TenantRow>(
    `SELECT * FROM tenants WHERE slack_workspace_id = $1 AND status != 'deleted'`,
    [workspaceId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return rowToTenant(result.rows[0]);
};

/**
 * Find a tenant by ID.
 *
 * @param id - Tenant ID
 * @returns Tenant if found, null otherwise
 */
export const findById = async (id: string): Promise<Tenant | null> => {
  const result = await query<TenantRow>(`SELECT * FROM tenants WHERE id = $1`, [id]);

  if (result.rows.length === 0) {
    return null;
  }

  return rowToTenant(result.rows[0]);
};

/**
 * Get all active tenants.
 *
 * @returns Array of active tenants
 */
export const getActiveTenants = async (): Promise<readonly Tenant[]> => {
  const result = await query<TenantRow>(
    `SELECT * FROM tenants WHERE status = 'active' ORDER BY created_at DESC`
  );

  return result.rows.map(rowToTenant);
};

// ==================== Creation/Update Methods ====================

/**
 * Create a new tenant from GitHub App installation.
 * Called when a user installs the GitHub App.
 *
 * @param data - GitHub installation data
 * @returns Created tenant
 */
export const createFromGitHubInstall = async (data: CreateTenantFromGitHub): Promise<Tenant> => {
  const result = await transaction(async (client) => {
    // Check if tenant already exists for this org
    const existing = await client.query<TenantRow>(
      `SELECT * FROM tenants WHERE LOWER(github_org) = LOWER($1)`,
      [data.githubOrg]
    );

    if (existing.rows.length > 0) {
      // Update existing tenant with new installation ID
      const updated = await client.query<TenantRow>(
        `UPDATE tenants
         SET github_installation_id = $1,
             github_app_installed_at = NOW(),
             status = CASE
               WHEN slack_workspace_id IS NOT NULL THEN 'active'
               ELSE 'pending_slack'
             END,
             updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [data.githubInstallationId, existing.rows[0].id]
      );

      // Log audit event
      await client.query(
        `INSERT INTO tenant_audit_log (tenant_id, action, actor, metadata)
         VALUES ($1, 'github_installed', 'system', $2)`,
        [
          updated.rows[0].id,
          JSON.stringify({
            installationId: data.githubInstallationId,
            reinstall: true,
          }),
        ]
      );

      return updated.rows[0];
    }

    // Create new tenant
    const created = await client.query<TenantRow>(
      `INSERT INTO tenants (github_org, github_installation_id, github_app_installed_at, status)
       VALUES ($1, $2, NOW(), 'pending_slack')
       RETURNING *`,
      [data.githubOrg, data.githubInstallationId]
    );

    // Log audit event
    await client.query(
      `INSERT INTO tenant_audit_log (tenant_id, action, actor, metadata)
       VALUES ($1, 'github_installed', 'system', $2)`,
      [created.rows[0].id, JSON.stringify({ installationId: data.githubInstallationId })]
    );

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
 *
 * @param data - Slack workspace data
 * @returns Updated tenant
 */
export const linkSlackWorkspace = async (data: LinkSlackWorkspace): Promise<Tenant> => {
  const result = await transaction(async (client) => {
    const updated = await client.query<TenantRow>(
      `UPDATE tenants
       SET slack_workspace_id = $1,
           slack_team_name = $2,
           slack_bot_token = $3,
           slack_bot_user_id = $4,
           slack_app_installed_at = NOW(),
           status = CASE
             WHEN github_installation_id IS NOT NULL THEN 'active'
             ELSE 'pending_github'
           END,
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [
        data.slackWorkspaceId,
        data.slackTeamName,
        data.slackBotToken,
        data.slackBotUserId ?? null,
        data.tenantId,
      ]
    );

    if (updated.rows.length === 0) {
      throw new NotFoundError(`Tenant not found: ${data.tenantId}`);
    }

    // Log audit event
    await client.query(
      `INSERT INTO tenant_audit_log (tenant_id, action, actor, metadata)
       VALUES ($1, 'slack_installed', 'system', $2)`,
      [
        data.tenantId,
        JSON.stringify({
          workspaceId: data.slackWorkspaceId,
          teamName: data.slackTeamName,
        }),
      ]
    );

    // If tenant is now active, log activation
    if (updated.rows[0].status === "active") {
      await client.query(
        `INSERT INTO tenant_audit_log (tenant_id, action, actor, metadata)
         VALUES ($1, 'activated', 'system', '{}')`,
        [data.tenantId]
      );
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
 *
 * @param slackData - Slack workspace data
 * @param githubOrgHint - Optional hint for GitHub org name
 * @returns Created tenant
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
       VALUES ($1, $2, $3, $4, $5, NOW(), 'pending_github')
       RETURNING *`,
      [
        orgName,
        slackData.slackWorkspaceId,
        slackData.slackTeamName,
        slackData.slackBotToken,
        slackData.slackBotUserId ?? null,
      ]
    );

    await client.query(
      `INSERT INTO tenant_audit_log (tenant_id, action, actor, metadata)
       VALUES ($1, 'slack_installed', 'system', $2)`,
      [
        created.rows[0].id,
        JSON.stringify({
          workspaceId: slackData.slackWorkspaceId,
          teamName: slackData.slackTeamName,
        }),
      ]
    );

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
 * Activate a tenant.
 *
 * @param tenantId - Tenant ID
 * @returns Updated tenant
 */
export const activate = async (tenantId: string): Promise<Tenant> => {
  const result = await transaction(async (client) => {
    const updated = await client.query<TenantRow>(
      `UPDATE tenants SET status = 'active', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [tenantId]
    );

    if (updated.rows.length === 0) {
      throw new NotFoundError(`Tenant not found: ${tenantId}`);
    }

    await client.query(
      `INSERT INTO tenant_audit_log (tenant_id, action, actor, metadata)
       VALUES ($1, 'activated', 'system', '{}')`,
      [tenantId]
    );

    return updated.rows[0];
  });

  logger.info("Tenant activated", { tenantId });
  return rowToTenant(result);
};

/**
 * Suspend a tenant.
 *
 * @param tenantId - Tenant ID
 * @param reason - Reason for suspension
 * @returns Updated tenant
 */
export const suspend = async (tenantId: string, reason?: string): Promise<Tenant> => {
  const result = await transaction(async (client) => {
    const updated = await client.query<TenantRow>(
      `UPDATE tenants SET status = 'suspended', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [tenantId]
    );

    if (updated.rows.length === 0) {
      throw new NotFoundError(`Tenant not found: ${tenantId}`);
    }

    await client.query(
      `INSERT INTO tenant_audit_log (tenant_id, action, actor, metadata)
       VALUES ($1, 'suspended', 'system', $2)`,
      [tenantId, JSON.stringify({ reason: reason ?? "No reason provided" })]
    );

    return updated.rows[0];
  });

  logger.info("Tenant suspended", { tenantId, reason });
  return rowToTenant(result);
};

/**
 * Soft delete a tenant (typically on GitHub App uninstall).
 *
 * @param tenantId - Tenant ID
 */
export const deleteTenant = async (tenantId: string): Promise<void> => {
  await transaction(async (client) => {
    await client.query(`UPDATE tenants SET status = 'deleted', updated_at = NOW() WHERE id = $1`, [
      tenantId,
    ]);

    await client.query(
      `INSERT INTO tenant_audit_log (tenant_id, action, actor, metadata)
       VALUES ($1, 'deleted', 'system', '{}')`,
      [tenantId]
    );
  });

  logger.info("Tenant deleted", { tenantId });
};

/**
 * Handle GitHub App uninstallation.
 *
 * @param installationId - GitHub installation ID
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
           status = 'deleted',
           updated_at = NOW()
       WHERE id = $1`,
      [tenant.id]
    );

    await client.query(
      `INSERT INTO tenant_audit_log (tenant_id, action, actor, metadata)
       VALUES ($1, 'github_uninstalled', 'system', $2)`,
      [tenant.id, JSON.stringify({ installationId })]
    );
  });

  logger.info("Handled GitHub App uninstallation", {
    tenantId: tenant.id,
    installationId,
  });
};

// ==================== Audit Log ====================

/**
 * Log an audit event for a tenant.
 *
 * @param tenantId - Tenant ID
 * @param action - Audit action
 * @param metadata - Additional metadata
 * @param actor - Actor performing the action
 */
export const logAuditEvent = async (
  tenantId: string,
  action: TenantAuditAction,
  metadata: Record<string, unknown> = {},
  actor: string = "system"
): Promise<void> => {
  await query(
    `INSERT INTO tenant_audit_log (tenant_id, action, actor, metadata)
     VALUES ($1, $2, $3, $4)`,
    [tenantId, action, actor, JSON.stringify(metadata)]
  );
};

/**
 * Get audit log entries for a tenant.
 *
 * @param tenantId - Tenant ID
 * @param limit - Maximum entries to return
 * @returns Audit log entries
 */
export const getAuditLog = async (
  tenantId: string,
  limit: number = 100
): Promise<readonly TenantAuditEntry[]> => {
  const result = await query<AuditRow>(
    `SELECT * FROM tenant_audit_log
     WHERE tenant_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [tenantId, limit]
  );

  return result.rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    action: row.action,
    actor: row.actor,
    metadata: row.metadata,
    createdAt: row.created_at,
  }));
};

// ==================== Utility ====================

/**
 * Update Slack bot token for a tenant.
 * Used when tokens are refreshed.
 *
 * @param tenantId - Tenant ID
 * @param newToken - New Slack bot token
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
 *
 * @param installationId - GitHub installation ID
 * @returns Slack credentials or null
 */
export const getSlackCredentials = async (
  installationId: number
): Promise<{ token: string; workspaceId: string; botUserId: string | null } | null> => {
  const tenant = await findByGitHubInstallation(installationId);

  if (!tenant || !tenant.slackBotToken || !tenant.slackWorkspaceId) {
    return null;
  }

  return {
    token: tenant.slackBotToken,
    workspaceId: tenant.slackWorkspaceId,
    botUserId: tenant.slackBotUserId,
  };
};
