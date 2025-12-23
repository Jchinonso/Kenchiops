/**
 * Slack Bot Service
 *
 * This service handles Slack interactions using the Slack Bolt framework.
 * It listens for Slack events and commands, and can interact with the shared
 * OpenAI client and other services.
 *
 * SAFETY NOTE: The LLM (OpenAI) provides analysis and suggestions only.
 * All actual decisions and side-effects (like running commands or altering state)
 * are handled by deterministic code after validation.
 */

// @slack/bolt is a CommonJS module - use default import
import Bolt from "@slack/bolt";
import type { ButtonAction as BoltButtonAction } from "@slack/bolt";
import express from "express";
import {
  logger,
  config,
  initDatabase,
  closeDatabase,
} from "@kenchi/shared";

const { App } = Bolt;
type SlackApp = InstanceType<typeof App>;
type ButtonAction = BoltButtonAction;
import { loadAppConfig } from "./config/appConfig.js";
import { handleKenchiCommand } from "./handlers/commandHandler.js";
import { handleAppMention } from "./handlers/mentionHandler.js";
import { handleMessage } from "./handlers/messageHandler.js";
import {
  handleActionApproval,
  handleActionRejection,
  handlePositiveFeedback,
  handleNegativeFeedback,
} from "./handlers/actionHandler.js";
import { handleBotJoinedChannel } from "./handlers/channelHandler.js";
import {
  handleAppHomeOpened,
  handleTestConnection,
  handleRefreshHome,
} from "./handlers/appHomeHandler.js";
import { createHttpRoutes } from "./routes/httpRoutes.js";
import { oauthRoutes } from "./routes/oauthRoutes.js";

/**
 * Initializes and configures the Slack Bolt app.
 * Uses Socket Mode to receive events via WebSocket (no public URL needed).
 *
 * @param config - Application configuration
 * @returns Configured Slack Bolt app instance
 */
function createSlackApp(config: ReturnType<typeof loadAppConfig>): SlackApp {
  return new App({
    token: config.slackBotToken,
    signingSecret: config.slackSigningSecret,
    socketMode: true,
    appToken: config.slackAppToken,
  });
}

/**
 * Sets up Slack event handlers.
 *
 * @param app - Slack Bolt app instance
 */
function setupSlackHandlers(app: SlackApp): void {
  // Debug: Log all incoming events
  app.use(async (args) => {
    const payload = args.payload;
    if (payload && "type" in payload) {
      logger.info("Received Slack event", {
        type: payload.type,
      });
    }
    await args.next();
  });

  // Handle /kenchi slash command
  app.command("/kenchi", async ({ command, ack, respond }) => {
    await handleKenchiCommand(command, ack, respond);
  });

  // Handle message events
  app.message(async ({ message }) => {
    await handleMessage(message);
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

    await handleBotJoinedChannel(client, event.channel, botId);
  });

  // Handle action button clicks
  app.action(/^approve_action_/, async ({ action, ack, say, body }) => {
    const messageTs =
      "message" in body && body.message && "ts" in body.message
        ? (body.message.ts as string)
        : undefined;
    if (action.type === "button" && "action_id" in action && "value" in action) {
      await handleActionApproval(action, ack, say, messageTs);
    }
  });

  app.action(/^reject_action_/, async ({ action, ack, say, body }) => {
    const messageTs =
      "message" in body && body.message && "ts" in body.message
        ? (body.message.ts as string)
        : undefined;
    if (action.type === "button" && "action_id" in action && "value" in action) {
      await handleActionRejection(action, ack, say, messageTs);
    }
  });

  // Handle feedback buttons
  app.action("feedback_helpful", async ({ action, ack }) => {
    if (action.type === "button" && "action_id" in action && "value" in action) {
      await handlePositiveFeedback(action as ButtonAction, ack);
    }
  });

  app.action("feedback_not_helpful", async ({ action, ack }) => {
    if (action.type === "button" && "action_id" in action && "value" in action) {
      await handleNegativeFeedback(action as ButtonAction, ack);
    }
  });

  // Handle App Home opened event
  app.event("app_home_opened", async ({ event, client }) => {
    await handleAppHomeOpened(client, event.user);
  });

  // Handle App Home action buttons
  app.action("test_connection", async ({ ack, client, body }) => {
    await ack();
    await handleTestConnection(client, body.user.id);
    // Refresh the home view to show the result
    await handleRefreshHome(client, body.user.id);
  });

  app.action("refresh_home", async ({ ack, client, body }) => {
    await ack();
    await handleRefreshHome(client, body.user.id);
  });

  // Handle connect_github button (external link, just acknowledge)
  app.action("connect_github", async ({ ack }) => {
    await ack();
  });

  // Handle view_docs button (external link, just acknowledge)
  app.action("view_docs", async ({ ack }) => {
    await ack();
  });

  // Handle get_support button (external link, just acknowledge)
  app.action("get_support", async ({ ack }) => {
    await ack();
  });
}

/**
 * Initialize database connection for multi-tenant support
 */
function initializeDatabase(): void {
  try {
    initDatabase({
      connectionString: config.DATABASE_URL,
      maxConnections: 10,
      idleTimeoutMs: 30000,
    });
    logger.info("Database connection initialized for multi-tenant support");
  } catch (error) {
    logger.error("Failed to initialize database", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

/**
 * Initializes and starts the Slack bot service.
 * Uses Socket Mode for Slack events (WebSocket connection, no public URL needed).
 */
async function startService(): Promise<void> {
  try {
    const appConfig = loadAppConfig();

    // Initialize database for multi-tenant support
    initializeDatabase();

    // Initialize Slack app with Socket Mode
    const slackApp = createSlackApp(appConfig);
    setupSlackHandlers(slackApp);

    // Initialize Express app for HTTP endpoints (CI failure processing)
    const expressApp = express();
    expressApp.use(express.json());

    // Add OAuth routes for multi-tenant Slack installation
    expressApp.use(oauthRoutes);

    // Add message/broadcast routes
    expressApp.use(createHttpRoutes(slackApp));

    // Start Slack app in Socket Mode (connects via WebSocket)
    await slackApp.start();
    logger.info("Slack bot started in Socket Mode", {
      mode: "socket",
      environment: appConfig.nodeEnv,
      multiTenantMode: config.MULTI_TENANT_MODE || false,
    });

    // Start Express server for CI failure processing endpoints
    const server = expressApp.listen(appConfig.httpPort, () => {
      logger.info("HTTP server started for CI failure processing", {
        port: appConfig.httpPort,
        environment: appConfig.nodeEnv,
        oauthEnabled: !!(config.SLACK_CLIENT_ID && config.SLACK_CLIENT_SECRET),
      });
    });

    // Handle graceful shutdown
    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`Received ${signal}, shutting down gracefully`);

      server.close(async () => {
        await closeDatabase();
        logger.info("Server closed");
        process.exit(0);
      });

      // Force exit after 10 seconds
      setTimeout(() => {
        logger.warn("Forced shutdown after timeout");
        process.exit(1);
      }, 10000);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    logger.error("Failed to start Slack bot", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

// Start the service
startService().catch((error) => {
  logger.error("Fatal error starting Slack bot service", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
