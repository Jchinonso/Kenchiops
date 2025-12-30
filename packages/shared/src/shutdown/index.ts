/**
 * Graceful Shutdown Module
 *
 * Provides utilities for graceful service shutdown.
 */

export {
  setupGracefulShutdown,
  registerCleanupHandler,
  isShuttingDown,
  getShutdownStatus,
  type CleanupFunction,
  type GracefulShutdownConfig,
} from "./gracefulShutdown.js";
