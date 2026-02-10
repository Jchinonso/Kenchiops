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
} from "./gracefulShutdown.js";

export type {
  CleanupFunction,
  GracefulShutdownConfig,
  ShutdownStatus,
  UnregisterFunction,
} from "./types.js";
