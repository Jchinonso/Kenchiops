/**
 * GitHub App Service Entry Point
 *
 * This service handles GitHub webhook events (PRs, CI checks, etc.)
 * and can post comments or update status based on AI analysis.
 *
 * SAFETY NOTE: The LLM (OpenAI) provides analysis and suggestions only.
 * All actual decisions and side-effects (like posting comments or updating status)
 * are handled by deterministic code after validation.
 */

import express from "express";
import {
  createLogger,
  errorHandler,
  requestLogger,
  initDatabase,
  closeDatabase,
  closeRedis,
  config,
  EXPRESS_CONFIG,
  startActionQueueWorker,
  createRedisRateLimiter,
} from "@kenchi/shared";
import { registerRoutes } from "./routes/index.js";
import { appConfig } from "./config/appConfig.js";
import {
  initializeAggregator,
  destroyAggregator,
  postConsolidatedAnalysis,
} from "./services/aggregation/index.js";

const logger = createLogger("github-app");

/**
 * Extend Express Request to include raw body for webhook verification
 */
declare module "express-serve-static-core" {
  interface Request {
    rawBody?: Buffer;
  }
}

/**
 * Redis-backed rate limiter for GitHub webhooks.
 * Higher limit since webhooks can come in bursts during CI activity.
 * Skips health check endpoints for monitoring.
 */
const githubRateLimiter = createRedisRateLimiter({
  windowMs: 60000, // 1 minute
  max: 500, // High limit for webhook bursts
  message: "Too many requests to GitHub app service",
  keyPrefix: "rl:github-app:",
  skip: (req) => req.path === "/health" || req.path === "/github/health",
});

/**
 * Create and configure Express application
 */
const createApp = (): express.Express => {
  const app = express();

  // Capture raw body for webhook signature verification
  // This must come before express.json() so we have the original payload
  // Use configured limit for large CI context payloads
  app.use(
    express.json({
      limit: EXPRESS_CONFIG.JSON_BODY_LIMIT,
      verify: (req: express.Request, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );
  app.use(requestLogger);
  app.use(githubRateLimiter.middleware());

  // Register all routes
  registerRoutes(app);

  // Error handling middleware (must be last)
  app.use(errorHandler);

  return app;
};

/**
 * Initialize database connection
 */
const initializeDatabase = (): void => {
  try {
    initDatabase({
      connectionString: config.DATABASE_URL,
      maxConnections: 10,
      idleTimeoutMs: 30000,
    });
    logger.info("Database connection initialized");
  } catch (error) {
    logger.error("Failed to initialize database", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
};

/**
 * Initialize failure aggregator for consolidated CI failure analysis
 */
const initializeFailureAggregator = (): void => {
  // Configure aggregation timing (can be overridden via env)
  const debounceMs = parseInt(process.env.AGGREGATION_DEBOUNCE_MS || "30000", 10);
  const maxWaitMs = parseInt(process.env.AGGREGATION_MAX_WAIT_MS || "120000", 10);

  initializeAggregator(postConsolidatedAnalysis, {
    debounceMs,
    maxWaitMs,
  });

  logger.info("Failure aggregator initialized", {
    debounceMs,
    maxWaitMs,
  });
};

/**
 * Stop function for action queue worker
 */
let stopActionQueueWorker: (() => void) | null = null;

/**
 * Initialize action queue worker for async action processing
 */
const initializeActionQueueWorker = async (): Promise<void> => {
  // Only start if Redis is configured
  if (!config.REDIS_URL) {
    logger.warn("Redis not configured, skipping action queue worker");
    return;
  }

  try {
    stopActionQueueWorker = await startActionQueueWorker({
      pollIntervalMs: 1000,
      maxConcurrent: 3,
    });
    logger.info("Action queue worker initialized");
  } catch (error) {
    logger.error("Failed to initialize action queue worker", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Handle graceful shutdown
 */
const setupGracefulShutdown = (server: ReturnType<typeof express.application.listen>): void => {
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down gracefully`);

    server.close(async () => {
      // Stop action queue worker
      if (stopActionQueueWorker) {
        logger.info("Stopping action queue worker...");
        stopActionQueueWorker();
      }

      // Flush and destroy the aggregator (posts any pending analyses)
      logger.info("Flushing failure aggregator...");
      await destroyAggregator();

      // Close database and Redis connections
      await Promise.all([closeDatabase(), closeRedis()]);
      logger.info("Server closed");
      process.exit(0);
    });

    // Force exit after 15 seconds (increased to allow aggregator flush)
    setTimeout(() => {
      logger.warn("Forced shutdown after timeout");
      process.exit(1);
    }, 15000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};

/**
 * Start the GitHub App service
 */
const startServer = async (): Promise<void> => {
  // Initialize database for multi-tenant support
  initializeDatabase();

  // Initialize failure aggregator for consolidated CI analysis
  initializeFailureAggregator();

  // Initialize action queue worker for async action processing
  await initializeActionQueueWorker();

  const app = createApp();

  const server = app.listen(appConfig.port, () => {
    logger.info("GitHub App service started", {
      port: appConfig.port,
      environment: appConfig.environment,
      redisEnabled: !!config.REDIS_URL,
    });
  });

  setupGracefulShutdown(server);
};

// Start the server
startServer().catch((error) => {
  logger.error("Failed to start server", {
    error: error instanceof Error ? error.message : "Unknown error",
  });
  process.exit(1);
});
