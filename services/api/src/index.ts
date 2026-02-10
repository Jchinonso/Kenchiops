/**
 * API Service Entry Point
 *
 * This service handles incoming webhooks and events from various sources.
 * It can trigger workflows, store events, and coordinate with other services.
 *
 * SAFETY NOTE: The LLM (OpenAI) provides analysis and suggestions only.
 * All actual decisions and side-effects are handled by deterministic code after validation.
 */

import express from "express";
import {
  createLogger,
  errorHandler,
  requestLogger,
  createRateLimitMiddleware,
  setupGracefulShutdown,
  registerCleanupHandler,
  initDatabase,
  initGitHubIssuesConnector,
  cleanupExpired,
  runDriftDetectionWithAlerts,
  triggerReembedding,
  syncDueSources,
  getErrorMessage,
  EXPRESS_CONFIG,
  RATE_LIMIT_CONSTANTS,
  RAG_JOB_INTERVALS,
  API_MESSAGES,
  API_REDIS_PREFIXES,
  shouldSkipRateLimit,
  SERVER_TIMEOUTS,
  SERVICE_NAMES,
} from "@kenchi/shared";
import { startScheduler, stopScheduler } from "./services/finetuning/index.js";
import { registerRoutes } from "./routes/index.js";
import { appConfig } from "./config/appConfig.js";
import { startAnalysisWorker, type AnalysisWorkerControl } from "./workers/analysisWorker.js";

// let: module-level lifecycle state — assigned during init, read during shutdown
let analysisWorker: AnalysisWorkerControl | null = null;

const logger = createLogger(SERVICE_NAMES.API);

/** Default shutdown timeout in milliseconds */
const SHUTDOWN_TIMEOUT_MS = 30000;

// let: module-level lifecycle state — assigned during init, cleared during shutdown
let cleanupIntervalId: NodeJS.Timeout | null = null;

// let: module-level lifecycle state — assigned during init, cleared during shutdown
let driftIntervalId: NodeJS.Timeout | null = null;

// let: module-level lifecycle state — assigned during init, cleared during shutdown
let reembedIntervalId: NodeJS.Timeout | null = null;

// let: module-level lifecycle state — assigned during init, cleared during shutdown
let externalSyncIntervalId: NodeJS.Timeout | null = null;

/**
 * Run RAG cleanup task and log results.
 * This is called periodically to remove expired documents.
 */
const runCleanupTask = async (): Promise<void> => {
  try {
    logger.info("Running scheduled RAG cleanup");
    const result = await cleanupExpired();
    logger.info("Scheduled RAG cleanup complete", {
      diffChunksDeleted: result.diffChunksDeleted,
      knowledgeDocsDeleted: result.knowledgeDocsDeleted,
    });
  } catch (error) {
    logger.error("Scheduled RAG cleanup failed", { error: getErrorMessage(error) });
  }
};

/**
 * Start the periodic cleanup scheduler.
 * Runs every 24 hours to remove expired RAG documents.
 */
const startCleanupScheduler = (): void => {
  // Run immediately on startup, then every 24 hours
  void runCleanupTask();
  cleanupIntervalId = setInterval(() => {
    void runCleanupTask();
  }, RAG_JOB_INTERVALS.CLEANUP_MS);
  logger.info("RAG cleanup scheduler started", {
    intervalMs: RAG_JOB_INTERVALS.CLEANUP_MS,
  });
};

/**
 * Stop the cleanup scheduler.
 */
const stopCleanupScheduler = (): void => {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
    logger.info("RAG cleanup scheduler stopped");
  }
};

/**
 * Run drift detection task and log results.
 * This is called periodically to monitor RAG quality.
 */
const runDriftTask = async (): Promise<void> => {
  try {
    logger.info("Running scheduled RAG drift detection");
    const result = await runDriftDetectionWithAlerts(undefined, {
      skipAlertDispatch: false,
    });
    logger.info("Scheduled RAG drift detection complete", {
      overallHealth: result.report.overallHealth,
      alertsDispatched: result.alertsDispatched,
      dispatchErrors: result.dispatchErrors,
    });
  } catch (error) {
    logger.error("Scheduled RAG drift detection failed", { error: getErrorMessage(error) });
  }
};

/**
 * Start the periodic drift detection scheduler.
 * Runs every 24 hours to monitor RAG quality.
 */
const startDriftScheduler = (): void => {
  // Run immediately on startup, then every 24 hours
  void runDriftTask();
  driftIntervalId = setInterval(() => {
    void runDriftTask();
  }, RAG_JOB_INTERVALS.DRIFT_DETECTION_MS);
  logger.info("RAG drift detection scheduler started", {
    intervalMs: RAG_JOB_INTERVALS.DRIFT_DETECTION_MS,
  });
};

/**
 * Stop the drift detection scheduler.
 */
const stopDriftScheduler = (): void => {
  if (driftIntervalId) {
    clearInterval(driftIntervalId);
    driftIntervalId = null;
    logger.info("RAG drift detection scheduler stopped");
  }
};

/**
 * Run re-embedding task and log results.
 * This is called periodically to update outdated embeddings.
 */
const runReembedTask = async (): Promise<void> => {
  try {
    logger.info("Running scheduled re-embedding check");
    const result = await triggerReembedding({
      batchSize: 100,
    });
    logger.info("Scheduled re-embedding complete", {
      processedCount: result.processedCount,
      success: result.success,
      errorCount: result.errors.length,
    });
  } catch (error) {
    logger.error("Scheduled re-embedding failed", { error: getErrorMessage(error) });
  }
};

/**
 * Start the periodic re-embedding scheduler.
 * Runs every 6 hours to check for outdated embeddings.
 */
const startReembedScheduler = (): void => {
  // Run immediately on startup, then every 6 hours
  void runReembedTask();
  reembedIntervalId = setInterval(() => {
    void runReembedTask();
  }, RAG_JOB_INTERVALS.REEMBED_CHECK_MS);
  logger.info("RAG re-embedding scheduler started", {
    intervalMs: RAG_JOB_INTERVALS.REEMBED_CHECK_MS,
  });
};

/**
 * Stop the re-embedding scheduler.
 */
const stopReembedScheduler = (): void => {
  if (reembedIntervalId) {
    clearInterval(reembedIntervalId);
    reembedIntervalId = null;
    logger.info("RAG re-embedding scheduler stopped");
  }
};

/**
 * Run external source sync task and log results.
 * This is called periodically to sync due external sources.
 */
const runExternalSyncTask = async (): Promise<void> => {
  try {
    logger.info("Running scheduled external source sync");
    const result = await syncDueSources();
    logger.info("Scheduled external source sync complete", {
      sourcesProcessed: result.sourcesProcessed,
      totalDocsIngested: result.totalDocsIngested,
      totalErrors: result.totalErrors,
    });
  } catch (error) {
    logger.error("Scheduled external source sync failed", { error: getErrorMessage(error) });
  }
};

/**
 * Start the periodic external source sync scheduler.
 * Runs every 6 hours to sync due external sources.
 */
const startExternalSyncScheduler = (): void => {
  // Run immediately on startup, then every 6 hours
  void runExternalSyncTask();
  externalSyncIntervalId = setInterval(() => {
    void runExternalSyncTask();
  }, RAG_JOB_INTERVALS.EXTERNAL_SYNC_MS);
  logger.info("External source sync scheduler started", {
    intervalMs: RAG_JOB_INTERVALS.EXTERNAL_SYNC_MS,
  });
};

/**
 * Stop the external sync scheduler.
 */
const stopExternalSyncScheduler = (): void => {
  if (externalSyncIntervalId) {
    clearInterval(externalSyncIntervalId);
    externalSyncIntervalId = null;
    logger.info("External source sync scheduler stopped");
  }
};

/**
 * Redis-backed rate limiter with security features: 100 requests per minute per IP.
 * Falls back to in-memory if Redis is unavailable.
 * Skips health check endpoints for monitoring.
 *
 * Security features enabled:
 * - Bot detection (signal-based, not blocking by default)
 * - Burst detection (penalty-based, not blocking by default)
 */
const apiRateLimiter = createRateLimitMiddleware({
  rateLimit: {
    windowMs: RATE_LIMIT_CONSTANTS.DEFAULT_WINDOW_MS,
    max: RATE_LIMIT_CONSTANTS.DEFAULT_MAX_REQUESTS,
    message: API_MESSAGES.RATE_LIMIT_EXCEEDED,
    keyPrefix: API_REDIS_PREFIXES.RATE_LIMIT,
  },
  skip: (req) => shouldSkipRateLimit(req.path),
  botDetection: {
    blockMalicious: false, // Signal-based, not blocking
    botRateMultiplier: 0.5, // Bots get half the rate limit
  },
  burstDetection: {
    maxBurst: 10,
    rateMultiplier: 0.5, // Burst users get rate limit halved
    blockOnBurst: false, // Penalty-based, not blocking
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

  // Middleware - use configured limit for large CI context payloads
  app.use(express.json({ limit: EXPRESS_CONFIG.JSON_BODY_LIMIT }));
  app.use(requestLogger);
  app.use(apiRateLimiter.middleware());

  // Register all routes
  registerRoutes(app);

  // Error handling middleware (must be last)
  app.use(errorHandler);

  return app;
};

/** Database connection pool size for API service */
const API_DB_MAX_CONNECTIONS = 10;

/**
 * Start the API service
 */
const startServer = async (): Promise<void> => {
  // Initialize database for RAG operations
  initDatabase({
    connectionString: appConfig.databaseUrl,
    maxConnections: API_DB_MAX_CONNECTIONS,
  });
  logger.info("Database initialized for RAG operations");

  // Initialize external knowledge connectors
  initGitHubIssuesConnector();
  logger.info("External knowledge connectors initialized");

  const app = createApp();

  const server = app.listen(appConfig.port, () => {
    logger.info("API service started", {
      port: appConfig.port,
      environment: appConfig.environment,
    });
  });

  // Configure server timeouts for slowloris attack protection
  server.keepAliveTimeout = SERVER_TIMEOUTS.KEEP_ALIVE_MS;
  server.headersTimeout = SERVER_TIMEOUTS.HEADERS_MS;

  // Start cleanup scheduler and register for graceful shutdown
  startCleanupScheduler();
  registerCleanupHandler(stopCleanupScheduler);

  // Start drift detection scheduler and register for graceful shutdown
  startDriftScheduler();
  registerCleanupHandler(stopDriftScheduler);

  // Start re-embedding scheduler and register for graceful shutdown
  startReembedScheduler();
  registerCleanupHandler(stopReembedScheduler);

  // Start external source sync scheduler and register for graceful shutdown
  startExternalSyncScheduler();
  registerCleanupHandler(stopExternalSyncScheduler);

  // Start fine-tuning job scheduler only when a real OpenAI key is configured.
  // OpenRouter keys (sk-or-*) are not valid for the OpenAI fine-tuning API.
  const apiKey = process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
  if (apiKey.startsWith("sk-or-")) {
    logger.warn(
      "Fine-tuning scheduler disabled: OpenRouter key cannot be used for OpenAI fine-tuning API"
    );
  } else {
    startScheduler();
    registerCleanupHandler(stopScheduler);
    logger.info("Fine-tuning job scheduler started");
  }

  // Start analysis worker and register for graceful shutdown
  analysisWorker = startAnalysisWorker();
  registerCleanupHandler(() => {
    if (analysisWorker) {
      analysisWorker.stop();
    }
  });

  // Set up graceful shutdown
  setupGracefulShutdown(server, {
    serviceName: appConfig.serviceName,
    timeoutMs: SHUTDOWN_TIMEOUT_MS,
    closeDatabase: true,
    closeRedis: true,
  });
};

// Start the server
(async (): Promise<void> => {
  try {
    await startServer();
  } catch (error) {
    logger.error("Failed to start API service", { error });
    process.exit(1);
  }
})();
