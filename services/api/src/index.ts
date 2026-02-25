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
import cookieParser from "cookie-parser";
import cors from "cors";
import {
  config,
  createLogger,
  errorHandler,
  requestLogger,
  requestContextMiddleware,
  authMiddleware,
  createRateLimitMiddleware,
  createSecurityHeaders,
  setupGracefulShutdown,
  registerCleanupHandler,
  metricsMiddleware,
  getMetrics,
  getMetricsContentType,
  rateLimitByPlan,
  initDatabase,
  initGitHubIssuesConnector,
  cleanupExpired,
  runDriftDetectionWithAlerts,
  triggerReembedding,
  syncDueSources,
  getErrorMessage,
  getActiveTenants,
  enforceRetentionForTenant,
  expireTrials,
  setTenantStatusFlag,
  checkUsageThresholds,
  getSubscriptionWithPlan,
  getTenantUsage,
  USAGE_ALERT_SCHEDULER,
  ValidationError,
  EXPRESS_CONFIG,
  RATE_LIMIT_CONSTANTS,
  RAG_JOB_INTERVALS,
  API_MESSAGES,
  API_REDIS_PREFIXES,
  shouldSkipRateLimit,
  SERVER_TIMEOUTS,
  SERVICE_NAMES,
} from "@kenchi/shared";
import { tenantStatusMiddleware } from "./middleware/tenantStatusMiddleware.js";
import { startScheduler, stopScheduler } from "./services/finetuning/index.js";
import { registerRoutes } from "./routes/index.js";
import { SSE_STREAM_PATH } from "./routes/sseRoutes.js";
import { setupSwagger } from "./swagger/index.js";
import { appConfig } from "./config/appConfig.js";
import { startAnalysisWorker, type AnalysisWorkerControl } from "./workers/analysisWorker.js";

// Augment Express Request with rawBody for HMAC signature verification
declare module "express-serve-static-core" {
  interface Request {
    rawBody?: Buffer;
  }
}

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

// let: module-level lifecycle state — assigned during init, cleared during shutdown
let retentionIntervalId: NodeJS.Timeout | null = null;

/** Retention enforcement runs every 24 hours */
const RETENTION_INTERVAL_MS = 86_400_000;

/**
 * Run retention enforcement across all active tenants.
 * Deletes data older than each tenant's configured TTLs.
 */
const runRetentionTask = async (): Promise<void> => {
  try {
    logger.info("Running scheduled retention enforcement");
    const tenants = await getActiveTenants();

    const results = await Promise.all(
      tenants.map(async (tenant) => {
        try {
          return await enforceRetentionForTenant(tenant.id);
        } catch (error) {
          logger.warn("Retention enforcement failed for tenant", {
            tenantId: tenant.id,
            error: getErrorMessage(error),
          });
          return null;
        }
      })
    );

    const successful = results.filter((result) => result !== null);
    logger.info("Scheduled retention enforcement complete", {
      tenantsProcessed: successful.length,
      tenantsTotal: tenants.length,
    });
  } catch (error) {
    logger.error("Scheduled retention enforcement failed", {
      error: getErrorMessage(error),
    });
  }
};

/**
 * Start the periodic retention enforcement scheduler.
 * Runs every 24 hours to enforce data retention policies.
 */
const startRetentionScheduler = (): void => {
  void runRetentionTask();
  retentionIntervalId = setInterval(() => {
    void runRetentionTask();
  }, RETENTION_INTERVAL_MS);
  logger.info("Retention enforcement scheduler started", {
    intervalMs: RETENTION_INTERVAL_MS,
  });
};

/**
 * Stop the retention enforcement scheduler.
 */
const stopRetentionScheduler = (): void => {
  if (retentionIntervalId) {
    clearInterval(retentionIntervalId);
    retentionIntervalId = null;
    logger.info("Retention enforcement scheduler stopped");
  }
};

// let: module-level lifecycle state — assigned during init, cleared during shutdown
let trialExpirationIntervalId: NodeJS.Timeout | null = null;

/** Trial expiration check runs every 24 hours */
const TRIAL_EXPIRATION_INTERVAL_MS = 86_400_000;

/**
 * Expire trials whose trial_ends_at has passed.
 * Sets subscription status to 'past_due' and blocks tenant access via Redis.
 */
const runTrialExpirationTask = async (): Promise<void> => {
  try {
    logger.info("Running scheduled trial expiration check");
    const expiredTenantIds = await expireTrials();

    // Set Redis status flags to block immediate access for expired tenants
    await Promise.all(
      expiredTenantIds.map((tenantId) => setTenantStatusFlag(tenantId, "suspended"))
    );

    logger.info("Scheduled trial expiration check complete", {
      expiredCount: expiredTenantIds.length,
    });
  } catch (error) {
    logger.error("Scheduled trial expiration check failed", {
      error: getErrorMessage(error),
    });
  }
};

/**
 * Start the periodic trial expiration scheduler.
 * Runs every 24 hours to expire trials that have ended.
 */
const startTrialExpirationScheduler = (): void => {
  void runTrialExpirationTask();
  trialExpirationIntervalId = setInterval(() => {
    void runTrialExpirationTask();
  }, TRIAL_EXPIRATION_INTERVAL_MS);
  logger.info("Trial expiration scheduler started", {
    intervalMs: TRIAL_EXPIRATION_INTERVAL_MS,
  });
};

/**
 * Stop the trial expiration scheduler.
 */
const stopTrialExpirationScheduler = (): void => {
  if (trialExpirationIntervalId) {
    clearInterval(trialExpirationIntervalId);
    trialExpirationIntervalId = null;
    logger.info("Trial expiration scheduler stopped");
  }
};

// let: module-level lifecycle state — assigned during init, cleared during shutdown
let usageAlertIntervalId: NodeJS.Timeout | null = null;

/**
 * Check usage thresholds across all active tenants.
 * Compares each tenant's current usage against their plan limits
 * and logs warnings for tenants approaching or exceeding limits.
 */
const runUsageAlertTask = async (): Promise<void> => {
  try {
    logger.info("Running scheduled usage threshold check");
    const tenants = await getActiveTenants();

    // let: accumulator for total alert count across all tenants
    let totalAlerts = 0;

    await Promise.all(
      tenants.map(async (tenant) => {
        try {
          const subscriptionWithPlan = await getSubscriptionWithPlan(tenant.id);
          if (!subscriptionWithPlan) {
            return;
          }

          const usage = await getTenantUsage(tenant.id);
          const result = checkUsageThresholds(tenant.id, usage, subscriptionWithPlan.plan.limits);

          totalAlerts += result.alerts.length;
        } catch (error) {
          logger.warn("Usage threshold check failed for tenant", {
            tenantId: tenant.id,
            error: getErrorMessage(error),
          });
        }
      })
    );

    logger.info("Scheduled usage threshold check complete", {
      tenantsChecked: tenants.length,
      totalAlerts,
    });
  } catch (error) {
    logger.error("Scheduled usage threshold check failed", {
      error: getErrorMessage(error),
    });
  }
};

/**
 * Start the periodic usage threshold alert scheduler.
 * Runs every 15 minutes to check tenant usage against plan limits.
 */
const startUsageAlertScheduler = (): void => {
  void runUsageAlertTask();
  usageAlertIntervalId = setInterval(() => {
    void runUsageAlertTask();
  }, USAGE_ALERT_SCHEDULER.CHECK_INTERVAL_MS);
  logger.info("Usage alert scheduler started", {
    intervalMs: USAGE_ALERT_SCHEDULER.CHECK_INTERVAL_MS,
  });
};

/**
 * Stop the usage alert scheduler.
 */
const stopUsageAlertScheduler = (): void => {
  if (usageAlertIntervalId) {
    clearInterval(usageAlertIntervalId);
    usageAlertIntervalId = null;
    logger.info("Usage alert scheduler stopped");
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
  skip: (req) => {
    const { path } = req;
    return shouldSkipRateLimit(path) || path === SSE_STREAM_PATH;
  },
  botDetection: {
    blockMalicious: false, // Signal-based, not blocking
    botRateMultiplier: 0.5, // Bots get half the rate limit
  },
  burstDetection: {
    maxBurst: 10,
    rateMultiplier: 0.5, // Burst users get rate limit halved
    blockOnBurst: false, // Penalty-based, not blocking
  },
  tenantRateLimit: {
    enabled: true,
    max: 500, // 500 requests per minute per tenant (5x per-IP limit)
    windowMs: RATE_LIMIT_CONSTANTS.DEFAULT_WINDOW_MS,
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

  // Security headers — applied early before any response is sent
  const { NODE_ENV } = config;
  app.use(createSecurityHeaders(NODE_ENV === "production"));

  // CORS — required for cross-origin cookie-based auth (frontend dev server on different port)
  app.use(
    cors({
      origin: config.FRONTEND_URL,
      credentials: true,
    })
  );

  // Parse cookies for auth token extraction
  app.use(cookieParser());

  // Swagger UI — mounted before auth so docs are publicly accessible
  setupSwagger(app);

  // Middleware - use configured limit for large CI context payloads
  // Capture raw body ONLY when internal HMAC auth headers are present,
  // to avoid retaining a duplicate buffer in memory for regular browser requests.
  // Object.assign is required because Express verify callbacks must mutate req by design
  // (this is a framework-boundary side effect, allowed per CLAUDE.md rule 3).
  app.use(
    express.json({
      limit: EXPRESS_CONFIG.JSON_BODY_LIMIT,
      verify: (req: express.Request, _res, buf) => {
        // Only capture rawBody when signature verification headers are present
        // to avoid doubling memory usage on every request
        if (req.headers["x-kenchi-signature"] || req.headers["stripe-signature"]) {
          Object.assign(req, { rawBody: buf });
        }
      },
    })
  );
  app.use(requestLogger);
  app.use(apiRateLimiter.middleware());
  app.use(requestContextMiddleware);
  app.use(authMiddleware);
  app.use(tenantStatusMiddleware);

  // Per-tenant plan-based rate limiting (after auth so tenantId/planId is available)
  app.use(rateLimitByPlan());

  // Per-tenant Prometheus metrics (after auth so tenantId is available)
  app.use(metricsMiddleware);

  // Prometheus metrics endpoint (no auth required — internal/monitoring use)
  app.get("/metrics", (_req, res) => {
    res.set("Content-Type", getMetricsContentType());
    res.end(getMetrics());
  });

  // Register all routes
  registerRoutes(app);

  // Error handling middleware (must be last)
  app.use(errorHandler);

  return app;
};

/** Database connection pool size for API service */
const API_DB_MAX_CONNECTIONS = 10;

/** Minimum acceptable length for JWT_SECRET (256 bits of entropy). */
const JWT_SECRET_MIN_LENGTH = 32;

/**
 * Validate that auth-critical configuration is present at startup.
 * Fails fast instead of waiting for the first JWT operation to discover
 * a missing or weak JWT_SECRET.
 */
const validateAuthConfig = (): void => {
  const jwtSecret = config.JWT_SECRET;
  if (!jwtSecret || jwtSecret.trim().length < JWT_SECRET_MIN_LENGTH) {
    throw new ValidationError(
      `JWT_SECRET must be at least ${String(JWT_SECRET_MIN_LENGTH)} characters`,
      { operation: "validateAuthConfig" }
    );
  }
};

/**
 * Start the API service
 */
const startServer = async (): Promise<void> => {
  // Fail fast on missing auth configuration
  validateAuthConfig();

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

  // Start retention enforcement scheduler and register for graceful shutdown
  startRetentionScheduler();
  registerCleanupHandler(stopRetentionScheduler);

  // Start trial expiration scheduler and register for graceful shutdown
  startTrialExpirationScheduler();
  registerCleanupHandler(stopTrialExpirationScheduler);

  // Start usage alert scheduler and register for graceful shutdown
  startUsageAlertScheduler();
  registerCleanupHandler(stopUsageAlertScheduler);

  // Start fine-tuning job scheduler only when a real OpenAI key is configured.
  // OpenRouter keys (sk-or-*) are not valid for the OpenAI fine-tuning API.
  const apiKey = config.LLM_API_KEY ?? config.OPENAI_API_KEY ?? "";
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
