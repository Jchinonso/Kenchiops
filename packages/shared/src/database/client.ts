/**
 * Database Client
 *
 * Provides a PostgreSQL connection pool for database operations.
 * Uses the pg library with connection pooling and automatic
 * transaction management.
 *
 * @module database/client
 */

import pg from "pg";
import { createLogger } from "../core/logger.js";
import { ValidationError, getErrorMessage } from "../core/errors.js";
import { DATABASE_POOL_DEFAULTS, QUERY_LOGGING, TRANSACTION_COMMANDS } from "../constants/index.js";
import type {
  DatabaseConfig,
  QueryResult,
  QueryMetadata,
  TransactionFunction,
} from "./clientTypes.js";

// Re-export types for backward compatibility
export type { QueryResult } from "./clientTypes.js";

const { Pool } = pg;

const logger = createLogger("database");

// ==================== Pool Event Names ====================

/** Pool event name constants. */
const POOL_EVENTS = {
  ERROR: "error",
  CONNECT: "connect",
} as const;

// ==================== Pool Singleton ====================

let pool: pg.Pool | null = null;

// ==================== Input Validation ====================

/** Validation rule for database configuration fields. */
interface ConfigValidationRule {
  readonly field: keyof DatabaseConfig;
  readonly isInvalid: (config: DatabaseConfig) => boolean;
  readonly message: string;
  readonly getValue?: (config: DatabaseConfig) => unknown;
}

/** Validation rules for database configuration. */
const CONFIG_VALIDATION_RULES: readonly ConfigValidationRule[] = [
  {
    field: "connectionString",
    isInvalid: (config) => config.connectionString.trim().length === 0,
    message: "Database connection string cannot be empty",
  },
  {
    field: "maxConnections",
    isInvalid: (config) => config.maxConnections !== undefined && config.maxConnections < 1,
    message: "Max connections must be at least 1",
    getValue: (config) => config.maxConnections,
  },
  {
    field: "idleTimeoutMs",
    isInvalid: (config) => config.idleTimeoutMs !== undefined && config.idleTimeoutMs < 0,
    message: "Idle timeout cannot be negative",
    getValue: (config) => config.idleTimeoutMs,
  },
  {
    field: "connectionTimeoutMs",
    isInvalid: (config) =>
      config.connectionTimeoutMs !== undefined && config.connectionTimeoutMs < 0,
    message: "Connection timeout cannot be negative",
    getValue: (config) => config.connectionTimeoutMs,
  },
];

/**
 * Validates database configuration.
 *
 * @throws ValidationError if configuration is invalid
 */
const validateConfig = (config: DatabaseConfig): void => {
  const failedRule = CONFIG_VALIDATION_RULES.find((rule) => rule.isInvalid(config));

  if (failedRule === undefined) {
    return;
  }

  const metadata: Record<string, unknown> = { field: failedRule.field };

  if (failedRule.getValue !== undefined) {
    metadata.value = failedRule.getValue(config);
  }

  throw new ValidationError(failedRule.message, {
    operation: "validateConfig",
    metadata,
  });
};

/**
 * Validates query text is non-empty.
 *
 * @throws ValidationError if query text is empty
 */
const validateQueryText = (text: string): void => {
  if (text.trim().length === 0) {
    throw new ValidationError("Query text cannot be empty", {
      operation: "validateQueryText",
    });
  }
};

// ==================== Internal Helpers ====================

/**
 * Truncates query text for safe logging.
 */
const truncateQueryForLog = (text: string): string =>
  text.substring(0, QUERY_LOGGING.MAX_QUERY_LENGTH);

/**
 * Creates query metadata object for logging.
 */
const createQueryMetadata = (
  text: string,
  duration: number,
  rowCount?: number | null,
  error?: string
): QueryMetadata => ({
  query: truncateQueryForLog(text),
  duration,
  ...(rowCount !== undefined && { rowCount }),
  ...(error !== undefined && { error }),
});

/**
 * Ensures pool is initialized.
 *
 * @throws ValidationError if pool is not initialized
 */
const ensurePoolInitialized = (): pg.Pool => {
  if (pool === null) {
    throw new ValidationError("Database pool not initialized. Call initDatabase() first.", {
      operation: "ensurePoolInitialized",
    });
  }
  return pool;
};

/**
 * Registers pool event handlers for logging.
 */
const registerPoolEventHandlers = (dbPool: pg.Pool): void => {
  dbPool.on(POOL_EVENTS.ERROR, (poolError: Error) => {
    logger.error("Unexpected database pool error", { error: poolError.message });
  });

  dbPool.on(POOL_EVENTS.CONNECT, () => {
    logger.debug("New database connection established");
  });
};

/**
 * Calculates duration from start time.
 */
const calculateDuration = (startTime: number): number => Date.now() - startTime;

/**
 * Executes rollback safely, logging any errors.
 */
const safeRollback = async (client: pg.PoolClient): Promise<void> => {
  try {
    await client.query(TRANSACTION_COMMANDS.ROLLBACK);
  } catch (rollbackError) {
    logger.error("Failed to rollback transaction", {
      error: getErrorMessage(rollbackError),
    });
  }
};

// ==================== Public API ====================

/**
 * Initialize the database connection pool.
 * Call this once at application startup.
 *
 * @param config - Database configuration
 * @throws ValidationError if configuration is invalid
 */
export const initDatabase = (config: DatabaseConfig): void => {
  if (pool !== null) {
    logger.warn("Database pool already initialized");
    return;
  }

  validateConfig(config);

  pool = new Pool({
    connectionString: config.connectionString,
    max: config.maxConnections ?? DATABASE_POOL_DEFAULTS.MAX_CONNECTIONS,
    idleTimeoutMillis: config.idleTimeoutMs ?? DATABASE_POOL_DEFAULTS.IDLE_TIMEOUT_MS,
    connectionTimeoutMillis:
      config.connectionTimeoutMs ?? DATABASE_POOL_DEFAULTS.CONNECTION_TIMEOUT_MS,
  });

  registerPoolEventHandlers(pool);
  logger.info("Database pool initialized");
};

/**
 * Get the database pool instance.
 *
 * @returns The database pool
 * @throws ValidationError if pool is not initialized
 */
export const getPool = (): pg.Pool => ensurePoolInitialized();

/**
 * Execute a parameterized query.
 *
 * @param text - SQL query text with $1, $2, etc. placeholders
 * @param params - Query parameters
 * @returns Query result with rows
 * @throws ValidationError if query text is empty
 * @throws Error if query execution fails
 */
export const query = async <T extends pg.QueryResultRow>(
  text: string,
  params?: readonly unknown[]
): Promise<QueryResult<T>> => {
  validateQueryText(text);

  const db = ensurePoolInitialized();
  const startTime = Date.now();

  try {
    const result = await db.query<T>(text, params as unknown[]);
    const duration = calculateDuration(startTime);

    logger.debug("Query executed", createQueryMetadata(text, duration, result.rowCount));

    return {
      rows: result.rows,
      rowCount: result.rowCount ?? 0,
    };
  } catch (error) {
    const duration = calculateDuration(startTime);
    logger.error(
      "Query failed",
      createQueryMetadata(text, duration, undefined, getErrorMessage(error))
    );
    throw error;
  }
};

/**
 * Execute a transaction with automatic commit/rollback.
 *
 * @param transactionFn - Transaction function that receives a client
 * @returns Result of the transaction function
 * @throws ValidationError if pool is not initialized
 * @throws Error if transaction execution fails
 */
export const transaction = async <T>(transactionFn: TransactionFunction<T>): Promise<T> => {
  const db = ensurePoolInitialized();
  const startTime = Date.now();

  let client: pg.PoolClient | null = null;

  try {
    client = await db.connect();
    await client.query(TRANSACTION_COMMANDS.BEGIN);

    const result = await transactionFn(client);

    await client.query(TRANSACTION_COMMANDS.COMMIT);

    const duration = calculateDuration(startTime);
    logger.debug("Transaction committed", { duration });

    return result;
  } catch (error) {
    if (client !== null) {
      await safeRollback(client);
    }

    const duration = calculateDuration(startTime);
    logger.error("Transaction failed", {
      duration,
      error: getErrorMessage(error),
    });

    throw error;
  } finally {
    if (client !== null) {
      client.release();
    }
  }
};

/**
 * Close the database connection pool.
 * Call this during graceful shutdown.
 */
export const closeDatabase = async (): Promise<void> => {
  const currentPool = pool;

  if (currentPool === null) {
    return;
  }

  // Set to null first to prevent concurrent access
  pool = null;

  try {
    await currentPool.end();
    logger.info("Database pool closed");
  } catch (error) {
    logger.error("Failed to close database pool", {
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Check if the database is healthy by running a simple query.
 *
 * @returns true if database is responsive, false otherwise
 */
export const isDatabaseHealthy = async (): Promise<boolean> => {
  try {
    const db = ensurePoolInitialized();
    await db.query(QUERY_LOGGING.HEALTH_CHECK_QUERY);
    return true;
  } catch {
    // Intentionally silent - health check pattern returns boolean
    return false;
  }
};
