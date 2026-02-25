/**
 * Incident Triage Service Entry Point
 *
 * This service handles incoming alerts from monitoring sources (PagerDuty, Datadog, etc.),
 * normalizes them, and runs a triage pipeline for severity assessment and routing.
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
  rateLimitByPlan,
  initDatabase,
  EXPRESS_CONFIG,
  RATE_LIMIT_CONSTANTS,
  SERVER_TIMEOUTS,
  SERVICE_NAMES,
  shouldSkipRateLimit,
} from "@kenchi/shared";
import { registerRoutes } from "./routes/index.js";
import { appConfig } from "./config/appConfig.js";
import { createTriageContainer } from "./container.js";
import { startTriageWorker } from "./workers/triageWorker.js";
import { startInvestigationWorker } from "./workers/investigationWorker.js";
import { startDedupCleanup } from "./jobs/dedupCleanup.js";

// Augment Express Request with rawBody for HMAC signature verification
// and RequestContext for tracing (CLAUDE.md Hard Rule #8)
declare module "express-serve-static-core" {
  interface Request {
    rawBody?: Buffer;
    context: import("@kenchi/shared").RequestContext;
  }
}

const logger = createLogger(SERVICE_NAMES.INCIDENT_TRIAGE);

/** Default shutdown timeout in milliseconds */
const SHUTDOWN_TIMEOUT_MS = 30000;

/** Database connection pool size for incident triage service */
const TRIAGE_DB_MAX_CONNECTIONS = 10;

/** Rate limit message for this service */
const RATE_LIMIT_MESSAGE = "Too many requests to incident triage service, please try again later";

/** Redis key prefix for rate limiting */
const RATE_LIMIT_PREFIX = "incident-triage:rl";

/**
 * Redis-backed rate limiter: 100 requests per minute per IP.
 * Falls back to in-memory if Redis is unavailable.
 * Skips health check endpoints for monitoring.
 */
const triageRateLimiter = createRateLimitMiddleware({
  rateLimit: {
    windowMs: RATE_LIMIT_CONSTANTS.DEFAULT_WINDOW_MS,
    max: RATE_LIMIT_CONSTANTS.DEFAULT_MAX_REQUESTS,
    message: RATE_LIMIT_MESSAGE,
    keyPrefix: RATE_LIMIT_PREFIX,
  },
  skip: (req) => shouldSkipRateLimit(req.path),
  distributedFallback: "fail",
});

/**
 * Create and configure Express application
 */
const createApp = (
  container: import("./types/containerTypes.js").TriageContainer
): express.Express => {
  const app = express();

  // Trust first proxy (nginx/load balancer) for accurate client IP detection
  app.set("trust proxy", 1);

  // Security headers — applied early before any response is sent
  const { NODE_ENV } = config;
  app.use(createSecurityHeaders(NODE_ENV === "production"));

  // CORS — restrict origin to configured frontend URL (VULN-001)
  app.use(cors({ origin: config.FRONTEND_URL, credentials: true }));

  // Parse cookies
  app.use(cookieParser());

  // JSON body parser with raw body capture for HMAC/JWS verification.
  // Capture rawBody for all webhook paths so signature verification middleware
  // can access the original payload. Path-based detection covers all providers
  // (PagerDuty, Vercel, Netlify, Datadog, Grafana, Prometheus) without
  // needing to enumerate signature headers.
  // Object.assign is required because Express verify callbacks must mutate req by design
  // (this is a framework-boundary side effect, allowed per CLAUDE.md rule 3).
  app.use(
    express.json({
      limit: EXPRESS_CONFIG.JSON_BODY_LIMIT,
      verify: (req: express.Request, _res, buf) => {
        const isWebhookPath = req.originalUrl?.startsWith("/webhooks/") ?? false;
        if (isWebhookPath) {
          Object.assign(req, { rawBody: buf });
        }
      },
    })
  );
  app.use(requestLogger);

  // RequestContext + JWT/HMAC auth (VULN-002/012)
  // requestContextMiddleware creates req.context with requestId + anonymous tenantId.
  // authMiddleware enriches it with the authenticated user's tenantId from JWT.
  // Webhook paths are excluded from auth via PUBLIC_ROUTES in @kenchi/shared.
  app.use(requestContextMiddleware);
  app.use(authMiddleware);

  // Per-tenant plan-based rate limiting (after auth so tenantId is available)
  app.use(rateLimitByPlan());

  app.use(triageRateLimiter.middleware());

  // Register all routes — container passed for webhook route dependencies
  registerRoutes(app, container);

  // Error handling middleware (must be last)
  app.use(errorHandler);

  return app;
};

/**
 * Configures server timeouts for slowloris attack protection.
 * Uses Object.assign because Node http.Server requires direct property mutation
 * (framework-boundary side effect, allowed per CLAUDE.md rule 3).
 */
const configureServerTimeouts = (server: import("http").Server): void => {
  Object.assign(server, {
    keepAliveTimeout: SERVER_TIMEOUTS.KEEP_ALIVE_MS,
    headersTimeout: SERVER_TIMEOUTS.HEADERS_MS,
  });
};

/**
 * Start the incident triage service
 */
const startServer = async (): Promise<void> => {
  // Initialize database
  initDatabase({
    connectionString: appConfig.databaseUrl,
    maxConnections: TRIAGE_DB_MAX_CONNECTIONS,
  });
  logger.info("Database initialized for incident triage");

  // Create composition root — shared by both routes and worker
  const container = createTriageContainer();

  const app = createApp(container);

  const server = app.listen(appConfig.port, () => {
    logger.info("Incident triage service started", {
      port: appConfig.port,
      environment: appConfig.environment,
    });
  });

  // Configure server timeouts for slowloris attack protection
  configureServerTimeouts(server);

  // Start the triage worker (polls queue for incoming alerts)
  const triageWorker = startTriageWorker(container);

  // Start the investigation worker (polls queue for on-demand investigations)
  const investigationWorker = startInvestigationWorker(container);

  // Start the dedup cleanup job (periodic expired entry removal)
  const dedupCleanup = startDedupCleanup();

  // Register cleanup handler for graceful shutdown of workers and dedup job
  registerCleanupHandler(async () => {
    dedupCleanup.stop();
    logger.info("Dedup cleanup job shut down");

    triageWorker.stop();
    const triageStats = triageWorker.getStats();
    logger.info("Triage worker shut down", {
      totalProcessed: triageStats.totalProcessed,
      totalErrors: triageStats.totalErrors,
      totalDeduped: triageStats.totalDeduped,
    });

    investigationWorker.stop();
    const investigationStats = investigationWorker.getStats();
    logger.info("Investigation worker shut down", {
      totalProcessed: investigationStats.totalProcessed,
      totalErrors: investigationStats.totalErrors,
    });
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
    logger.error("Failed to start incident triage service", { error });
    process.exit(1);
  }
})();
