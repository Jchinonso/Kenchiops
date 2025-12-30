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
  waitForRedisConnection,
  config,
  EXPRESS_CONFIG,
  startActionQueueWorker,
  createRedisRateLimiter,
  startAggregatorWorker,
  startAnalysisQueueProcessor,
  DEFAULT_AGGREGATION_CONFIG,
  QUEUE_WORKER_DEFAULTS,
  AGGREGATION_DEFAULTS,
  REDIS_CONNECTION_DEFAULTS,
  GITHUB_APP_RATE_LIMITS,
  GITHUB_APP_MESSAGES,
  GITHUB_APP_TIMEOUTS,
  GITHUB_APP_DB_CONFIG,
  shouldSkipGitHubAppRateLimit,
} from "@kenchi/shared";
import { registerRoutes } from "./routes/index.js";
import { appConfig } from "./config/appConfig.js";
import { postConsolidatedAnalysis } from "./services/aggregation/consolidatedPoster.js";

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
  windowMs: GITHUB_APP_RATE_LIMITS.WINDOW_MS,
  max: GITHUB_APP_RATE_LIMITS.MAX_REQUESTS,
  message: GITHUB_APP_MESSAGES.RATE_LIMIT_EXCEEDED,
  keyPrefix: GITHUB_APP_RATE_LIMITS.KEY_PREFIX,
  skip: (req) => shouldSkipGitHubAppRateLimit(req.path),
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
      maxConnections: GITHUB_APP_DB_CONFIG.MAX_CONNECTIONS,
      idleTimeoutMs: GITHUB_APP_DB_CONFIG.IDLE_TIMEOUT_MS,
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
 * Stop function for aggregator worker
 */
let stopAggregatorWorker: (() => void) | null = null;

/**
 * Stop function for analysis queue processor
 */
let stopAnalysisProcessor: (() => void) | null = null;

/**
 * Initialize Redis-based failure aggregator for consolidated CI failure analysis
 */
const initializeFailureAggregator = (): void => {
  // Only start if Redis is configured
  if (!config.REDIS_URL) {
    logger.warn("Redis not configured, skipping failure aggregator");
    return;
  }

  // Configure aggregation timing (can be overridden via env)
  const debounceMs = parseInt(
    process.env.AGGREGATION_DEBOUNCE_MS || String(AGGREGATION_DEFAULTS.DEBOUNCE_MS),
    10
  );
  const maxWaitMs = parseInt(
    process.env.AGGREGATION_MAX_WAIT_MS || String(AGGREGATION_DEFAULTS.MAX_WAIT_MS),
    10
  );
  const { maxFailuresPerCommit } = DEFAULT_AGGREGATION_CONFIG;

  const aggregationConfig = {
    debounceMs,
    maxWaitMs,
    maxFailuresPerCommit,
  };

  // Start the aggregator worker (checks for ready aggregations and enqueues them)
  stopAggregatorWorker = startAggregatorWorker(
    aggregationConfig,
    QUEUE_WORKER_DEFAULTS.AGGREGATOR_POLL_INTERVAL_MS
  );

  // Start the analysis queue processor (processes enqueued aggregations)
  stopAnalysisProcessor = startAnalysisQueueProcessor(postConsolidatedAnalysis, {
    pollIntervalMs: QUEUE_WORKER_DEFAULTS.POLL_INTERVAL_MS,
    maxConcurrent: QUEUE_WORKER_DEFAULTS.SLACK_MAX_CONCURRENT,
  });

  logger.info("Redis failure aggregator initialized", {
    debounceMs,
    maxWaitMs,
    maxFailuresPerCommit,
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
      pollIntervalMs: QUEUE_WORKER_DEFAULTS.POLL_INTERVAL_MS,
      maxConcurrent: QUEUE_WORKER_DEFAULTS.SLACK_MAX_CONCURRENT,
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

      // Stop aggregator workers (Redis state persists, will be processed on restart)
      if (stopAggregatorWorker) {
        logger.info("Stopping aggregator worker...");
        stopAggregatorWorker();
      }
      if (stopAnalysisProcessor) {
        logger.info("Stopping analysis processor...");
        stopAnalysisProcessor();
      }

      // Close database and Redis connections
      await Promise.all([closeDatabase(), closeRedis()]);
      logger.info("Server closed");
      process.exit(0);
    });

    // Force exit after configured timeout
    setTimeout(() => {
      logger.warn("Forced shutdown after timeout");
      process.exit(1);
    }, GITHUB_APP_TIMEOUTS.SHUTDOWN_TIMEOUT_MS);
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

  // Wait for Redis to be connected before starting queue workers
  if (config.REDIS_URL) {
    try {
      await waitForRedisConnection(REDIS_CONNECTION_DEFAULTS.CONNECT_TIMEOUT_MS);
      logger.info("Redis connection ready");
    } catch (error) {
      logger.error("Failed to connect to Redis", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      // Continue anyway - workers will handle reconnection
    }
  }

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
