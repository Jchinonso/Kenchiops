/**
 * Slack Event Handler Setup
 *
 * Registers all Slack event handlers with the Bolt app.
 * Extracted from index.ts to keep entry point under 500 lines.
 *
 * @module handlers/slackEventSetup
 */

import {
  logger,
  findTenantBySlackWorkspace,
  findGitHubAppConnection,
  deleteMappingsForChannel,
  getErrorMessage,
  SLACK_ACTION_IDS,
  SLACK_ACTION_PATTERNS,
  SLACK_MODAL_CALLBACKS,
  QA_ACTION_IDS,
} from "@kenchi/shared";
import { handleKenchiCommand } from "./commandHandler.js";
import { handleAppMention } from "./mentionHandler.js";
import { handleMessage } from "./messageHandler.js";
import { handleActionApproval, handleActionRejection } from "./actionHandler.js";
import {
  handlePositiveFeedback,
  handleNegativeFeedback,
  handleRAGFeedbackHelpful,
  handleRAGFeedbackNotHelpful,
  handleQAFeedbackHelpful,
  handleQAFeedbackNotHelpful,
} from "./feedbackHandler.js";
import { handleDocumentModalSubmit } from "./documentIngestionHandler.js";
import {
  handleBotJoinedChannel,
  buildRepoSelectModal,
  buildNoReposModal,
  getAvailableRepositories,
  buildLoadingReposModal,
} from "./channelHandler.js";
import { toSlackSDKView, type SlackApp } from "../types/slackTypes.js";
import type { View } from "@slack/types";
import { handleAppHomeOpened, handleTestConnection, handleRefreshHome } from "./appHomeHandler.js";
import { registerRepoSelectHandler } from "./repoSelectHandler.js";
import type { ButtonAction } from "./slackEventSetupTypes.js";

/**
 * Handle bot leaving a channel - clean up repository mappings.
 *
 * @param workspaceId - The Slack workspace ID
 * @param channelId - The channel ID the bot left
 */
export const handleBotLeftChannel = async (
  workspaceId: string,
  channelId: string
): Promise<void> => {
  logger.info("Bot left channel, cleaning up mappings", {
    channelId,
    workspaceId,
  });

  try {
    const tenant = await findTenantBySlackWorkspace(workspaceId);

    if (tenant) {
      const deletedCount = await deleteMappingsForChannel(tenant.id, channelId);

      logger.info("Cleaned up repository mappings for channel", {
        channelId,
        deletedCount,
      });
    }
  } catch (error) {
    logger.error("Failed to clean up mappings on channel leave", {
      channelId,
      error: getErrorMessage(error),
    });
  }
};

/**
 * Sets up Slack event handlers.
 *
 * @param app - Slack Bolt app instance
 */
export const setupSlackHandlers = (app: SlackApp): void => {
  // Debug: Log all incoming events
  app.use(async (args) => {
    const { payload } = args;
    if (payload && "type" in payload) {
      logger.info("Received Slack event", {
        type: payload.type,
      });
    }
    await args.next();
  });

  // Handle /kenchi slash command
  app.command("/kenchi", async ({ command, ack, respond, client }) => {
    await handleKenchiCommand(command, ack, respond, client);
  });

  // Handle message events (includes resolution detection for CI failure threads)
  app.message(async ({ message, client }) => {
    await handleMessage(message, client);
  });

  // Handle app mentions
  app.event("app_mention", async ({ event, say }) => {
    await handleAppMention(event, say);
  });

  // Handle bot joining a channel - enforce single channel limit
  app.event("member_joined_channel", async ({ event, client }) => {
    logger.info("member_joined_channel event received", {
      user: event.user,
      channel: event.channel,
    });

    const authResult = await client.auth.test();
    const botId = authResult.bot_id;
    const botUserId = authResult.user_id;

    logger.info("Bot identity check", {
      eventUser: event.user,
      botId,
      botUserId,
      isBot: event.user === botId || event.user === botUserId,
    });

    // Only handle when the bot itself joins a channel
    // Check both bot_id and user_id as Slack may use either
    if (!botId || (event.user !== botId && event.user !== botUserId)) {
      logger.info("Ignoring event - not the bot joining", {
        eventUser: event.user,
        botId,
        botUserId,
      });
      return;
    }

    await handleBotJoinedChannel(client, event.channel, event.team);
  });

  // Handle bot leaving a channel - clean up repository mappings
  app.event("member_left_channel", async ({ event, client }) => {
    const authResult = await client.auth.test();
    const botId = authResult.bot_id;
    const botUserId = authResult.user_id;

    // Only handle when the bot itself leaves a channel
    if (!botId || (event.user !== botId && event.user !== botUserId)) {
      return;
    }

    await handleBotLeftChannel(event.team, event.channel);
  });

  // Register action button handlers
  setupActionHandlers(app);

  // Register feedback button handlers
  setupFeedbackHandlers(app);

  // Register App Home handlers
  setupAppHomeHandlers(app);

  // Register modal submission handlers
  setupModalSubmissionHandlers(app);

  // Register repository selection modal handler
  registerRepoSelectHandler(app);
};

/**
 * Sets up action approval/rejection button handlers.
 */
const setupActionHandlers = (app: SlackApp): void => {
  app.action(SLACK_ACTION_PATTERNS.APPROVE, async ({ action, ack, say, body }) => {
    const messageTs =
      "message" in body && body.message && "ts" in body.message
        ? (body.message.ts as string)
        : undefined;
    if (action.type === "button" && "action_id" in action && "value" in action) {
      const workspaceId = extractWorkspaceId(body as { team?: { id: string } | string });
      await handleActionApproval(action, ack, say, messageTs, workspaceId);
    }
  });

  app.action(SLACK_ACTION_PATTERNS.REJECT, async ({ action, ack, say, body }) => {
    const messageTs =
      "message" in body && body.message && "ts" in body.message
        ? (body.message.ts as string)
        : undefined;
    if (action.type === "button" && "action_id" in action && "value" in action) {
      const workspaceId = extractWorkspaceId(body as { team?: { id: string } | string });
      await handleActionRejection(action, ack, say, messageTs, workspaceId);
    }
  });
};

/**
 * Sets up feedback button handlers (helpful/not helpful).
 */
const extractWorkspaceId = (body: { team?: { id: string } | string }): string | undefined => {
  if (!body.team) {
    return undefined;
  }
  return typeof body.team === "string" ? body.team : body.team.id;
};

const setupFeedbackHandlers = (app: SlackApp): void => {
  app.action(SLACK_ACTION_IDS.FEEDBACK_HELPFUL, async ({ action, ack, body, respond }) => {
    if (action.type === "button" && "action_id" in action && "value" in action) {
      const workspaceId = extractWorkspaceId(body as { team?: { id: string } | string });
      await handlePositiveFeedback(action as ButtonAction, ack, body.user.id, respond, workspaceId);
    }
  });

  app.action(SLACK_ACTION_IDS.FEEDBACK_NOT_HELPFUL, async ({ action, ack, body, respond }) => {
    if (action.type === "button" && "action_id" in action && "value" in action) {
      const workspaceId = extractWorkspaceId(body as { team?: { id: string } | string });
      await handleNegativeFeedback(action as ButtonAction, ack, body.user.id, respond, workspaceId);
    }
  });

  // RAG feedback buttons
  app.action(SLACK_ACTION_IDS.RAG_FEEDBACK_HELPFUL, async ({ action, ack, body }) => {
    if (action.type === "button" && "action_id" in action && "value" in action) {
      await handleRAGFeedbackHelpful(action as ButtonAction, ack, body.user.id);
    }
  });

  app.action(SLACK_ACTION_IDS.RAG_FEEDBACK_NOT_HELPFUL, async ({ action, ack, body }) => {
    if (action.type === "button" && "action_id" in action && "value" in action) {
      await handleRAGFeedbackNotHelpful(action as ButtonAction, ack, body.user.id);
    }
  });

  // Q&A feedback buttons
  app.action(QA_ACTION_IDS.QA_HELPFUL, async ({ action, ack, body, respond }) => {
    if (action.type === "button" && "action_id" in action && "value" in action) {
      const workspaceId = extractWorkspaceId(body as { team?: { id: string } | string });
      await handleQAFeedbackHelpful(
        action as ButtonAction,
        ack,
        body.user.id,
        respond,
        workspaceId
      );
    }
  });

  app.action(QA_ACTION_IDS.QA_NOT_HELPFUL, async ({ action, ack, body, respond }) => {
    if (action.type === "button" && "action_id" in action && "value" in action) {
      const workspaceId = extractWorkspaceId(body as { team?: { id: string } | string });
      await handleQAFeedbackNotHelpful(
        action as ButtonAction,
        ack,
        body.user.id,
        respond,
        workspaceId
      );
    }
  });
};

/**
 * Sets up App Home event and action handlers.
 */
const setupAppHomeHandlers = (app: SlackApp): void => {
  app.event("app_home_opened", async ({ event, client }) => {
    await handleAppHomeOpened(client, event.user);
  });

  app.action(SLACK_ACTION_IDS.TEST_CONNECTION, async ({ ack, client, body }) => {
    await ack();
    await handleTestConnection(client, body.user.id);
    await handleRefreshHome(client, body.user.id);
  });

  app.action(SLACK_ACTION_IDS.REFRESH_HOME, async ({ ack, client, body }) => {
    await ack();
    await handleRefreshHome(client, body.user.id);
  });

  // External link buttons - just acknowledge
  app.action(SLACK_ACTION_IDS.CONNECT_GITHUB, async ({ ack }) => {
    await ack();
  });

  app.action(SLACK_ACTION_IDS.VIEW_DOCS, async ({ ack }) => {
    await ack();
  });

  app.action(SLACK_ACTION_IDS.GET_SUPPORT, async ({ ack }) => {
    await ack();
  });

  // Track in-flight modal opens per user to prevent duplicate clicks
  const repoModalInFlight = new Set<string>();

  // Repository selection button
  app.action(SLACK_ACTION_IDS.SELECT_REPOSITORY, async ({ ack, action, body, client }) => {
    await ack();

    const userId = body.user.id;

    // Skip if this user already has a modal being opened
    if (repoModalInFlight.has(userId)) {
      logger.info("Skipping duplicate select_repository click", { userId });
      return;
    }

    repoModalInFlight.add(userId);

    try {
      if (action.type !== "button" || !("value" in action) || !action.value) {
        logger.error("Invalid action type for select_repository_button");
        return;
      }

      const { channelId, channelName, messageTs } = JSON.parse(action.value) as {
        channelId: string;
        channelName: string;
        messageTs?: string;
      };

      if (!("trigger_id" in body)) {
        logger.error("Missing trigger_id in body");
        return;
      }

      // Open loading modal immediately to avoid trigger_id expiration (~3s TTL)
      const loadingView = buildLoadingReposModal(channelName);
      const openResult = await client.views.open({
        trigger_id: body.trigger_id,
        view: toSlackSDKView(loadingView) as View,
      });

      const viewId = (openResult.view as { id?: string })?.id;
      if (!viewId) {
        logger.error("Failed to get view ID from loading modal");
        return;
      }

      const workspaceId = "team" in body && body.team ? (body.team as { id: string }).id : "";

      const tenant = await findTenantBySlackWorkspace(workspaceId);
      const ghConn = tenant ? await findGitHubAppConnection(tenant.id) : null;
      const installationId = ghConn?.externalOrgId ? Number(ghConn.externalOrgId) : null;

      if (!tenant || !installationId) {
        logger.error("No GitHub installation found for workspace", { workspaceId });
        return;
      }

      const repositories = await getAvailableRepositories(installationId, tenant.id);

      const finalView =
        repositories.length > 0
          ? buildRepoSelectModal(channelId, channelName, repositories, messageTs)
          : buildNoReposModal(channelName);

      await client.views.update({
        view_id: viewId,
        view: toSlackSDKView(finalView) as View,
      });

      logger.info("Opened repository selection modal from button", {
        channelId,
        channelName,
        userId,
        repositoryCount: repositories.length,
      });
    } catch (error) {
      logger.error("Failed to open repository selection modal", {
        error: getErrorMessage(error),
      });
    } finally {
      repoModalInFlight.delete(userId);
    }
  });
};

/**
 * Sets up modal submission handlers.
 */
const setupModalSubmissionHandlers = (app: SlackApp): void => {
  // Document ingestion modal submission
  app.view(SLACK_MODAL_CALLBACKS.ADD_DOCUMENT, async ({ ack, body, view }) => {
    const userId = body.user.id;
    const { values } = view.state;
    const privateMetadata = view.private_metadata;

    // Validate and process submission
    const result = await handleDocumentModalSubmit(values, userId, privateMetadata);

    if (!result.success) {
      // Return validation error to modal
      await ack({
        response_action: "errors",
        errors: {
          doc_content_block: result.error ?? "Validation failed",
        },
      });
      return;
    }

    // Success - close modal
    await ack();

    logger.info("Document added via modal", { userId });
  });
};
