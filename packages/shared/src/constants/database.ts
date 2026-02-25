/**
 * Database Constants
 *
 * Centralized configuration for database connection pool and queries.
 */

/**
 * Default database pool configuration values
 */
export const DATABASE_POOL_DEFAULTS = {
  /** Maximum number of clients in the pool (configurable via DB_POOL_SIZE env var) */
  MAX_CONNECTIONS: 25,
  /** How long a client can sit idle before being closed (ms) */
  IDLE_TIMEOUT_MS: 30_000,
  /** How long to wait for a connection before timing out (ms) */
  CONNECTION_TIMEOUT_MS: 5_000,
} as const;

/**
 * Query logging configuration
 */
export const QUERY_LOGGING = {
  /** Maximum query length to log (prevents huge queries in logs) */
  MAX_QUERY_LENGTH: 100,
  /** Health check query */
  HEALTH_CHECK_QUERY: "SELECT 1",
} as const;

/**
 * Transaction SQL commands
 */
export const TRANSACTION_COMMANDS = {
  BEGIN: "BEGIN",
  COMMIT: "COMMIT",
  ROLLBACK: "ROLLBACK",
} as const;
