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
  EXPRESS_CONFIG,
} from "@kenchi/shared";
import { registerRoutes } from "./routes/index.js";
import { appConfig } from "./config/appConfig.js";

const logger = createLogger("api");

/**
 * Redis-backed rate limiter: 100 requests per minute per IP.
 * Falls back to in-memory if Redis is unavailable.
 * Skips health check endpoints for monitoring.
 */
const apiRateLimiter = createRedisRateLimiter({
  windowMs: 60000, // 1 minute
  max: 100,
  message: "Too many requests to API, please try again later",
  keyPrefix: "rl:api:",
  skip: (req) => req.path === "/health" || req.path === "/api/health",
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

  app.listen(appConfig.port, () => {
    logger.info("API service started", {
      port: appConfig.port,
      environment: appConfig.environment,
    });
  });
};

// Start the server
startServer();
