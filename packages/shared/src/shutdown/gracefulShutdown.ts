/**
 * Graceful Shutdown Module
 *
 * Provides utilities for graceful shutdown of services.
 * Ensures in-flight requests complete and resources are cleaned up.
 *
 * @module shutdown/gracefulShutdown
 */

import type { Server } from "http";
import { createLogger } from "../core/logger.js";
import { getErrorMessage } from "../core/errors.js";
import { closeDatabase } from "../database/client/index.js";
import { closeRedis } from "../queue/redisClient.js";
import type {
  CleanupFunction,
  GracefulShutdownConfig,
  ShutdownState,
  ShutdownStatus,
  InfrastructureCloser,
  UnregisterFunction,
} from "./types.js";

const logger = createLogger("graceful-shutdown");

// ==================== Constants ====================

/** Default shutdown timeout */
const DEFAULT_TIMEOUT_MS = 30000;

/** Infrastructure closers - evaluated in order */
const INFRASTRUCTURE_CLOSERS: readonly InfrastructureCloser[] = [
  {
    name: "database",
    shouldClose: (config) => config.closeDatabase !== false,
    close: closeDatabase,
  },
  {
    name: "redis",
    shouldClose: (config) => config.closeRedis !== false,
    close: closeRedis,
  },
];

// ==================== State ====================

const state: ShutdownState = {
  isShuttingDown: false,
  cleanupFunctions: [],
};

// ==================== Helper Functions ====================

/** Wraps a close operation with error logging */
const safeClose = async (name: string, closeFn: () => Promise<void>): Promise<void> => {
  try {
    await closeFn();
  } catch (error) {
    logger.error(`Failed to close ${name}`, { error: getErrorMessage(error) });
  }
};

/** Executes a single cleanup handler with error handling */
const executeHandler = async (handler: CleanupFunction): Promise<void> => {
  try {
    await handler();
  } catch (error) {
    logger.error("Cleanup handler failed", { error: getErrorMessage(error) });
  }
};

/** Counts rejected promises in settlement results */
const countRejected = (results: ReadonlyArray<PromiseSettledResult<void>>): number =>
  results.filter((result) => result.status === "rejected").length;

/** Closes the HTTP server and returns a promise */
const closeServer = (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((closeError) => {
      if (closeError) {
        logger.error("Error closing HTTP server", { error: closeError.message });
        reject(closeError);
        return;
      }
      logger.info("HTTP server closed, no longer accepting connections");
      resolve();
    });
  });

// ==================== Core Functions ====================

/**
 * Execute all registered cleanup functions.
 */
const executeCleanupHandlers = async (): Promise<void> => {
  const results = await Promise.allSettled(state.cleanupFunctions.map(executeHandler));
  const failedCount = countRejected(results);

  if (failedCount > 0) {
    logger.warn("Some cleanup handlers failed", { failedCount });
  }
};

/**
 * Close infrastructure connections using lookup table pattern.
 */
const closeInfrastructure = async (config: GracefulShutdownConfig): Promise<void> => {
  const closersToRun = INFRASTRUCTURE_CLOSERS.filter((closer) => closer.shouldClose(config));
  await Promise.all(closersToRun.map((closer) => safeClose(closer.name, closer.close)));
};

/**
 * Perform the shutdown sequence.
 */
const performShutdown = async (
  server: Server,
  config: GracefulShutdownConfig,
  forceExitTimeout: NodeJS.Timeout
): Promise<void> => {
  // 1. Stop accepting new connections
  await closeServer(server);

  // 2. Execute registered cleanup handlers
  logger.info("Executing cleanup handlers", { handlerCount: state.cleanupFunctions.length });
  await executeCleanupHandlers();

  // 3. Close infrastructure connections
  logger.info("Closing infrastructure connections");
  await closeInfrastructure(config);

  // 4. Shutdown complete
  clearTimeout(forceExitTimeout);
  logger.info("Graceful shutdown complete", { serviceName: config.serviceName });
  process.exit(0);
};

/**
 * Create the shutdown handler.
 */
const createShutdownHandler =
  (server: Server, config: GracefulShutdownConfig) =>
  async (signal: string): Promise<void> => {
    if (state.isShuttingDown) {
      logger.warn("Shutdown already in progress, ignoring signal", { signal });
      return;
    }

    state.isShuttingDown = true;
    logger.info(`Received ${signal}, starting graceful shutdown`, {
      serviceName: config.serviceName,
    });

    const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const forceExitTimeout = setTimeout(() => {
      logger.error("Graceful shutdown timed out, forcing exit", {
        serviceName: config.serviceName,
        timeoutMs,
      });
      process.exit(1);
    }, timeoutMs);

    forceExitTimeout.unref();

    try {
      await performShutdown(server, config, forceExitTimeout);
    } catch (error) {
      logger.error("Error during graceful shutdown", {
        error: getErrorMessage(error),
        serviceName: config.serviceName,
      });
      clearTimeout(forceExitTimeout);
      process.exit(1);
    }
  };

// ==================== Exports ====================

/**
 * Check if shutdown is in progress.
 */
export const isShuttingDown = (): boolean => state.isShuttingDown;

/**
 * Register a cleanup function to be called during shutdown.
 * Functions are called in registration order.
 *
 * @param cleanupHandler - Cleanup function to register
 * @returns Function to unregister the cleanup handler
 */
export const registerCleanupHandler = (cleanupHandler: CleanupFunction): UnregisterFunction => {
  state.cleanupFunctions.push(cleanupHandler);

  return () => {
    const index = state.cleanupFunctions.indexOf(cleanupHandler);
    if (index !== -1) {
      state.cleanupFunctions.splice(index, 1);
    }
  };
};

/**
 * Set up graceful shutdown handlers for SIGTERM and SIGINT.
 *
 * @param server - HTTP server instance
 * @param config - Shutdown configuration
 *
 * @example
 * ```typescript
 * const server = app.listen(3000);
 * setupGracefulShutdown(server, {
 *   serviceName: 'api',
 *   timeoutMs: 30000,
 * });
 * ```
 */
export const setupGracefulShutdown = (server: Server, config: GracefulShutdownConfig): void => {
  const shutdown = createShutdownHandler(server, config);

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  logger.debug("Graceful shutdown handlers registered", {
    serviceName: config.serviceName,
    timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });
};

/**
 * Get current shutdown status for health checks.
 */
export const getShutdownStatus = (): ShutdownStatus => ({
  isShuttingDown: state.isShuttingDown,
  registeredHandlers: state.cleanupFunctions.length,
});
