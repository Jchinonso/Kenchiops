/**
 * Tenant Lifecycle Service
 *
 * Creation, update, and status management for tenants.
 * Provider-specific state is stored in provider_connections,
 * not on the tenants row.
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
import {
  createProviderConnection,
  deactivateByTenantAndProvider,
  findTenantByGitHubInstallation,
} from "../providerConnection/repository.js";
import { insertAuditLog } from "./audit.js";
import {
  validateId,
  validateInstallationId,
  validateGitHubInstallInput,
  validateSlackLinkInput,
  validateSlackInstallInput,
  rowToTenant,
} from "./helpers.js";
import type { TenantRow } from "./types.js";

const logger = createLogger("tenant-service");

// ==================== Internal Helpers ====================

/**
 * Create or find a tenant by org name and provider, returning the TenantRow.
 * Used by all creation functions to ensure a tenant exists before
 * creating the provider connection.
 *
 * Provider-scoped: a GitHub "acme" and GitLab "acme" are separate tenants.
 */
const ensureTenant = async (
  client: Parameters<Parameters<typeof transaction>[0]>[0],
  orgName: string,
  provider: string,
  status: TenantStatus,
  tenantType: string = "organization"
): Promise<TenantRow> => {
  // Normalize org_name to lowercase for consistent matching (FLAW-10).
  const normalizedName = orgName.toLowerCase();

  // Check for a previously deleted tenant with the same name/provider.
  // The partial unique index (migration 036) excludes deleted rows, so the
  // UPSERT below would silently INSERT a duplicate. Reactivating preserves
  // the tenant's audit log, analyses, and provider connections.
  const deletedResult = await client.query<TenantRow>(TENANT_QUERIES.FIND_DELETED_TENANT, [
    normalizedName,
    provider,
  ]);

  if (deletedResult.rows.length > 0) {
    const reactivated = await client.query<TenantRow>(TENANT_QUERIES.REACTIVATE_TENANT, [
      status,
      tenantType,
      deletedResult.rows[0].id,
    ]);
    return reactivated.rows[0];
  }

  // Race-safe UPSERT for non-deleted tenants. On conflict, updates tenant_type
  // in case the caller provides a more specific type (e.g., "personal").
  // Requires migration 036 (partial unique index on LOWER(org_name), provider).
  const result = await client.query<TenantRow>(TENANT_QUERIES.UPSERT_TENANT, [
    normalizedName,
    provider,
    status,
    tenantType,
  ]);
  return result.rows[0];
};

// ==================== Creation Functions ====================

/**
 * Create a new tenant from GitHub App installation.
 * Creates the tenant row + a github_app provider connection.
 *
 * @param data - GitHub installation data
 * @returns Created or updated tenant
 */
export const createFromGitHubInstall = async (data: CreateTenantFromGitHub): Promise<Tenant> => {
  validateGitHubInstallInput(data);

  try {
    const result = await transaction(async (client) => {
      const tenantRow = await ensureTenant(client, data.orgName, "github", TENANT_STATUS.ACTIVE);

      // Activate tenant if not already active
      if (tenantRow.status !== TENANT_STATUS.ACTIVE) {
        await client.query(TENANT_QUERIES.UPDATE_STATUS, [TENANT_STATUS.ACTIVE, tenantRow.id]);
      }

      await insertAuditLog(client, tenantRow.id, AUDIT_ACTIONS.GITHUB_INSTALLED, {
        installationId: data.githubInstallationId,
      });

      return tenantRow;
    });

    // Create the github_app provider connection (outside transaction for idempotency)
    await createProviderConnection({
      tenantId: result.id,
      provider: "github_app",
      connectionName: data.orgName,
      externalOrgId: String(data.githubInstallationId),
      config: { orgLogin: data.orgName, installedAt: new Date().toISOString() },
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
 * Creates a slack provider connection.
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

      await insertAuditLog(client, data.tenantId, AUDIT_ACTIONS.SLACK_INSTALLED, {
        workspaceId: data.slackWorkspaceId,
        teamName: data.slackTeamName,
      });

      return current.rows[0];
    });

    // Create the slack provider connection
    await createProviderConnection({
      tenantId: data.tenantId,
      provider: "slack",
      connectionName: data.slackTeamName,
      externalOrgId: data.slackWorkspaceId,
      accessToken: data.slackBotToken,
      config: {
        teamName: data.slackTeamName,
        botUserId: data.slackBotUserId ?? null,
        installedAt: new Date().toISOString(),
      },
    });

    logger.info("Slack workspace linked to tenant", {
      tenantId: data.tenantId,
      workspaceId: data.slackWorkspaceId,
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
 * Create a tenant from Slack installation (before any CI provider is installed).
 * Creates a tenant + slack provider connection.
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

  // Normalize to lowercase for consistent matching (FLAW-10)
  const orgName = (orgNameHint ?? slackData.slackTeamName).toLowerCase();

  try {
    const result = await transaction(async (client) => {
      // Use ensureTenant for dedup safety; provider is "slack" (not "github")
      const tenantRow = await ensureTenant(client, orgName, "slack", TENANT_STATUS.ACTIVE);

      await insertAuditLog(client, tenantRow.id, AUDIT_ACTIONS.SLACK_INSTALLED, {
        workspaceId: slackData.slackWorkspaceId,
        teamName: slackData.slackTeamName,
      });

      return tenantRow;
    });

    // Create the slack provider connection
    await createProviderConnection({
      tenantId: result.id,
      provider: "slack",
      connectionName: slackData.slackTeamName,
      externalOrgId: slackData.slackWorkspaceId,
      accessToken: slackData.slackBotToken,
      config: {
        teamName: slackData.slackTeamName,
        botUserId: slackData.slackBotUserId ?? null,
        installedAt: new Date().toISOString(),
      },
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
 * Creates a tenant + gitlab provider connection.
 *
 * @param data - GitLab group data
 * @returns Created tenant
 */
export const createFromGitLabGroup = async (data: CreateTenantFromGitLab): Promise<Tenant> => {
  validateId(data.gitlabGroupPath, "gitlabGroupPath");

  // Normalize to lowercase for consistent matching (FLAW-10)
  const normalizedPath = data.gitlabGroupPath.toLowerCase();

  try {
    const result = await transaction(async (client) => {
      const tenantRow = await ensureTenant(client, normalizedPath, "gitlab", TENANT_STATUS.ACTIVE);

      await insertAuditLog(client, tenantRow.id, AUDIT_ACTIONS.GITLAB_LINKED, {
        gitlabGroupPath: data.gitlabGroupPath,
      });

      return tenantRow;
    });

    // Create the gitlab provider connection
    await createProviderConnection({
      tenantId: result.id,
      provider: "gitlab",
      connectionName: data.gitlabGroupPath,
      externalOrgId: data.gitlabGroupPath,
      config: { groupPath: data.gitlabGroupPath },
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

  // Normalize to lowercase for consistent matching (FLAW-10)
  const normalizedName = orgName.toLowerCase();

  try {
    const result = await transaction(async (client) => {
      const tenantRow = await ensureTenant(client, normalizedName, "github", TENANT_STATUS.ACTIVE);

      await insertAuditLog(client, tenantRow.id, AUDIT_ACTIONS.GITHUB_LINKED, {
        orgName,
      });

      return tenantRow;
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
 * Create a tenant from Bitbucket OAuth login.
 * Creates a tenant + bitbucket provider connection.
 *
 * @param workspace - Bitbucket workspace slug
 * @returns Created tenant
 */
export const createFromBitbucketWorkspace = async (workspace: string): Promise<Tenant> => {
  validateId(workspace, "workspace");

  // Normalize to lowercase for consistent matching (FLAW-10)
  const normalizedWorkspace = workspace.toLowerCase();

  try {
    const result = await transaction(async (client) => {
      const tenantRow = await ensureTenant(
        client,
        normalizedWorkspace,
        "bitbucket",
        TENANT_STATUS.ACTIVE
      );

      await insertAuditLog(client, tenantRow.id, AUDIT_ACTIONS.BITBUCKET_LINKED, {
        workspace,
      });

      return tenantRow;
    });

    // Create the bitbucket provider connection
    await createProviderConnection({
      tenantId: result.id,
      provider: "bitbucket",
      connectionName: workspace,
      externalOrgId: workspace,
      config: { workspace },
    });

    logger.info("Tenant created from Bitbucket workspace", {
      tenantId: result.id,
      workspace,
    });

    return rowToTenant(result);
  } catch (error) {
    logger.error("Failed to create tenant from Bitbucket workspace", {
      workspace,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Create a tenant from Azure DevOps OAuth login.
 * Creates a tenant + azure_devops provider connection.
 *
 * @param org - Azure DevOps organization name
 * @returns Created tenant
 */
export const createFromAzureDevOpsAccount = async (org: string): Promise<Tenant> => {
  validateId(org, "org");

  // Normalize to lowercase for consistent matching (FLAW-10)
  const normalizedOrg = org.toLowerCase();

  try {
    const result = await transaction(async (client) => {
      const tenantRow = await ensureTenant(
        client,
        normalizedOrg,
        "azure_devops",
        TENANT_STATUS.ACTIVE
      );

      await insertAuditLog(client, tenantRow.id, AUDIT_ACTIONS.AZURE_DEVOPS_LINKED, {
        org,
      });

      return tenantRow;
    });

    // Create the azure_devops provider connection
    await createProviderConnection({
      tenantId: result.id,
      provider: "azure_devops",
      connectionName: org,
      externalOrgId: org,
      config: { org },
    });

    logger.info("Tenant created from Azure DevOps account", {
      tenantId: result.id,
      org,
    });

    return rowToTenant(result);
  } catch (error) {
    logger.error("Failed to create tenant from Azure DevOps account", {
      org,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

// ==================== Tenant Type Management ====================

/**
 * Mark a tenant as 'personal' type (GitHub username fallback).
 * Called after creating a personal tenant via the GitHub login fallback path.
 *
 * @param tenantId - Tenant ID to mark as personal
 */
export const markTenantAsPersonal = async (tenantId: string): Promise<void> => {
  validateId(tenantId, "tenantId");
  await query(TENANT_QUERIES.UPDATE_TENANT_TYPE, ["personal", tenantId]);
};

// ==================== Org Name Management ====================

/**
 * Update a tenant's org_name (e.g., when GitHub username changes for personal tenants).
 * Normalizes to lowercase for consistent matching (FLAW-10, FLAW-13).
 *
 * @param tenantId - Tenant ID
 * @param newOrgName - New org name
 * @returns Updated tenant or null if not found
 */
export const updateTenantOrgName = async (
  tenantId: string,
  newOrgName: string
): Promise<Tenant | null> => {
  validateId(tenantId, "tenantId");

  try {
    const normalizedName = newOrgName.toLowerCase();
    const result = await query<TenantRow>(TENANT_QUERIES.UPDATE_ORG_NAME, [
      normalizedName,
      tenantId,
    ]);

    if (result.rows.length === 0) {
      return null;
    }

    logger.info("Tenant org name updated", { tenantId, newOrgName: newOrgName.toLowerCase() });
    return rowToTenant(result.rows[0]);
  } catch (error) {
    logger.error("Failed to update tenant org name", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

// ==================== Status Management ====================

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
 * Soft delete a tenant with full session revocation.
 *
 * Sets status to 'deleted', logs an audit event, and revokes all
 * active refresh tokens to immediately invalidate sessions.
 *
 * @param tenantId - Tenant to soft delete
 * @param reason - Optional reason for the deletion
 * @returns Number of tokens revoked
 */
export const softDeleteTenant = async (
  tenantId: string,
  reason?: string
): Promise<{ readonly tokensRevoked: number }> => {
  validateId(tenantId, "tenantId");

  try {
    // Set status to deleted with audit trail
    await updateStatus(tenantId, TENANT_STATUS.DELETED, AUDIT_ACTIONS.DELETED, {
      reason: reason ?? "Tenant soft deleted",
    });

    // Revoke all active sessions (dynamic import avoids circular dependency)
    const { revokeAllTenantTokens } = await import("../user/refreshToken.js");
    const tokensRevoked = await revokeAllTenantTokens(tenantId);

    logger.info("Tenant soft deleted with session revocation", {
      tenantId,
      tokensRevoked,
    });

    return { tokensRevoked };
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }

    logger.error("Failed to soft delete tenant", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Hard-delete a tenant and all associated data.
 *
 * Deletes tenant_subscriptions first (no FK CASCADE), then deletes the tenant row.
 * FK CASCADE handles: provider_connections, repository_channel_mappings, tenant_audit_log,
 *   events, analyses, incident_alerts, incident_triage_results, webhook_activity.
 * FK SET NULL handles: users.selected_tenant_id (user preference, not ownership).
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
 * Deactivates the github_app provider connection and soft-deletes the tenant.
 *
 * @param installationId - GitHub App installation ID
 */
export const handleGitHubUninstall = async (installationId: number): Promise<void> => {
  validateInstallationId(installationId);

  try {
    const tenantRow = await findTenantByGitHubInstallation(installationId);

    if (tenantRow === null) {
      logger.warn("GitHub uninstall for unknown installation", { installationId });
      return;
    }

    // Only deactivate the github_app provider connection — do NOT delete the tenant.
    // The tenant exists because of OAuth login (org membership), not because of the
    // GitHub App. Uninstalling the app only removes repo access and CI monitoring.
    // Users can still log in and use the org; they just need to reinstall the app
    // to regain repo access.
    await deactivateByTenantAndProvider(tenantRow.id, "github_app");

    await transaction(async (client) => {
      await insertAuditLog(client, tenantRow.id, AUDIT_ACTIONS.GITHUB_UNINSTALLED, {
        installationId,
      });
    });

    logger.info("Handled GitHub App uninstallation — provider connection deactivated", {
      tenantId: tenantRow.id,
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
