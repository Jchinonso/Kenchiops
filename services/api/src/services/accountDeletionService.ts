/**
 * Account Deletion Service
 *
 * Orchestrates proper account deletion with tenant cleanup.
 * Checks ALL user organizations (not just selected) and performs
 * best-effort external resource cleanup for any org where the
 * user is the last member, then hard-deletes those tenants.
 *
 * @module services/accountDeletionService
 */

import {
  createLogger,
  findUserById,
  findById as findTenantById,
  countTenantMembers,
  findOrganizationsByUser,
  deleteUser,
  hardDeleteTenant,
  findByTenant,
  findSlackConnection,
  mapWithConcurrency,
  resilientPost,
  getErrorMessage,
  NotFoundError,
  type ProviderConnection,
  type RequestContext,
} from "@kenchi/shared";

import type { GitLabProjectsPort } from "../ports/gitlabProjectsPort.js";
import type {
  AffectedOrganization,
  DeletionImpact,
  ExternalCleanupResult,
  GitLabWebhookConfig,
} from "./accountDeletionServiceTypes.js";

const logger = createLogger("account-deletion-service");

const CLEANUP_CONCURRENCY = 3;
const SLACK_REVOKE_URL = "https://slack.com/api/auth.revoke";
const SLACK_REVOKE_TIMEOUT_MS = 5_000;

// ==================== External Cleanup Helpers ====================

/**
 * Best-effort GitLab webhook cleanup.
 * Iterates provider connections, deletes each stored webhook.
 * Failures are logged as warnings — never block account deletion.
 */
const cleanupGitLabWebhooks = async (
  connections: readonly ProviderConnection[],
  gitlabPort: GitLabProjectsPort,
  context: RequestContext
): Promise<{ readonly deleted: number; readonly failed: number }> => {
  const gitlabConnections = connections.filter((conn) => conn.provider === "gitlab_ci");

  // let: accumulators incremented per webhook result across multiple connections
  let deleted = 0; // let: incremented per successful webhook deletion
  let failed = 0; // let: incremented per failed webhook deletion

  // for...of: early-exit with continue on missing accessToken
  for (const conn of gitlabConnections) {
    const { accessToken } = conn;
    if (!accessToken) {
      continue;
    }

    const webhooks =
      (conn.config as { readonly projectWebhooks?: readonly GitLabWebhookConfig[] })
        ?.projectWebhooks ?? [];

    const results = await mapWithConcurrency(
      webhooks,
      async (webhook) => {
        try {
          await gitlabPort.deleteProjectWebhook(
            accessToken,
            conn.baseUrl,
            webhook.projectId,
            webhook.webhookId,
            context
          );
          return true;
        } catch (error) {
          logger.warn("Failed to delete GitLab webhook (best-effort)", {
            provider: "gitlab",
            operation: "deleteProjectWebhook",
            projectId: webhook.projectId,
            webhookId: webhook.webhookId,
            error: getErrorMessage(error),
            ...context,
          });
          return false;
        }
      },
      CLEANUP_CONCURRENCY
    );

    deleted += results.filter(Boolean).length;
    failed += results.filter((result) => !result).length;
  }

  return { deleted, failed };
};

/**
 * Best-effort Slack bot token revocation.
 * Uses resilientPost directly — creating a full port+adapter for a single
 * revocation call during deletion would be over-engineering.
 */
const revokeSlackToken = async (botToken: string, context: RequestContext): Promise<boolean> => {
  const startTime = Date.now();

  try {
    await resilientPost(
      SLACK_REVOKE_URL,
      {},
      {
        headers: { Authorization: `Bearer ${botToken}` },
        timeout: SLACK_REVOKE_TIMEOUT_MS,
      }
    );

    logger.info("Slack bot token revoked", {
      provider: "slack",
      operation: "revokeToken",
      durationMs: Date.now() - startTime,
      ...context,
    });

    return true;
  } catch (error) {
    logger.warn("Failed to revoke Slack token (best-effort)", {
      provider: "slack",
      operation: "revokeToken",
      durationMs: Date.now() - startTime,
      error: getErrorMessage(error),
      ...context,
    });
    return false;
  }
};

/**
 * Orchestrate best-effort cleanup of all external resources before tenant deletion.
 */
const cleanupExternalResources = async (
  tenantId: string,
  gitlabPort: GitLabProjectsPort,
  context: RequestContext
): Promise<ExternalCleanupResult> => {
  const [connections, slackConn] = await Promise.all([
    findByTenant(tenantId),
    findSlackConnection(tenantId),
  ]);

  const gitlabResult = await cleanupGitLabWebhooks(connections, gitlabPort, context);

  const slackTokenRevoked = slackConn?.accessToken
    ? await revokeSlackToken(slackConn.accessToken, context)
    : false;

  return {
    gitlabWebhooksDeleted: gitlabResult.deleted,
    gitlabWebhooksFailed: gitlabResult.failed,
    slackTokenRevoked,
  };
};

// ==================== Impact Assessment Helpers ====================

const NO_TENANT_IMPACT: DeletionImpact = {
  isLastMember: false,
  tenantId: null,
  tenantName: null,
  memberCount: 0,
  willDeleteTenant: false,
  affectedResources: {
    providerConnections: 0,
    gitlabWebhooks: 0,
    hasSlackIntegration: false,
  },
  affectedOrganizations: [],
};

const countGitLabWebhooks = (connections: readonly ProviderConnection[]): number =>
  connections
    .filter((conn) => conn.provider === "gitlab_ci")
    .reduce((sum, conn) => {
      const webhooks =
        (conn.config as { readonly projectWebhooks?: readonly unknown[] })?.projectWebhooks ?? [];
      return sum + webhooks.length;
    }, 0);

/**
 * Assess impact for a single tenant: check member count and resources.
 * Returns null if the user is NOT the last member.
 */
const assessTenantImpact = async (tenantId: string): Promise<AffectedOrganization | null> => {
  const [tenant, memberCount, connections, slackConn] = await Promise.all([
    findTenantById(tenantId),
    countTenantMembers(tenantId),
    findByTenant(tenantId),
    findSlackConnection(tenantId),
  ]);

  if (memberCount > 1) {
    return null;
  }

  return {
    tenantId,
    tenantName: tenant?.orgName ?? null,
    memberCount,
    affectedResources: {
      providerConnections: connections.length,
      gitlabWebhooks: countGitLabWebhooks(connections),
      hasSlackIntegration: slackConn !== null,
    },
  };
};

// ==================== Service Factory ====================

export interface AccountDeletionService {
  readonly getDeletionImpact: (userId: string, context: RequestContext) => Promise<DeletionImpact>;

  readonly deleteAccount: (userId: string, context: RequestContext) => Promise<void>;
}

/**
 * Create the account deletion service.
 *
 * Accepts a GitLabProjectsPort for webhook cleanup during last-member deletion.
 */
export const createAccountDeletionService = (
  gitlabProjectsPort: GitLabProjectsPort
): AccountDeletionService => ({
  getDeletionImpact: async (userId: string, _context: RequestContext): Promise<DeletionImpact> => {
    const user = await findUserById(userId);
    if (!user) {
      throw new NotFoundError("User not found", {
        operation: "getDeletionImpact",
        metadata: { userId },
      });
    }

    // Fetch ALL organizations the user belongs to (not just selected)
    const userOrgs = await findOrganizationsByUser(userId);

    if (userOrgs.length === 0) {
      return NO_TENANT_IMPACT;
    }

    // Assess impact for each org in parallel
    const impacts = await Promise.all(userOrgs.map((org) => assessTenantImpact(org.tenantId)));

    const affectedOrganizations = impacts.filter(
      (impact): impact is AffectedOrganization => impact !== null
    );

    const hasAffectedOrgs = affectedOrganizations.length > 0;

    // Aggregate resources across all affected orgs for backward compat
    const aggregatedResources = affectedOrganizations.reduce(
      (acc, org) => ({
        providerConnections: acc.providerConnections + org.affectedResources.providerConnections,
        gitlabWebhooks: acc.gitlabWebhooks + org.affectedResources.gitlabWebhooks,
        hasSlackIntegration: acc.hasSlackIntegration || org.affectedResources.hasSlackIntegration,
      }),
      { providerConnections: 0, gitlabWebhooks: 0, hasSlackIntegration: false }
    );

    // Use selected org for backward-compat top-level fields, fallback to first affected
    const selectedOrg = userOrgs.find((org) => org.tenantId === user.tenantId);
    const selectedMemberCount = user.tenantId ? await countTenantMembers(user.tenantId) : 0;
    const primaryAffected = affectedOrganizations[0];

    return {
      isLastMember: hasAffectedOrgs,
      tenantId: user.tenantId,
      tenantName: primaryAffected?.tenantName ?? selectedOrg?.orgName ?? null,
      memberCount: selectedMemberCount,
      willDeleteTenant: hasAffectedOrgs,
      affectedResources: aggregatedResources,
      affectedOrganizations,
    };
  },

  deleteAccount: async (userId: string, context: RequestContext): Promise<void> => {
    const startTime = Date.now();
    const user = await findUserById(userId);
    if (!user) {
      throw new NotFoundError("User not found", {
        operation: "deleteAccount",
        metadata: { userId },
      });
    }

    // Check ALL organizations, not just selected
    const userOrgs = await findOrganizationsByUser(userId);
    const tenantIds = userOrgs.map((org) => org.tenantId);

    // Find all orgs where user is the last member
    const memberCounts = await Promise.all(
      tenantIds.map(async (tenantId) => ({
        tenantId,
        count: await countTenantMembers(tenantId),
      }))
    );
    const lastMemberTenants = memberCounts
      .filter(({ count }) => count <= 1)
      .map(({ tenantId }) => tenantId);

    // Clean up and delete each last-member org BEFORE deleting user
    // (user deletion cascades user_organizations, which would change member counts)
    // for...of: sequential to avoid concurrent cleanup race conditions
    for (const tenantId of lastMemberTenants) {
      const cleanupResult = await cleanupExternalResources(tenantId, gitlabProjectsPort, context);

      logger.info("External resource cleanup completed", {
        ...context,
        tenantId,
        durationMs: Date.now() - startTime,
        ...cleanupResult,
      });
    }

    // Delete user (cascades user_organizations, ON DELETE SET NULL for selected_tenant_id)
    await deleteUser(userId);

    // Hard-delete all last-member tenants (cascades provider_connections, repo_mappings)
    // for...of: sequential to avoid concurrent tenant deletion issues
    for (const tenantId of lastMemberTenants) {
      await hardDeleteTenant(tenantId);

      logger.info("Tenant deleted (last member removed)", {
        ...context,
        userId,
        tenantId,
        durationMs: Date.now() - startTime,
      });
    }

    const logMessage =
      lastMemberTenants.length > 0
        ? "Account and tenant(s) deleted (last member)"
        : "Account deleted (tenants preserved)";

    logger.info(logMessage, {
      ...context,
      userId,
      deletedTenantCount: lastMemberTenants.length,
      durationMs: Date.now() - startTime,
    });
  },
});
