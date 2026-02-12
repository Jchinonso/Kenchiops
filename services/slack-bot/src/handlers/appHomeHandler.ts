/**
 * App Home Handler
 *
 * Handles the app_home_opened event to display a personalized
 * home tab for users who open the Kenchi app.
 */

import {
  createLogger,
  findBySlackWorkspace,
  findAllMappingsForTenant,
  getTenantStatistics,
  formatRelativeTime,
  getErrorMessage,
  SLACK_UI_ERROR_MESSAGES,
  type Tenant,
  type TenantStatistics,
} from "@kenchi/shared";
import {
  buildAppHomeView,
  buildErrorView,
  type AppHomeContext,
  type RepositoryMappingDisplay,
} from "../formatters/appHomeFormatter.js";
import type { SlackClient } from "./appHomeHandlerTypes.js";

const logger = createLogger("app-home");

/**
 * Get tenant info for the workspace
 */
const getTenantInfo = async (workspaceId: string): Promise<Tenant | undefined> => {
  try {
    const tenant = await findBySlackWorkspace(workspaceId);
    return tenant ?? undefined;
  } catch (error) {
    logger.warn("Failed to get tenant info", {
      workspaceId,
      error: getErrorMessage(error),
    });
    return undefined;
  }
};

/**
 * Get repository-channel mappings for a tenant
 */
const getRepositoryMappings = async (
  tenantId: string
): Promise<readonly RepositoryMappingDisplay[]> => {
  try {
    const mappings = await findAllMappingsForTenant(tenantId);
    return mappings.map((mapping) => ({
      repository: mapping.repository,
      channelId: mapping.slackChannelId,
      channelName: mapping.slackChannelName,
    }));
  } catch (error) {
    logger.warn("Failed to get repository mappings", {
      tenantId,
      error: getErrorMessage(error),
    });
    return [];
  }
};

/**
 * Get activity statistics for a tenant
 */
const getStatistics = async (tenantId: string): Promise<TenantStatistics | null> => {
  try {
    return await getTenantStatistics(tenantId);
  } catch (error) {
    logger.warn("Failed to get tenant statistics", {
      tenantId,
      error: getErrorMessage(error),
    });
    return null;
  }
};

/**
 * Build the context for App Home view
 */
const buildAppHomeContext = async (
  _client: SlackClient,
  workspaceId: string
): Promise<AppHomeContext> => {
  // Fetch tenant first (needed for mappings and stats lookup)
  const tenant = await getTenantInfo(workspaceId);

  // Fetch repository mappings and statistics in parallel if tenant exists
  const [repositoryMappings, statistics] = tenant
    ? await Promise.all([getRepositoryMappings(tenant.id), getStatistics(tenant.id)])
    : [[], null];

  // Bot is active if we successfully reached this point (Slack connection works)
  // The tenant/GitHub status is shown separately
  return {
    botStatus: "active",
    repositoryMappings,
    tenant: tenant
      ? {
          githubOrg: tenant.githubOrg,
          status: tenant.status,
          slackTeamName: tenant.slackTeamName ?? undefined,
        }
      : undefined,
    recentActivity: {
      failuresAnalyzed: statistics?.failuresAnalyzedToday ?? 0,
      totalAlerts: statistics?.totalAlertsSent ?? 0,
      lastAlertTime: statistics?.lastAlertTime
        ? formatRelativeTime(statistics.lastAlertTime)
        : undefined,
    },
    workspaceId,
  };
};

/**
 * Handle the app_home_opened event
 *
 * Publishes a personalized home view for the user showing:
 * - Bot status and active channel
 * - GitHub connection status
 * - Recent activity summary
 * - Quick action buttons
 */
export const handleAppHomeOpened = async (client: SlackClient, userId: string): Promise<void> => {
  try {
    // Get workspace ID
    const authResult = await client.auth.test();
    const workspaceId = authResult.team_id;

    if (!workspaceId) {
      logger.error("Could not determine workspace ID");
      return;
    }

    logger.info("App Home opened", {
      userId,
      workspaceId,
    });

    // Build context and view
    const context = await buildAppHomeContext(client, workspaceId);
    const view = buildAppHomeView(context);

    // Publish the view
    await client.views.publish({
      user_id: userId,
      view,
    });

    logger.info("App Home view published", {
      userId,
      workspaceId,
      botStatus: context.botStatus,
      repositoryMappingsCount: context.repositoryMappings.length,
      hasGitHubConnection: !!context.tenant?.githubOrg,
    });
  } catch (error) {
    logger.error("Failed to publish App Home view", {
      userId,
      error: getErrorMessage(error),
    });

    // Try to publish error view
    try {
      const errorView = buildErrorView(SLACK_UI_ERROR_MESSAGES.DASHBOARD_LOAD_FAILED);
      await client.views.publish({
        user_id: userId,
        view: errorView,
      });
    } catch (viewError) {
      logger.error("Failed to publish error view", {
        error: viewError instanceof Error ? viewError.message : "Unknown error",
      });
    }
  }
};

/**
 * Handle the test_connection action from App Home
 */
export const handleTestConnection = async (
  client: SlackClient,
  userId: string,
  _responseUrl?: string
): Promise<{ success: boolean; message: string }> => {
  try {
    const authResult = await client.auth.test();

    logger.info("Connection test successful", {
      userId,
      teamId: authResult.team_id,
      botId: authResult.bot_id,
    });

    return {
      success: true,
      message: `Connection successful! Bot ID: ${authResult.bot_id}`,
    };
  } catch (error) {
    logger.error("Connection test failed", {
      userId,
      error: getErrorMessage(error),
    });

    return {
      success: false,
      message: "Connection test failed. Please check your configuration.",
    };
  }
};

/**
 * Handle the refresh_home action
 */
export const handleRefreshHome = async (client: SlackClient, userId: string): Promise<void> => {
  await handleAppHomeOpened(client, userId);
};
