/**
 * Graceful Shutdown Types
 *
 * @module shutdown/types
 */

/**
 * Cleanup function type for registered handlers.
 */
export type CleanupFunction = () => void | Promise<void>;

/**
 * Configuration for graceful shutdown.
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
 * Internal shutdown state tracking.
 */
export interface ShutdownState {
  isShuttingDown: boolean;
  cleanupFunctions: CleanupFunction[];
}

/**
 * Shutdown status for health checks.
 */
export interface ShutdownStatus {
  readonly isShuttingDown: boolean;
  readonly registeredHandlers: number;
}

/**
 * Infrastructure closer configuration entry.
 */
export interface InfrastructureCloser {
  readonly name: string;
  readonly shouldClose: (config: GracefulShutdownConfig) => boolean;
  readonly close: () => Promise<void>;
}

/**
 * Unregister function returned by registerCleanupHandler.
 */
export type UnregisterFunction = () => void;
