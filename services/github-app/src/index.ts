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
  SERVER_TIMEOUTS,
  startActionQueueWorker,
  createRateLimitMiddleware,
  startAggregatorWorker,
  startAnalysisQueueProcessor,
  getErrorMessage,
  DEFAULT_AGGREGATION_CONFIG,
  QUEUE_WORKER_DEFAULTS,
  AGGREGATION_DEFAULTS,
  REDIS_CONNECTION_DEFAULTS,
  GITHUB_APP_RATE_LIMITS,
  GITHUB_APP_MESSAGES,
  GITHUB_APP_TIMEOUTS,
  GITHUB_APP_DB_CONFIG,
  shouldSkipGitHubAppRateLimit,
  RAG_JOB_INTERVALS,
  // RAG streaming updates
  checkStaleness,
  cleanupExpired,
  // Drift detection
  runDriftDetectionWithAlerts,
  type WorkerControl,
  type ProcessorControl,
} from "@kenchi/shared";
import { registerRoutes } from "./routes/index.js";
import { appConfig } from "./config/appConfig.js";
import { postConsolidatedAnalysis } from "./services/aggregation/consolidatedPoster.js";
import { processCombinedAnalysis } from "./handlers/combinedAnalysis.js";

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
 * Redis-backed rate limiter with security features for GitHub webhooks.
 * Higher limit since webhooks can come in bursts during CI activity.
 * Skips health check endpoints for monitoring.
 *
 * Security features enabled:
 * - Bot detection (signal-based, not blocking - GitHub sends webhooks)
 * - Burst detection (higher threshold for webhook bursts)
 */
const githubRateLimiter = createRateLimitMiddleware({
  rateLimit: {
    windowMs: GITHUB_APP_RATE_LIMITS.WINDOW_MS,
    max: GITHUB_APP_RATE_LIMITS.MAX_REQUESTS,
    message: GITHUB_APP_MESSAGES.RATE_LIMIT_EXCEEDED,
    keyPrefix: GITHUB_APP_RATE_LIMITS.KEY_PREFIX,
  },
  skip: (req) => shouldSkipGitHubAppRateLimit(req.path),
  botDetection: {
    blockMalicious: false, // Signal-based, not blocking
    botRateMultiplier: 1, // Don't penalize webhooks from GitHub
  },
  burstDetection: {
    maxBurst: 50, // Higher threshold for webhook bursts
    rateMultiplier: 0.75, // Mild penalty (75% of normal rate)
    blockOnBurst: false, // Don't block legitimate webhook bursts
  },
  distributedFallback: "fail", // Fail-safe when Redis unavailable
});

/**
 * Create and configure Express application
 */
const createApp = (): express.Express => {
  const app = express();

  // Trust first proxy (nginx/load balancer) for accurate client IP detection
  // Required for rate limiting to work correctly behind reverse proxies
  app.set("trust proxy", 1);

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
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Control for aggregator worker
 */
let aggregatorWorkerControl: WorkerControl | null = null;

/**
 * Control for analysis queue processor
 */
let analysisProcessorControl: ProcessorControl | null = null;

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
  aggregatorWorkerControl = startAggregatorWorker({
    config: aggregationConfig,
    pollIntervalMs: QUEUE_WORKER_DEFAULTS.AGGREGATOR_POLL_INTERVAL_MS,
  });

  // Start the analysis queue processor (processes enqueued aggregations)
  // Handles both legacy flow (pre-analyzed) and new flow (pending checks for combined analysis)
  analysisProcessorControl = startAnalysisQueueProcessor(postConsolidatedAnalysis, {
    pollIntervalMs: QUEUE_WORKER_DEFAULTS.POLL_INTERVAL_MS,
    maxConcurrent: QUEUE_WORKER_DEFAULTS.SLACK_MAX_CONCURRENT,
    onPendingReady: processCombinedAnalysis,
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
 * Interval IDs for RAG background jobs
 */
let ragCleanupIntervalId: NodeJS.Timeout | null = null;
let driftDetectionIntervalId: NodeJS.Timeout | null = null;

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
      error: getErrorMessage(error),
    });
  }
};

/**
 * Initialize RAG background jobs for cleanup and drift detection
 */
const initializeRAGBackgroundJobs = (): void => {
  // RAG Cleanup Job - runs every 24 hours
  ragCleanupIntervalId = setInterval(async () => {
    try {
      // First check staleness
      const staleness = await checkStaleness();
      logger.info("RAG staleness check completed", {
        staleDiffChunks: staleness.staleDiffChunks,
        staleKnowledgeDocs: staleness.staleKnowledgeDocs,
        expiredDiffChunks: staleness.expiredDiffChunks,
        expiredKnowledgeDocs: staleness.expiredKnowledgeDocs,
      });

      // Then cleanup expired documents
      const cleanup = await cleanupExpired();
      logger.info("RAG cleanup completed", {
        diffChunksDeleted: cleanup.diffChunksDeleted,
        knowledgeDocsDeleted: cleanup.knowledgeDocsDeleted,
        diffChunksMarkedStale: cleanup.diffChunksMarkedStale,
        knowledgeDocsMarkedStale: cleanup.knowledgeDocsMarkedStale,
      });
    } catch (error) {
      logger.error("RAG cleanup job failed", {
        error: getErrorMessage(error),
      });
    }
  }, RAG_JOB_INTERVALS.CLEANUP_MS);

  // Drift Detection Job - runs every 24 hours
  driftDetectionIntervalId = setInterval(async () => {
    try {
      const result = await runDriftDetectionWithAlerts();
      logger.info("Drift detection completed", {
        overallHealth: result.report.overallHealth,
        alertsDispatched: result.alertsDispatched,
        dispatchErrors: result.dispatchErrors,
        metricsChecked: result.report.metrics.length,
      });
    } catch (error) {
      logger.error("Drift detection job failed", {
        error: getErrorMessage(error),
      });
    }
  }, RAG_JOB_INTERVALS.DRIFT_DETECTION_MS);

  logger.info("RAG background jobs initialized", {
    cleanupIntervalMs: RAG_JOB_INTERVALS.CLEANUP_MS,
    driftDetectionIntervalMs: RAG_JOB_INTERVALS.DRIFT_DETECTION_MS,
  });
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
      if (aggregatorWorkerControl) {
        logger.info("Stopping aggregator worker...");
        aggregatorWorkerControl.stop();
      }
      if (analysisProcessorControl) {
        logger.info("Stopping analysis processor...");
        analysisProcessorControl.stop();
      }

      // Stop RAG background jobs
      if (ragCleanupIntervalId) {
        logger.info("Stopping RAG cleanup job...");
        clearInterval(ragCleanupIntervalId);
      }
      if (driftDetectionIntervalId) {
        logger.info("Stopping drift detection job...");
        clearInterval(driftDetectionIntervalId);
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
        error: getErrorMessage(error),
      });
      // Continue anyway - workers will handle reconnection
    }
  }

  // Initialize failure aggregator for consolidated CI analysis
  initializeFailureAggregator();

  // Initialize action queue worker for async action processing
  await initializeActionQueueWorker();

  // Initialize RAG background jobs for cleanup and drift detection
  initializeRAGBackgroundJobs();

  const app = createApp();

  const server = app.listen(appConfig.port, () => {
    logger.info("GitHub App service started", {
      port: appConfig.port,
      environment: appConfig.environment,
      redisEnabled: !!config.REDIS_URL,
    });
  });

  // Configure server timeouts for slowloris attack protection
  server.keepAliveTimeout = SERVER_TIMEOUTS.KEEP_ALIVE_MS;
  server.headersTimeout = SERVER_TIMEOUTS.HEADERS_MS;

  setupGracefulShutdown(server);
};

// Start the server
startServer().catch((error) => {
  logger.error("Failed to start server", {
    error: getErrorMessage(error),
  });
  process.exit(1);
});
