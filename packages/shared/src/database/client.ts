/**
 * Database Client
 *
 * Provides a PostgreSQL connection pool for database operations.
 * Uses the pg library with connection pooling and automatic
 * transaction management.
 */

import pg from "pg";
import { createLogger } from "../core/logger.js";
import { ValidationError, getErrorMessage } from "../core/errors.js";
import { DATABASE_POOL_DEFAULTS, QUERY_LOGGING, TRANSACTION_COMMANDS } from "../constants/index.js";

const { Pool } = pg;

const logger = createLogger("database");

// ==================== Types ====================

/**
 * Database client configuration
 */
interface DatabaseConfig {
  readonly connectionString: string;
  readonly maxConnections?: number;
  readonly idleTimeoutMs?: number;
  readonly connectionTimeoutMs?: number;
}

/**
 * Query result type with immutable rows
 */
export interface QueryResult<T> {
  readonly rows: readonly T[];
  readonly rowCount: number;
}

/**
 * Query execution metadata for logging
 */
type QueryMetadata = Record<string, unknown> & {
  readonly query: string;
  readonly duration: number;
  readonly rowCount?: number | null;
  readonly error?: string;
};

// ==================== Pool Singleton ====================

let pool: pg.Pool | null = null;

// ==================== Internal Helpers ====================

/**
 * Truncates query text for safe logging
 */
const truncateQueryForLog = (text: string): string =>
  text.substring(0, QUERY_LOGGING.MAX_QUERY_LENGTH);

/**
 * Creates query metadata object for logging
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
  ...(error && { error }),
});

/**
 * Ensures pool is initialized, throws ValidationError if not
 */
const ensurePoolInitialized = (): pg.Pool => {
  if (!pool) {
    throw new ValidationError("Database pool not initialized. Call initDatabase() first.");
  }
  return pool;
};

/**
 * Registers pool event handlers for logging
 */
const registerPoolEventHandlers = (dbPool: pg.Pool): void => {
  dbPool.on("error", (err: Error) => {
    logger.error("Unexpected database pool error", { error: err.message });
  });

  dbPool.on("connect", () => {
    logger.debug("New database connection established");
  });
};

// ==================== Public API ====================

/**
 * Initialize the database connection pool.
 * Call this once at application startup.
 *
 * @param config - Database configuration
 */
export const initDatabase = (config: DatabaseConfig): void => {
  if (pool) {
    logger.warn("Database pool already initialized");
    return;
  }

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
 * @throws ValidationError if pool is not initialized
 */
export const getPool = (): pg.Pool => ensurePoolInitialized();

/**
 * Execute a parameterized query.
 *
 * @param text - SQL query text with $1, $2, etc. placeholders
 * @param params - Query parameters
 * @returns Query result with rows
 */
export const query = async <T extends pg.QueryResultRow>(
  text: string,
  params?: readonly unknown[]
): Promise<QueryResult<T>> => {
  const db = ensurePoolInitialized();
  const start = Date.now();

  try {
    const result = await db.query<T>(text, params as unknown[]);
    const duration = Date.now() - start;

    logger.debug("Query executed", createQueryMetadata(text, duration, result.rowCount));

    return {
      rows: result.rows,
      rowCount: result.rowCount ?? 0,
    };
  } catch (error) {
    const duration = Date.now() - start;
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
 * @param fn - Transaction function that receives a client
 * @returns Result of the transaction function
 */
export const transaction = async <T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> => {
  const db = ensurePoolInitialized();
  const client = await db.connect();

  try {
    await client.query(TRANSACTION_COMMANDS.BEGIN);
    const result = await fn(client);
    await client.query(TRANSACTION_COMMANDS.COMMIT);
    return result;
  } catch (error) {
    await client.query(TRANSACTION_COMMANDS.ROLLBACK);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Close the database connection pool.
 * Call this during graceful shutdown.
 */
export const closeDatabase = async (): Promise<void> => {
  if (!pool) return;

  await pool.end();
  pool = null;
  logger.info("Database pool closed");
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
    return false;
  }
};
