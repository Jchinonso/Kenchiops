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
  createRedisRateLimiter,
  setupGracefulShutdown,
  EXPRESS_CONFIG,
  RATE_LIMIT_CONSTANTS,
  API_MESSAGES,
  API_REDIS_PREFIXES,
  shouldSkipRateLimit,
} from "@kenchi/shared";
import { registerRoutes } from "./routes/index.js";
import { appConfig } from "./config/appConfig.js";

const logger = createLogger("api");

/** Default shutdown timeout in milliseconds */
const SHUTDOWN_TIMEOUT_MS = 30000;

/**
 * Redis-backed rate limiter: 100 requests per minute per IP.
 * Falls back to in-memory if Redis is unavailable.
 * Skips health check endpoints for monitoring.
 */
const apiRateLimiter = createRedisRateLimiter({
  windowMs: RATE_LIMIT_CONSTANTS.DEFAULT_WINDOW_MS,
  max: RATE_LIMIT_CONSTANTS.DEFAULT_MAX_REQUESTS,
  message: API_MESSAGES.RATE_LIMIT_EXCEEDED,
  keyPrefix: API_REDIS_PREFIXES.RATE_LIMIT,
  skip: (req) => shouldSkipRateLimit(req.path),
});

/**
 * Create and configure Express application
 */
const createApp = (): express.Express => {
  const app = express();

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

/**
 * Start the API service
 */
const startServer = (): void => {
  const app = createApp();

  const server = app.listen(appConfig.port, () => {
    logger.info("API service started", {
      port: appConfig.port,
      environment: appConfig.environment,
    });
  });

  // Set up graceful shutdown
  setupGracefulShutdown(server, {
    serviceName: appConfig.serviceName,
    timeoutMs: SHUTDOWN_TIMEOUT_MS,
    closeDatabase: false, // API service doesn't use database directly
    closeRedis: true,
  });
};

// Start the server
startServer();
