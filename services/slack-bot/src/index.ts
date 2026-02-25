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
import express from "express";
import {
  logger,
  config,
  initDatabase,
  closeDatabase,
  closeRedis,
  waitForRedisConnection,
  isSocketModeDisconnectError,
  createRateLimitMiddleware,
  createSecurityHeaders,
  metricsMiddleware,
  startSlackNotificationWorker,
  getErrorMessage,
  SLACK_BOT_RATE_LIMITS,
  SLACK_BOT_TIMEOUTS,
  SLACK_BOT_DB_CONFIG,
  SLACK_BOT_MESSAGES,
  shouldSkipSlackBotRateLimit,
  SERVER_TIMEOUTS,
  EXPRESS_CONFIG,
} from "@kenchi/shared";
import { loadAppConfig } from "./config/appConfig.js";
import { setupSlackHandlers } from "./handlers/slackEventSetup.js";
import { createHttpRoutes } from "./routes/httpRoutes.js";
import { oauthRoutes } from "./routes/oauthRoutes.js";
import { createNotificationHandler } from "./services/notificationHandler.js";
import type { SlackApp } from "./types/slackTypes.js";

const { App } = Bolt;

/**
 * Initializes and configures the Slack Bolt app.
 * Uses Socket Mode to receive events via WebSocket (no public URL needed).
 *
 * @param appConfig - Application configuration
 * @returns Configured Slack Bolt app instance
 */
const createSlackApp = (appConfig: ReturnType<typeof loadAppConfig>): SlackApp =>
  new App({
    token: appConfig.slackBotToken,
    signingSecret: appConfig.slackSigningSecret,
    socketMode: true,
    appToken: appConfig.slackAppToken,
  });

/**
 * Initialize database connection for multi-tenant support.
 */
const initializeDatabase = (): void => {
  try {
    initDatabase({
      connectionString: config.DATABASE_URL,
      maxConnections: SLACK_BOT_DB_CONFIG.MAX_CONNECTIONS,
      idleTimeoutMs: SLACK_BOT_DB_CONFIG.IDLE_TIMEOUT_MS,
    });
    logger.info("Database connection initialized for multi-tenant support");
  } catch (error) {
    logger.error("Failed to initialize database", {
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Start notification queue worker if Redis is configured.
 *
 * @param slackApp - The Slack Bolt app instance
 * @returns Stop function for the worker, or null if not started
 */
const startQueueWorker = async (slackApp: SlackApp): Promise<(() => void) | null> => {
  if (!config.REDIS_URL) {
    logger.warn("Redis not configured, notification queue worker disabled");
    return null;
  }

  try {
    await waitForRedisConnection(SLACK_BOT_TIMEOUTS.REDIS_CONNECTION_MS);
    logger.info("Redis connection ready");
  } catch (error) {
    logger.error("Failed to connect to Redis", {
      error: getErrorMessage(error),
    });
    // Continue anyway - worker will handle reconnection
  }

  const notificationHandler = createNotificationHandler(slackApp.client);
  const stopWorker = await startSlackNotificationWorker(notificationHandler, {
    pollIntervalMs: SLACK_BOT_TIMEOUTS.QUEUE_POLL_INTERVAL_MS,
    maxConcurrent: SLACK_BOT_TIMEOUTS.QUEUE_MAX_CONCURRENT,
  });
  logger.info("Slack notification queue worker started");

  return stopWorker;
};

/**
 * Create graceful shutdown handler.
 *
 * @param server - Express server instance
 * @param stopNotificationWorker - Optional worker stop function
 * @returns Shutdown function
 */
const createShutdownHandler =
  (
    server: ReturnType<typeof express.application.listen>,
    stopNotificationWorker: (() => void) | null
  ): ((signal: string) => Promise<void>) =>
  async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down gracefully`);

    if (stopNotificationWorker) {
      logger.info("Stopping notification queue worker...");
      stopNotificationWorker();
    }

    server.close(async () => {
      await Promise.all([closeDatabase(), closeRedis()]);
      logger.info("Server closed");
      process.exit(0);
    });

    // Force exit after timeout
    setTimeout(() => {
      logger.warn("Forced shutdown after timeout");
      process.exit(1);
    }, SLACK_BOT_TIMEOUTS.SHUTDOWN_TIMEOUT_MS);
  };

/**
 * Initializes and starts the Slack bot service.
 * Uses Socket Mode for Slack events (WebSocket connection, no public URL needed).
 */
const startService = async (): Promise<void> => {
  try {
    const appConfig = loadAppConfig();

    // Initialize database for multi-tenant support
    initializeDatabase();

    // Initialize Slack app with Socket Mode
    const slackApp = createSlackApp(appConfig);
    setupSlackHandlers(slackApp);

    // Initialize Express app for HTTP endpoints (CI failure processing)
    const expressApp = express();

    // Trust first proxy (nginx/load balancer) for accurate client IP detection
    // Required for rate limiting to work correctly behind reverse proxies
    expressApp.set("trust proxy", 1);

    expressApp.use(express.json({ limit: EXPRESS_CONFIG.SLACK_BOT_JSON_LIMIT }));

    // Security headers -- applied early before any response is sent
    const { NODE_ENV } = config;
    expressApp.use(createSecurityHeaders(NODE_ENV === "production"));

    // Redis-backed rate limiter with security features for HTTP endpoints
    // Security features enabled:
    // - Bot detection (signal-based, not blocking - Slack sends events)
    // - Burst detection (moderate threshold for Slack events)
    const httpRateLimiter = createRateLimitMiddleware({
      rateLimit: {
        windowMs: SLACK_BOT_RATE_LIMITS.WINDOW_MS,
        max: SLACK_BOT_RATE_LIMITS.MAX_REQUESTS,
        message: SLACK_BOT_MESSAGES.RATE_LIMIT_EXCEEDED,
        keyPrefix: SLACK_BOT_RATE_LIMITS.KEY_PREFIX,
      },
      skip: (req) => shouldSkipSlackBotRateLimit(req.path),
      botDetection: {
        blockMalicious: false, // Signal-based, not blocking
        botRateMultiplier: 1, // Don't penalize Slack events
      },
      burstDetection: {
        maxBurst: 20, // Moderate threshold for Slack event bursts
        rateMultiplier: 0.75, // Mild penalty (75% of normal rate)
        blockOnBurst: false, // Don't block legitimate event bursts
      },
      distributedFallback: "fail", // Fail-safe when Redis unavailable
    });
    expressApp.use(httpRateLimiter.middleware());

    // Per-tenant Prometheus metrics
    expressApp.use(metricsMiddleware);

    // Add OAuth routes for multi-tenant Slack installation
    expressApp.use(oauthRoutes);

    // Add message/broadcast routes with health checks
    expressApp.use(createHttpRoutes(slackApp, appConfig));

    // Start Slack app in Socket Mode (connects via WebSocket)
    await slackApp.start();
    logger.info("Slack bot started in Socket Mode", {
      mode: "socket",
      environment: appConfig.nodeEnv,
      multiTenantMode: config.MULTI_TENANT_MODE || false,
    });

    // Start notification queue worker
    const stopNotificationWorker = await startQueueWorker(slackApp);

    // Start Express server for CI failure processing endpoints
    const server = expressApp.listen(appConfig.httpPort, () => {
      logger.info("HTTP server started for CI failure processing", {
        port: appConfig.httpPort,
        environment: appConfig.nodeEnv,
        oauthEnabled: !!(config.SLACK_CLIENT_ID && config.SLACK_CLIENT_SECRET),
        queueWorkerEnabled: !!config.REDIS_URL,
      });
    });

    // Configure server timeouts for slowloris attack protection
    server.keepAliveTimeout = SERVER_TIMEOUTS.KEEP_ALIVE_MS;
    server.headersTimeout = SERVER_TIMEOUTS.HEADERS_MS;

    // Handle graceful shutdown
    const shutdown = createShutdownHandler(server, stopNotificationWorker);
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    logger.error("Failed to start Slack bot", {
      error: getErrorMessage(error),
    });
    process.exit(1);
  }
};

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
    reason: getErrorMessage(reason),
  });
});

// Start the service
startService().catch((error) => {
  logger.error("Fatal error starting Slack bot service", {
    error: getErrorMessage(error),
  });
  process.exit(1);
});
