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
  config,
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
 * Create and configure Express application
 */
const createApp = (): express.Express => {
  const app = express();

  // Capture raw body for webhook signature verification
  // This must come before express.json() so we have the original payload
  app.use(
    express.json({
      verify: (req: express.Request, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );
  app.use(requestLogger);

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
 * Handle graceful shutdown
 */
const setupGracefulShutdown = (server: ReturnType<typeof express.application.listen>): void => {
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down gracefully`);

    server.close(async () => {
      // Flush and destroy the aggregator (posts any pending analyses)
      logger.info("Flushing failure aggregator...");
      await destroyAggregator();

      await closeDatabase();
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
const startServer = (): void => {
  // Initialize database for multi-tenant support
  initializeDatabase();

  // Initialize failure aggregator for consolidated CI analysis
  initializeFailureAggregator();

  const app = createApp();

  const server = app.listen(appConfig.port, () => {
    logger.info("GitHub App service started", {
      port: appConfig.port,
      environment: appConfig.environment,
    });
  });

  setupGracefulShutdown(server);
};

// Start the server
startServer();
