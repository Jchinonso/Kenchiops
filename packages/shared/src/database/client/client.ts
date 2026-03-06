/**
 * Database Client
 *
 * Provides a PostgreSQL connection pool for database operations.
 * Uses the pg library with connection pooling and automatic
 * transaction management.
 *
 * @module database/client/client
 */

import pg from "pg";
import { createLogger } from "../../core/logger.js";
import { ValidationError, getErrorMessage } from "../../core/errors.js";
import {
  DATABASE_POOL_DEFAULTS,
  QUERY_LOGGING,
  TRANSACTION_COMMANDS,
} from "../../constants/index.js";
import type { DatabaseConfig, QueryResult, TransactionFunction } from "./types.js";
import {
  validateConfig,
  validateQueryText,
  createQueryMetadata,
  calculateDuration,
} from "./helpers.js";

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

// ==================== Internal Helpers ====================

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
    statement_timeout: config.statementTimeoutMs ?? DATABASE_POOL_DEFAULTS.STATEMENT_TIMEOUT_MS,
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
 * Execute a callback within a transaction that sets the RLS tenant context.
 *
 * Issues `SET LOCAL app.tenant_id = $1` so that row-level security policies
 * can filter rows to the given tenant. The setting is scoped to the
 * transaction and automatically cleared on COMMIT or ROLLBACK.
 *
 * @param tenantId - Tenant ID to bind to the connection for RLS
 * @param fn - Callback receiving the transactional PoolClient
 * @returns Result of the callback
 */
export const withTenantContext = async <T>(
  tenantId: string,
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> => {
  const db = ensurePoolInitialized();
  const startTime = Date.now();

  // let: assigned once, read in finally block
  let client: pg.PoolClient | null = null;

  try {
    client = await db.connect();
    await client.query(TRANSACTION_COMMANDS.BEGIN);
    await client.query("SET LOCAL app.tenant_id = $1", [tenantId]);

    const result = await fn(client);

    await client.query(TRANSACTION_COMMANDS.COMMIT);

    const duration = calculateDuration(startTime);
    logger.debug("Tenant context transaction committed", { tenantId, duration });

    return result;
  } catch (error) {
    if (client !== null) {
      await safeRollback(client);
    }

    const duration = calculateDuration(startTime);
    logger.error("Tenant context transaction failed", {
      tenantId,
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
