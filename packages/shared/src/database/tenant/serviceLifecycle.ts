/**
 * Tenant Lifecycle Service
 *
 * Creation, update, and status management for tenants.
 *
 * @module database/tenant/serviceLifecycle
 */

import {
  query,
  transaction,
  createLogger,
  getErrorMessage,
  NotFoundError,
  TENANT_STATUS,
  AUDIT_ACTIONS,
  TENANT_DEFAULTS,
  TENANT_QUERIES,
  type Tenant,
  type TenantStatus,
  type TenantAuditAction,
  type CreateTenantFromGitHub,
  type CreateTenantFromGitLab,
  type LinkSlackWorkspace,
} from "../common.js";
import { encryptValue } from "../../security/encryption.js";
import { insertAuditLog } from "./audit.js";
import {
  validateId,
  validateInstallationId,
  validateGitHubInstallInput,
  validateSlackLinkInput,
  validateSlackInstallInput,
  rowToTenant,
  getStatusAfterGitHubInstall,
  getStatusAfterSlackInstall,
} from "./helpers.js";
import type { TenantRow } from "./types.js";
import { findByGitHubInstallation } from "./serviceLookup.js";

const logger = createLogger("tenant-service");

/**
 * Create a new tenant from GitHub App installation.
 *
 * @param data - GitHub installation data
 * @returns Created or updated tenant
 */
export const createFromGitHubInstall = async (data: CreateTenantFromGitHub): Promise<Tenant> => {
  validateGitHubInstallInput(data);

  try {
    const result = await transaction(async (client) => {
      const existing = await client.query<TenantRow>(TENANT_QUERIES.FIND_BY_ORG_NAME_ANY_STATUS, [
        data.orgName,
      ]);

      if (existing.rows.length > 0) {
        const existingRow = existing.rows[0];
        const newStatus = getStatusAfterGitHubInstall(existingRow.slack_workspace_id !== null);

        const updated = await client.query<TenantRow>(TENANT_QUERIES.UPDATE_GITHUB_INSTALL, [
          data.githubInstallationId,
          newStatus,
          existingRow.id,
        ]);

        await insertAuditLog(client, updated.rows[0].id, AUDIT_ACTIONS.GITHUB_INSTALLED, {
          installationId: data.githubInstallationId,
          reinstall: true,
        });

        return updated.rows[0];
      }

      const created = await client.query<TenantRow>(TENANT_QUERIES.INSERT_FROM_GITHUB, [
        data.orgName,
        data.githubInstallationId,
        TENANT_STATUS.PENDING_SLACK,
      ]);

      await insertAuditLog(client, created.rows[0].id, AUDIT_ACTIONS.GITHUB_INSTALLED, {
        installationId: data.githubInstallationId,
      });

      return created.rows[0];
    });

    logger.info("Tenant created/updated from GitHub installation", {
      tenantId: result.id,
      orgName: data.orgName,
      installationId: data.githubInstallationId,
    });

    return rowToTenant(result);
  } catch (error) {
    logger.error("Failed to create tenant from GitHub installation", {
      orgName: data.orgName,
      installationId: data.githubInstallationId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Link a Slack workspace to an existing tenant.
 *
 * @param data - Slack workspace data to link
 * @returns Updated tenant
 */
export const linkSlackWorkspace = async (data: LinkSlackWorkspace): Promise<Tenant> => {
  validateSlackLinkInput(data);

  try {
    const result = await transaction(async (client) => {
      const current = await client.query<TenantRow>(TENANT_QUERIES.FIND_BY_ID, [data.tenantId]);

      if (current.rows.length === 0) {
        throw new NotFoundError(`Tenant not found: ${data.tenantId}`);
      }

      const newStatus = getStatusAfterSlackInstall(current.rows[0].github_installation_id !== null);

      const updated = await client.query<TenantRow>(TENANT_QUERIES.UPDATE_SLACK_LINK, [
        data.slackWorkspaceId,
        data.slackTeamName,
        encryptValue(data.slackBotToken),
        data.slackBotUserId ?? null,
        newStatus,
        data.tenantId,
      ]);

      await insertAuditLog(client, data.tenantId, AUDIT_ACTIONS.SLACK_INSTALLED, {
        workspaceId: data.slackWorkspaceId,
        teamName: data.slackTeamName,
      });

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
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }

    logger.error("Failed to link Slack workspace", {
      tenantId: data.tenantId,
      workspaceId: data.slackWorkspaceId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Create a tenant from Slack installation (before GitHub App is installed).
 *
 * @param slackData - Slack installation data
 * @param orgNameHint - Optional org name hint (defaults to Slack team name)
 * @returns Created tenant
 */
export const createFromSlackInstall = async (
  slackData: Omit<LinkSlackWorkspace, "tenantId">,
  orgNameHint?: string
): Promise<Tenant> => {
  validateSlackInstallInput(slackData);

  const orgName = orgNameHint ?? slackData.slackTeamName;

  try {
    const result = await transaction(async (client) => {
      const created = await client.query<TenantRow>(TENANT_QUERIES.INSERT_FROM_SLACK, [
        orgName,
        slackData.slackWorkspaceId,
        slackData.slackTeamName,
        encryptValue(slackData.slackBotToken),
        slackData.slackBotUserId ?? null,
        TENANT_STATUS.PENDING_GITHUB,
      ]);

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
  } catch (error) {
    logger.error("Failed to create tenant from Slack installation", {
      workspaceId: slackData.slackWorkspaceId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Create a tenant from GitLab OAuth login.
 *
 * Uses the GitLab group path as both the display name (org_name column)
 * and the gitlab_group_path for lookup. No GitHub installation is associated.
 *
 * @param data - GitLab group data
 * @returns Created tenant
 */
export const createFromGitLabGroup = async (data: CreateTenantFromGitLab): Promise<Tenant> => {
  validateId(data.gitlabGroupPath, "gitlabGroupPath");

  try {
    const result = await transaction(async (client) => {
      const created = await client.query<TenantRow>(TENANT_QUERIES.INSERT_FROM_GITLAB, [
        data.gitlabGroupPath,
        data.gitlabGroupPath,
        TENANT_STATUS.ACTIVE,
      ]);

      await insertAuditLog(client, created.rows[0].id, AUDIT_ACTIONS.GITLAB_LINKED, {
        gitlabGroupPath: data.gitlabGroupPath,
      });

      return created.rows[0];
    });

    logger.info("Tenant created from GitLab group", {
      tenantId: result.id,
      gitlabGroupPath: data.gitlabGroupPath,
    });

    return rowToTenant(result);
  } catch (error) {
    logger.error("Failed to create tenant from GitLab group", {
      gitlabGroupPath: data.gitlabGroupPath,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Create a new tenant from a GitHub OAuth login.
 *
 * Used when a GitHub user logs in but has no matching tenant.
 * Creates a minimal tenant using the GitHub username or org name —
 * the GitHub App installation can be linked later.
 */
export const createFromGitHubLogin = async (orgName: string): Promise<Tenant> => {
  validateId(orgName, "orgName");

  try {
    const result = await transaction(async (client) => {
      const created = await client.query<TenantRow>(TENANT_QUERIES.INSERT_FROM_GITHUB_LOGIN, [
        orgName,
        TENANT_STATUS.ACTIVE,
      ]);

      await insertAuditLog(client, created.rows[0].id, AUDIT_ACTIONS.GITHUB_LINKED, {
        orgName,
      });

      return created.rows[0];
    });

    logger.info("Tenant created from GitHub login", {
      tenantId: result.id,
      orgName,
    });

    return rowToTenant(result);
  } catch (error) {
    logger.error("Failed to create tenant from GitHub login", {
      orgName,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Update tenant status with audit logging.
 */
const updateStatus = async (
  tenantId: string,
  newStatus: TenantStatus,
  auditAction: TenantAuditAction,
  metadata: Record<string, unknown> = {}
): Promise<Tenant> => {
  validateId(tenantId, "tenantId");

  try {
    const result = await transaction(async (client) => {
      const updated = await client.query<TenantRow>(TENANT_QUERIES.UPDATE_STATUS, [
        newStatus,
        tenantId,
      ]);

      if (updated.rows.length === 0) {
        throw new NotFoundError(`Tenant not found: ${tenantId}`);
      }

      await insertAuditLog(client, tenantId, auditAction, metadata);
      return updated.rows[0];
    });

    return rowToTenant(result);
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }

    logger.error("Failed to update tenant status", {
      tenantId,
      newStatus,
      error: getErrorMessage(error),
    });
    throw error;
  }
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
    reason: reason ?? TENANT_DEFAULTS.SUSPENSION_REASON,
  });
  logger.info("Tenant suspended", { tenantId, reason });
  return tenant;
};

/**
 * Soft delete a tenant.
 */
export const deleteTenant = async (tenantId: string): Promise<void> => {
  await updateStatus(tenantId, TENANT_STATUS.DELETED, AUDIT_ACTIONS.DELETED);
  logger.info("Tenant deleted", { tenantId });
};

/**
 * Hard-delete a tenant and all associated data.
 *
 * Deletes tenant_subscriptions first (no FK CASCADE), then deletes the tenant row.
 * FK CASCADE handles: provider_connections, repository_channel_mappings, tenant_audit_log.
 * FK SET NULL handles: analyses, events, slack_messages, webhook_activity_log,
 *   incident_alerts, incident_triage_results.
 *
 * Call this only after external resource cleanup is complete (best-effort).
 */
export const hardDeleteTenant = async (tenantId: string): Promise<void> => {
  validateId(tenantId, "tenantId");

  try {
    await transaction(async (client) => {
      // Delete tenant_subscriptions first (no FK CASCADE to tenants)
      await client.query("DELETE FROM tenant_subscriptions WHERE tenant_id = $1", [tenantId]);

      // Hard-delete the tenant row — FK cascades handle the rest
      const { rowCount } = await client.query("DELETE FROM tenants WHERE id = $1", [tenantId]);

      if (rowCount === 0) {
        throw new NotFoundError(`Tenant not found: ${tenantId}`);
      }
    });

    logger.info("Tenant permanently deleted", { tenantId });
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }

    logger.error("Failed to hard delete tenant", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Handle GitHub App uninstallation.
 *
 * @param installationId - GitHub App installation ID
 */
export const handleGitHubUninstall = async (installationId: number): Promise<void> => {
  validateInstallationId(installationId);

  try {
    const tenant = await findByGitHubInstallation(installationId);

    if (tenant === null) {
      logger.warn("GitHub uninstall for unknown installation", { installationId });
      return;
    }

    await transaction(async (client) => {
      await client.query(TENANT_QUERIES.UPDATE_GITHUB_UNINSTALL, [
        TENANT_STATUS.DELETED,
        tenant.id,
      ]);

      await insertAuditLog(client, tenant.id, AUDIT_ACTIONS.GITHUB_UNINSTALLED, { installationId });
    });

    logger.info("Handled GitHub App uninstallation", {
      tenantId: tenant.id,
      installationId,
    });
  } catch (error) {
    logger.error("Failed to handle GitHub uninstall", {
      installationId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Update Slack bot token for a tenant.
 *
 * @param tenantId - Tenant ID
 * @param newToken - New Slack bot token
 */
export const updateSlackToken = async (tenantId: string, newToken: string): Promise<void> => {
  validateId(tenantId, "tenantId");
  validateId(newToken, "newToken");

  try {
    await query(TENANT_QUERIES.UPDATE_SLACK_TOKEN, [encryptValue(newToken), tenantId]);
    logger.info("Slack token updated", { tenantId });
  } catch (error) {
    logger.error("Failed to update Slack token", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};
