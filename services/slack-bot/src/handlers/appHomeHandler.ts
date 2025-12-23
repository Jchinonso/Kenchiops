/**
 * App Home Handler
 *
 * Handles the app_home_opened event to display a personalized
 * home tab for users who open the Kenchi app.
 */

import { createLogger, findBySlackWorkspace, type Tenant } from "@kenchi/shared";
import type { WebClient } from "@slack/web-api";
import {
  buildAppHomeView,
  buildErrorView,
  type AppHomeContext,
} from "../formatters/appHomeFormatter.js";
import { getBotMemberChannels, type SlackChannel } from "../services/channelService.js";

const logger = createLogger("app-home");

/**
 * Type for Slack client (subset of WebClient)
 */
type SlackClient = Pick<WebClient, "views" | "auth" | "conversations">;

/**
 * Get the bot's active channel (first channel it's a member of)
 */
const getActiveChannel = async (
  client: SlackClient
): Promise<SlackChannel | undefined> => {
  try {
    const channels = await getBotMemberChannels(client as WebClient);
    return channels[0];
  } catch (error) {
    logger.warn("Failed to get active channel", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return undefined;
  }
};

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
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return undefined;
  }
};

/**
 * Build the context for App Home view
 */
const buildAppHomeContext = async (
  client: SlackClient,
  workspaceId: string
): Promise<AppHomeContext> => {
  // Fetch data in parallel
  const [activeChannel, tenant] = await Promise.all([
    getActiveChannel(client),
    getTenantInfo(workspaceId),
  ]);

  const hasActiveChannel = !!activeChannel;
  const isGitHubConnected = tenant?.githubInstallationId !== undefined;

  return {
    botStatus: hasActiveChannel ? "active" : "inactive",
    activeChannel: activeChannel
      ? {
          id: activeChannel.id || "",
          name: activeChannel.name || "unknown",
        }
      : undefined,
    tenant: tenant
      ? {
          githubOrg: tenant.githubOrg,
          status: tenant.status,
          slackTeamName: tenant.slackTeamName ?? undefined,
        }
      : undefined,
    recentActivity: {
      failuresAnalyzed: 0, // TODO: Query from database
      lastAlertTime: undefined,
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
export const handleAppHomeOpened = async (
  client: SlackClient,
  userId: string
): Promise<void> => {
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
      hasActiveChannel: !!context.activeChannel,
      hasGitHubConnection: !!context.tenant?.githubOrg,
    });
  } catch (error) {
    logger.error("Failed to publish App Home view", {
      userId,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    // Try to publish error view
    try {
      const errorView = buildErrorView(
        "Failed to load dashboard. Please try again."
      );
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
  responseUrl?: string
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
      error: error instanceof Error ? error.message : "Unknown error",
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
export const handleRefreshHome = async (
  client: SlackClient,
  userId: string
): Promise<void> => {
  await handleAppHomeOpened(client, userId);
};
