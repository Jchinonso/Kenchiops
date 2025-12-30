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
import { closeDatabase } from "../database/client.js";
import { closeRedis } from "../queue/redisClient.js";

const logger = createLogger("graceful-shutdown");

// ==================== Types ====================

/**
 * Cleanup function type for registered handlers
 */
export type CleanupFunction = () => void | Promise<void>;

/**
 * Configuration for graceful shutdown
 */
export interface GracefulShutdownConfig {
  /** Timeout in milliseconds before forcing exit (default: 30000) */
  readonly timeoutMs?: number;
  /** Whether to close database connections (default: true) */
  readonly closeDatabase?: boolean;
  /** Whether to close Redis connections (default: true) */
  readonly closeRedis?: boolean;
  /** Service name for logging */
  readonly serviceName: string;
}

/**
 * Shutdown state tracking
 */
interface ShutdownState {
  isShuttingDown: boolean;
  cleanupFunctions: CleanupFunction[];
}

// ==================== Constants ====================

/** Default shutdown timeout */
const DEFAULT_TIMEOUT_MS = 30000;

// ==================== State ====================

const state: ShutdownState = {
  isShuttingDown: false,
  cleanupFunctions: [],
};

// ==================== Core Functions ====================

/**
 * Check if shutdown is in progress
 */
export const isShuttingDown = (): boolean => state.isShuttingDown;

/**
 * Register a cleanup function to be called during shutdown.
 * Functions are called in registration order.
 *
 * @param fn - Cleanup function to register
 * @returns Function to unregister the cleanup handler
 */
export const registerCleanupHandler = (fn: CleanupFunction): (() => void) => {
  state.cleanupFunctions.push(fn);

  return () => {
    const index = state.cleanupFunctions.indexOf(fn);
    if (index !== -1) {
      state.cleanupFunctions.splice(index, 1);
    }
  };
};

/**
 * Execute all registered cleanup functions
 */
const executeCleanupHandlers = async (): Promise<void> => {
  const results = await Promise.allSettled(
    state.cleanupFunctions.map(async (cleanupHandler) => {
      try {
        await cleanupHandler();
      } catch (error) {
        logger.error("Cleanup handler failed", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    })
  );

  const failedCount = results.filter((result) => result.status === "rejected").length;
  if (failedCount > 0) {
    logger.warn("Some cleanup handlers failed", { failedCount });
  }
};

/**
 * Close infrastructure connections (database, Redis)
 */
const closeInfrastructure = async (config: GracefulShutdownConfig): Promise<void> => {
  const closePromises: Array<Promise<void>> = [];

  if (config.closeDatabase !== false) {
    closePromises.push(
      closeDatabase().catch((error) => {
        logger.error("Failed to close database", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
      })
    );
  }

  if (config.closeRedis !== false) {
    closePromises.push(
      closeRedis().catch((error) => {
        logger.error("Failed to close Redis", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
      })
    );
  }

  await Promise.all(closePromises);
};

/**
 * Create the shutdown handler
 */
const createShutdownHandler =
  (server: Server, config: GracefulShutdownConfig) =>
  async (signal: string): Promise<void> => {
    // Prevent multiple shutdown attempts
    if (state.isShuttingDown) {
      logger.warn("Shutdown already in progress, ignoring signal", { signal });
      return;
    }

    state.isShuttingDown = true;
    logger.info(`Received ${signal}, starting graceful shutdown`, {
      serviceName: config.serviceName,
    });

    const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    // Set up forced exit timeout
    const forceExitTimeout = setTimeout(() => {
      logger.error("Graceful shutdown timed out, forcing exit", {
        serviceName: config.serviceName,
        timeoutMs,
      });
      process.exit(1);
    }, timeoutMs);

    // Prevent timeout from keeping the process alive
    forceExitTimeout.unref();

    try {
      // 1. Stop accepting new connections
      await new Promise<void>((resolve, reject) => {
        server.close((closeError) => {
          if (closeError) {
            logger.error("Error closing HTTP server", {
              error: closeError.message,
            });
            reject(closeError);
          } else {
            logger.info("HTTP server closed, no longer accepting connections");
            resolve();
          }
        });
      });

      // 2. Execute registered cleanup handlers (stop workers, etc.)
      logger.info("Executing cleanup handlers", {
        handlerCount: state.cleanupFunctions.length,
      });
      await executeCleanupHandlers();

      // 3. Close infrastructure connections
      logger.info("Closing infrastructure connections");
      await closeInfrastructure(config);

      // 4. Shutdown complete
      clearTimeout(forceExitTimeout);
      logger.info("Graceful shutdown complete", {
        serviceName: config.serviceName,
      });
      process.exit(0);
    } catch (error) {
      logger.error("Error during graceful shutdown", {
        error: error instanceof Error ? error.message : "Unknown error",
        serviceName: config.serviceName,
      });
      clearTimeout(forceExitTimeout);
      process.exit(1);
    }
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
 * Get current shutdown status for health checks
 */
export const getShutdownStatus = (): { isShuttingDown: boolean; registeredHandlers: number } => ({
  isShuttingDown: state.isShuttingDown,
  registeredHandlers: state.cleanupFunctions.length,
});
