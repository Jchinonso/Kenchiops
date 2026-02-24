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
  status: TenantStatus
): Promise<TenantRow> => {
  const existing = await client.query<TenantRow>(TENANT_QUERIES.FIND_BY_ORG_NAME_AND_PROVIDER, [
    orgName,
    provider,
    TENANT_STATUS.DELETED,
  ]);

  if (existing.rows.length > 0) {
    return existing.rows[0];
  }

  const created = await client.query<TenantRow>(TENANT_QUERIES.INSERT_TENANT_WITH_PROVIDER, [
    orgName,
    provider,
    status,
  ]);
  return created.rows[0];
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

  const orgName = orgNameHint ?? slackData.slackTeamName;

  try {
    const result = await transaction(async (client) => {
      const created = await client.query<TenantRow>(TENANT_QUERIES.INSERT_TENANT_WITH_PROVIDER, [
        orgName,
        "github",
        TENANT_STATUS.ACTIVE,
      ]);

      await insertAuditLog(client, created.rows[0].id, AUDIT_ACTIONS.SLACK_INSTALLED, {
        workspaceId: slackData.slackWorkspaceId,
        teamName: slackData.slackTeamName,
      });

      return created.rows[0];
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

  try {
    const result = await transaction(async (client) => {
      const created = await client.query<TenantRow>(TENANT_QUERIES.INSERT_TENANT_WITH_PROVIDER, [
        data.gitlabGroupPath,
        "gitlab",
        TENANT_STATUS.ACTIVE,
      ]);

      await insertAuditLog(client, created.rows[0].id, AUDIT_ACTIONS.GITLAB_LINKED, {
        gitlabGroupPath: data.gitlabGroupPath,
      });

      return created.rows[0];
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

  try {
    const result = await transaction(async (client) => {
      const created = await client.query<TenantRow>(TENANT_QUERIES.INSERT_TENANT_WITH_PROVIDER, [
        orgName,
        "github",
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
 * Create a tenant from Bitbucket OAuth login.
 * Creates a tenant + bitbucket provider connection.
 *
 * @param workspace - Bitbucket workspace slug
 * @returns Created tenant
 */
export const createFromBitbucketWorkspace = async (workspace: string): Promise<Tenant> => {
  validateId(workspace, "workspace");

  try {
    const result = await transaction(async (client) => {
      const created = await client.query<TenantRow>(TENANT_QUERIES.INSERT_TENANT_WITH_PROVIDER, [
        workspace,
        "bitbucket",
        TENANT_STATUS.ACTIVE,
      ]);

      await insertAuditLog(client, created.rows[0].id, AUDIT_ACTIONS.BITBUCKET_LINKED, {
        workspace,
      });

      return created.rows[0];
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

  try {
    const result = await transaction(async (client) => {
      const created = await client.query<TenantRow>(TENANT_QUERIES.INSERT_TENANT_WITH_PROVIDER, [
        org,
        "azure_devops",
        TENANT_STATUS.ACTIVE,
      ]);

      await insertAuditLog(client, created.rows[0].id, AUDIT_ACTIONS.AZURE_DEVOPS_LINKED, {
        org,
      });

      return created.rows[0];
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

    await transaction(async (client) => {
      await client.query(TENANT_QUERIES.UPDATE_STATUS, [TENANT_STATUS.DELETED, tenantRow.id]);
      await insertAuditLog(client, tenantRow.id, AUDIT_ACTIONS.GITHUB_UNINSTALLED, {
        installationId,
      });
    });

    // Deactivate the github_app connection
    await deactivateByTenantAndProvider(tenantRow.id, "github_app");

    logger.info("Handled GitHub App uninstallation", {
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
