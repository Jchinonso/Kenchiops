/**
 * Account Deletion Service
 *
 * Orchestrates proper account deletion with tenant cleanup.
 * When the user is the last tenant member, performs best-effort
 * external resource cleanup and hard-deletes the tenant.
 *
 * @module services/accountDeletionService
 */

import {
  createLogger,
  findUserById,
  findById as findTenantById,
  countTenantMembers,
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
};

const countGitLabWebhooks = (connections: readonly ProviderConnection[]): number =>
  connections
    .filter((conn) => conn.provider === "gitlab_ci")
    .reduce((sum, conn) => {
      const webhooks =
        (conn.config as { readonly projectWebhooks?: readonly unknown[] })?.projectWebhooks ?? [];
      return sum + webhooks.length;
    }, 0);

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

    if (!user.tenantId) {
      return NO_TENANT_IMPACT;
    }

    const [tenant, memberCount, connections, slackConn] = await Promise.all([
      findTenantById(user.tenantId),
      countTenantMembers(user.tenantId),
      findByTenant(user.tenantId),
      findSlackConnection(user.tenantId),
    ]);

    const isLastMember = memberCount <= 1;

    return {
      isLastMember,
      tenantId: user.tenantId,
      tenantName: tenant?.orgName ?? null,
      memberCount,
      willDeleteTenant: isLastMember,
      affectedResources: {
        providerConnections: connections.length,
        gitlabWebhooks: countGitLabWebhooks(connections),
        hasSlackIntegration: slackConn !== null,
      },
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

    const { tenantId } = user;

    if (tenantId) {
      const memberCount = await countTenantMembers(tenantId);
      const isLastMember = memberCount <= 1;

      if (isLastMember) {
        const cleanupResult = await cleanupExternalResources(tenantId, gitlabProjectsPort, context);

        logger.info("External resource cleanup completed", {
          ...context,
          tenantId,
          durationMs: Date.now() - startTime,
          ...cleanupResult,
        });

        // Delete user first (users.tenant_id ON DELETE SET NULL won't interfere)
        await deleteUser(userId);

        // Hard-delete tenant (cascades provider_connections, repo_mappings, audit_log)
        await hardDeleteTenant(tenantId);

        logger.info("Account and tenant deleted (last member)", {
          ...context,
          userId,
          tenantId,
          durationMs: Date.now() - startTime,
        });

        return;
      }
    }

    // Non-last-member or no tenant: just delete the user
    await deleteUser(userId);

    logger.info("Account deleted (tenant preserved)", {
      ...context,
      userId,
      tenantId: tenantId ?? "none",
      durationMs: Date.now() - startTime,
    });
  },
});
