/**
 * Installation Handler
 *
 * Handles GitHub App installation webhook events for multi-tenant support.
 * Creates/updates tenants when the app is installed or uninstalled.
 */

import crypto from "node:crypto";
import {
  createLogger,
  createFromGitHubInstall,
  handleGitHubUninstall,
  findTenantByGitHubInstallation,
  findSlackConnection,
  suspend,
  activate,
  getErrorMessage,
  findOAuthIdentity,
  addUserOrganization,
  switchUserOrganization,
  findUserById,
  findGitHubAppConnection,
  findOrganizationsByUser,
  type Tenant,
  type RequestContext,
} from "@kenchi/shared";
import {
  GITHUB_INSTALLATION_ACTIONS,
  type InstallationWebhook,
  type GitHubAccount,
} from "../types/githubTypes.js";
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
 * Link the GitHub App installer (sender) to the newly created tenant.
 *
 * Looks up the sender's Kenchi user account via their GitHub OAuth identity.
 * If found, adds them to the tenant and switches their selected tenant if
 * they are either on no tenant or on a tenant without an active GitHub App
 * installation (i.e., a "bare" tenant created from OAuth login alone).
 */
const linkSenderToTenant = async (
  sender: GitHubAccount,
  tenantId: string,
  context: RequestContext
): Promise<void> => {
  // GitHub OAuth stores the numeric user ID as a string in providerUserId
  const identity = await findOAuthIdentity("github", String(sender.id), null);

  if (!identity) {
    logger.info("Installation sender has no Kenchi OAuth identity, skipping link", {
      ...context,
      senderLogin: sender.login,
      senderId: sender.id,
    });
    return;
  }

  const user = await findUserById(identity.userId);
  if (!user) {
    logger.warn("OAuth identity references missing user, skipping link", {
      ...context,
      userId: identity.userId,
      senderId: sender.id,
    });
    return;
  }

  // Add user to the new tenant (idempotent -- ON CONFLICT DO NOTHING)
  await addUserOrganization({
    userId: user.id,
    tenantId,
    role: "member",
  });

  logger.info("Sender linked to installed tenant", {
    ...context,
    userId: user.id,
    tenantId,
    senderLogin: sender.login,
  });

  // Switch selected tenant if user has none or is on a tenant without
  // an active GitHub App installation (bare tenant from OAuth login).
  const shouldSwitch = await shouldSwitchTenant(user.id, user.tenantId);
  if (shouldSwitch) {
    await switchUserOrganization(user.id, tenantId);

    logger.info("Sender switched to installed tenant", {
      ...context,
      userId: user.id,
      previousTenantId: user.tenantId,
      newTenantId: tenantId,
    });
  }
};

/**
 * Determine whether a user should be switched to the newly installed tenant.
 *
 * Returns true if:
 * - User has no selected tenant (tenantId is null), OR
 * - User's current tenant has no active GitHub App installation
 */
const shouldSwitchTenant = async (
  userId: string,
  currentTenantId: string | null
): Promise<boolean> => {
  if (currentTenantId === null) {
    return true;
  }

  // Check if the current tenant has an active GitHub App connection
  const currentConnection = await findGitHubAppConnection(currentTenantId);
  if (currentConnection !== null) {
    // Current tenant is fully set up -- don't forcibly switch
    return false;
  }

  // Current tenant has no GitHub App installation (bare OAuth tenant).
  // Check if the user is a member of any tenant that does have one.
  // If not, switching to the newly installed tenant is the right move.
  const orgs = await findOrganizationsByUser(userId);
  const hasOtherInstalledTenant = orgs.some(
    (org) => org.tenantId !== currentTenantId && org.tenantStatus === "active"
  );

  // Only switch if user doesn't already have another active installed tenant
  return !hasOtherInstalledTenant;
};

/**
 * Handle GitHub App installation created event.
 * Creates a new tenant or updates an existing one.
 */
const handleInstallationCreated = async (
  webhook: InstallationWebhook
): Promise<InstallationHandlerResult> => {
  const { installation, repositories, sender } = webhook;
  const orgName = installation.account.login;

  logger.info("GitHub App installed", {
    installationId: installation.id,
    org: orgName,
    targetType: installation.target_type,
    repositoryCount: repositories?.length ?? 0,
    senderLogin: sender.login,
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

    // Link the installing user to this tenant (best-effort: log and
    // continue on failure so the installation webhook still succeeds).
    const context: RequestContext = {
      requestId: crypto.randomUUID(),
      tenantId: tenant.id,
      actor: "github-app-installation",
    };

    try {
      await linkSenderToTenant(sender, tenant.id, context);
    } catch (linkError) {
      logger.error("Failed to link sender to tenant (non-fatal)", {
        ...context,
        installationId: installation.id,
        senderLogin: sender.login,
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
    await handleGitHubUninstall(installation.id);

    logger.info("Tenant marked as deleted for GitHub uninstallation", {
      installationId: installation.id,
      org: orgName,
    });

    return successResult(`Tenant deleted for ${orgName}`);
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
