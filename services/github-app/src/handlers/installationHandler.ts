/**
 * Installation Handler
 *
 * Handles GitHub App installation webhook events for multi-tenant support.
 * Creates/updates tenants when the app is installed or uninstalled.
 */

import {
  createLogger,
  createFromGitHubInstall,
  handleGitHubUninstall,
  findTenantByGitHubInstallation,
  findSlackConnection,
  findOAuthIdentity,
  addUserOrganization,
  switchUserOrganization,
  findOrganizationsByUser,
  publish,
  PUBSUB_CHANNELS,
  DASHBOARD_EVENT_TYPES,
  suspend,
  activate,
  getErrorMessage,
  type Tenant,
} from "@kenchi/shared";
import { GITHUB_INSTALLATION_ACTIONS, type InstallationWebhook } from "../types/githubTypes.js";
import type { InstallationHandlerResult, TenantLookupResult } from "./installationHandlerTypes.js";

export type { InstallationHandlerResult };

const logger = createLogger("github-app");

/**
 * Build success result
 */
const successResult = (message: string, tenantId?: string): InstallationHandlerResult => ({
  handled: true,
  message,
  tenantId,
});

/**
 * Build failure result
 */
const failureResult = (message: string): InstallationHandlerResult => ({
  handled: false,
  message,
});

/**
 * Handle GitHub App installation created event.
 * Creates a new tenant or updates an existing one.
 */
const handleInstallationCreated = async (
  webhook: InstallationWebhook
): Promise<InstallationHandlerResult> => {
  const { installation, repositories } = webhook;
  const orgName = installation.account.login;

  logger.info("GitHub App installed", {
    installationId: installation.id,
    org: orgName,
    targetType: installation.target_type,
    repositoryCount: repositories?.length ?? 0,
  });

  try {
    const tenant = await createFromGitHubInstall({
      orgName,
      githubInstallationId: installation.id,
    });

    logger.info("Tenant created/updated for GitHub installation", {
      tenantId: tenant.id,
      org: orgName,
      installationId: installation.id,
      status: tenant.status,
    });

    // Link the sender (user who installed the app) to this tenant.
    // This handles the case where the user logged in before the app was installed
    // and got assigned to a personal tenant instead of the org tenant.
    try {
      const identity = await findOAuthIdentity("github", String(webhook.sender.id), null);
      if (identity) {
        // Fetch existing orgs BEFORE linking so we can notify them via SSE
        const existingOrgs = await findOrganizationsByUser(identity.userId);

        await addUserOrganization({
          userId: identity.userId,
          tenantId: tenant.id,
          role: "admin",
        });
        await switchUserOrganization(identity.userId, tenant.id);

        logger.info("Linked installing user to tenant", {
          userId: identity.userId,
          tenantId: tenant.id,
          org: orgName,
          senderLogin: webhook.sender.login,
        });

        // Notify all of the user's existing tenants so the frontend refreshes
        // the org list in realtime (SSE is tenant-scoped).
        const tenantIdsToNotify = [...existingOrgs.map((org) => org.tenantId), tenant.id];
        for (const notifyTenantId of tenantIdsToNotify) {
          try {
            await publish(PUBSUB_CHANNELS.DASHBOARD, DASHBOARD_EVENT_TYPES.ORGANIZATION_UPDATED, {
              tenantId: notifyTenantId,
              newOrgName: orgName,
            });
          } catch {
            // Best-effort notification — don't block installation
          }
        }
      }
    } catch (linkError) {
      // Non-fatal: tenant was created, user linking is best-effort
      logger.warn("Failed to link installing user to tenant (non-fatal)", {
        org: orgName,
        senderId: webhook.sender.id,
        error: getErrorMessage(linkError),
      });
    }

    const statusMessage = tenant.status === "active" ? "activated" : "created";
    return successResult(`Tenant ${statusMessage} for ${orgName}`, tenant.id);
  } catch (error) {
    logger.error("Failed to create tenant for GitHub installation", {
      installationId: installation.id,
      org: orgName,
      error: getErrorMessage(error),
    });

    return failureResult(`Failed to create tenant: ${getErrorMessage(error)}`);
  }
};

/**
 * Handle GitHub App installation deleted event.
 * Soft deletes the associated tenant.
 */
const handleInstallationDeleted = async (
  webhook: InstallationWebhook
): Promise<InstallationHandlerResult> => {
  const { installation } = webhook;
  const orgName = installation.account.login;

  logger.info("GitHub App uninstalled", {
    installationId: installation.id,
    org: orgName,
  });

  try {
    // Look up tenant BEFORE deletion so we can notify via SSE
    const tenant = await findTenantByGitHubInstallation(installation.id);

    await handleGitHubUninstall(installation.id);

    logger.info("Tenant marked as deleted for GitHub uninstallation", {
      installationId: installation.id,
      org: orgName,
    });

    // Notify the deleted tenant's frontend so the org switcher / TenantGuard refreshes
    if (tenant) {
      try {
        await publish(PUBSUB_CHANNELS.DASHBOARD, DASHBOARD_EVENT_TYPES.ORGANIZATION_UPDATED, {
          tenantId: tenant.id,
          removedOrgName: orgName,
        });
      } catch {
        // Best-effort notification — don't block uninstall handling
      }
    }

    return successResult(`Tenant deleted for ${orgName}`, tenant?.id);
  } catch (error) {
    logger.error("Failed to delete tenant for GitHub uninstallation", {
      installationId: installation.id,
      org: orgName,
      error: getErrorMessage(error),
    });

    return failureResult(`Failed to delete tenant: ${getErrorMessage(error)}`);
  }
};

/**
 * Lookup tenant with standardized not-found handling
 */
const lookupTenant = async (
  installationId: number,
  actionName: string
): Promise<TenantLookupResult> => {
  const tenant = await findTenantByGitHubInstallation(installationId);

  return tenant
    ? { found: true, tenant }
    : {
        found: false,
        result: (() => {
          logger.warn(`${actionName} event for unknown installation`, { installationId });
          return failureResult("Tenant not found for installation");
        })(),
      };
};

/**
 * Handle GitHub App installation suspended event.
 * Suspends the associated tenant.
 */
const handleInstallationSuspend = async (
  webhook: InstallationWebhook
): Promise<InstallationHandlerResult> => {
  const { installation } = webhook;
  const orgName = installation.account.login;

  logger.info("GitHub App suspended", {
    installationId: installation.id,
    org: orgName,
    suspendedBy: installation.suspended_by?.login,
  });

  try {
    const lookup = await lookupTenant(installation.id, "Suspend");
    if (!lookup.found) {
      return lookup.result;
    }

    const { tenant } = lookup;
    await suspend(
      tenant.id,
      `GitHub App suspended by ${installation.suspended_by?.login ?? "unknown"}`
    );

    return successResult(`Tenant suspended for ${orgName}`, tenant.id);
  } catch (error) {
    logger.error("Failed to suspend tenant", {
      installationId: installation.id,
      error: getErrorMessage(error),
    });

    return failureResult(`Failed to suspend tenant: ${getErrorMessage(error)}`);
  }
};

/**
 * Unsuspend action lookup based on Slack connection status
 */
const unsuspendActions: Record<
  "connected" | "pending",
  (tenant: Tenant, orgName: string) => Promise<InstallationHandlerResult>
> = {
  connected: async (tenant, orgName) => {
    await activate(tenant.id);
    return successResult(`Tenant reactivated for ${orgName}`, tenant.id);
  },
  pending: async (tenant, orgName) => {
    logger.info("Tenant unsuspended but Slack not connected", { tenantId: tenant.id });
    return successResult(
      `Tenant unsuspended but awaiting Slack connection for ${orgName}`,
      tenant.id
    );
  },
};

/**
 * Handle GitHub App installation unsuspended event.
 * Reactivates the associated tenant.
 */
const handleInstallationUnsuspend = async (
  webhook: InstallationWebhook
): Promise<InstallationHandlerResult> => {
  const { installation } = webhook;
  const orgName = installation.account.login;

  logger.info("GitHub App unsuspended", {
    installationId: installation.id,
    org: orgName,
  });

  try {
    const lookup = await lookupTenant(installation.id, "Unsuspend");
    if (!lookup.found) {
      return lookup.result;
    }

    const { tenant } = lookup;
    const slackConn = await findSlackConnection(tenant.id);
    const slackStatus = slackConn ? "connected" : "pending";
    return await unsuspendActions[slackStatus](tenant, orgName);
  } catch (error) {
    logger.error("Failed to reactivate tenant", {
      installationId: installation.id,
      error: getErrorMessage(error),
    });

    return failureResult(`Failed to reactivate tenant: ${getErrorMessage(error)}`);
  }
};

/**
 * Handler lookup table for installation actions
 */
const actionHandlers: Record<
  string,
  (webhook: InstallationWebhook) => Promise<InstallationHandlerResult>
> = {
  [GITHUB_INSTALLATION_ACTIONS.CREATED]: handleInstallationCreated,
  [GITHUB_INSTALLATION_ACTIONS.DELETED]: handleInstallationDeleted,
  [GITHUB_INSTALLATION_ACTIONS.SUSPEND]: handleInstallationSuspend,
  [GITHUB_INSTALLATION_ACTIONS.UNSUSPEND]: handleInstallationUnsuspend,
};

/**
 * Default handler for unknown actions
 */
const defaultHandler = (action: string): InstallationHandlerResult => {
  logger.info("Unhandled installation action", { action });
  return failureResult(`Installation action '${action}' not handled`);
};

/**
 * Handle installation webhook.
 * Routes to appropriate handler based on action.
 */
export const handleInstallation = async (
  webhook: InstallationWebhook
): Promise<InstallationHandlerResult> => {
  const handler = actionHandlers[webhook.action];
  return handler ? handler(webhook) : defaultHandler(webhook.action);
};
