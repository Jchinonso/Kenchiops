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
  closeRedis,
  waitForRedisConnection,
  findBySlackWorkspace,
  deleteMappingsForChannel,
  isSocketModeDisconnectError,
  createRedisRateLimiter,
  startSlackNotificationWorker,
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
import {
  handleBotJoinedChannel,
  buildRepoSelectModal,
  buildNoReposModal,
  getAvailableRepositories,
} from "./handlers/channelHandler.js";
import {
  handleAppHomeOpened,
  handleTestConnection,
  handleRefreshHome,
} from "./handlers/appHomeHandler.js";
import { registerRepoSelectHandler } from "./handlers/repoSelectHandler.js";
import { createHttpRoutes } from "./routes/httpRoutes.js";
import { oauthRoutes } from "./routes/oauthRoutes.js";
import { createNotificationHandler } from "./services/notificationHandler.js";

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
  app.command("/kenchi", async ({ command, ack, respond, client }) => {
    await handleKenchiCommand(command, ack, respond, client);
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

  // Handle bot leaving a channel - clean up repository mappings
  app.event("member_left_channel", async ({ event, client }) => {
    const authResult = await client.auth.test();
    const botId = authResult.bot_id;
    const botUserId = authResult.user_id;

    // Only handle when the bot itself leaves a channel
    if (!botId || (event.user !== botId && event.user !== botUserId)) {
      return;
    }

    const workspaceId = authResult.team_id || "";
    const channelId = event.channel;

    logger.info("Bot left channel, cleaning up mappings", {
      channelId,
      workspaceId,
    });

    try {
      const tenant = await findBySlackWorkspace(workspaceId);

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
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
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

  // Handle select_repository_button - opens the repository selection modal
  app.action("select_repository_button", async ({ ack, action, body, client }) => {
    await ack();

    try {
      // Get button value
      if (action.type !== "button" || !("value" in action) || !action.value) {
        logger.error("Invalid action type for select_repository_button");
        return;
      }

      const { channelId, channelName, messageTs } = JSON.parse(action.value) as {
        channelId: string;
        channelName: string;
        messageTs?: string;
      };

      // Get trigger_id from body
      if (!("trigger_id" in body)) {
        logger.error("Missing trigger_id in body");
        return;
      }

      // Get workspace ID for tenant lookup
      const authResult = await client.auth.test();
      const workspaceId = authResult.team_id || "";

      // Look up tenant to get GitHub installation ID
      const tenant = await findBySlackWorkspace(workspaceId);

      if (!tenant || !tenant.githubInstallationId) {
        logger.error("No GitHub installation found for workspace", { workspaceId });
        return;
      }

      // Fetch available repositories from GitHub App API
      const repositories = await getAvailableRepositories(tenant.githubInstallationId, tenant.id);

      // Open the appropriate modal based on available repositories
      const view =
        repositories.length > 0
          ? buildRepoSelectModal(channelId, channelName, repositories, messageTs)
          : buildNoReposModal(channelName);

      await client.views.open({
        trigger_id: body.trigger_id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        view: view as any,
      });

      logger.info("Opened repository selection modal from button", {
        channelId,
        channelName,
        userId: body.user.id,
        repositoryCount: repositories.length,
      });
    } catch (error) {
      logger.error("Failed to open repository selection modal", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Register repository selection modal handler
  registerRepoSelectHandler(app);
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

    // Redis-backed rate limiter for HTTP endpoints
    const httpRateLimiter = createRedisRateLimiter({
      windowMs: 60000, // 1 minute
      max: 200, // Higher limit for internal service calls
      message: "Too many requests to Slack bot service",
      keyPrefix: "rl:slack-bot:",
      skip: (req) => req.path === "/health",
    });
    expressApp.use(httpRateLimiter.middleware());

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

    // Start notification queue worker (processes messages from GitHub App)
    let stopNotificationWorker: (() => void) | null = null;
    if (config.REDIS_URL) {
      // Wait for Redis to be connected before starting queue worker
      try {
        await waitForRedisConnection(10000);
        logger.info("Redis connection ready");
      } catch (error) {
        logger.error("Failed to connect to Redis", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
        // Continue anyway - worker will handle reconnection
      }

      const notificationHandler = createNotificationHandler(slackApp.client);
      stopNotificationWorker = await startSlackNotificationWorker(notificationHandler, {
        pollIntervalMs: 1000,
        maxConcurrent: 3,
      });
      logger.info("Slack notification queue worker started");
    } else {
      logger.warn("Redis not configured, notification queue worker disabled");
    }

    // Start Express server for CI failure processing endpoints
    const server = expressApp.listen(appConfig.httpPort, () => {
      logger.info("HTTP server started for CI failure processing", {
        port: appConfig.httpPort,
        environment: appConfig.nodeEnv,
        oauthEnabled: !!(config.SLACK_CLIENT_ID && config.SLACK_CLIENT_SECRET),
        queueWorkerEnabled: !!config.REDIS_URL,
      });
    });

    // Handle graceful shutdown
    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`Received ${signal}, shutting down gracefully`);

      // Stop notification worker first
      if (stopNotificationWorker) {
        logger.info("Stopping notification queue worker...");
        stopNotificationWorker();
      }

      server.close(async () => {
        await Promise.all([closeDatabase(), closeRedis()]);
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

// Handle uncaught exceptions - specifically for socket-mode disconnect issues
process.on("uncaughtException", (error) => {
  // Socket-mode disconnect during connecting is a known transient issue
  // Uses shared utility for pattern matching
  if (isSocketModeDisconnectError(error.message)) {
    logger.warn("Socket-mode disconnect detected, will auto-reconnect", {
      error: error.message,
    });
    // Don't exit - the socket-mode client will auto-reconnect
    return;
  }

  // All other uncaught exceptions should crash the app
  logger.error("Uncaught exception - crashing", {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection", {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
});

// Start the service
startService().catch((error) => {
  logger.error("Fatal error starting Slack bot service", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
