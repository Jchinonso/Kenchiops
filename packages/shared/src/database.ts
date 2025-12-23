/**
 * Database Client
 *
 * Provides a PostgreSQL connection pool for database operations.
 * Uses the pg library with connection pooling.
 */

import pg from "pg";
import { createLogger } from "./logger.js";
import { ValidationError } from "./errors.js";

const { Pool } = pg;

const logger = createLogger("database");

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
 * Query result type
 */
export interface QueryResult<T> {
  readonly rows: readonly T[];
  readonly rowCount: number;
}

/**
 * Database client singleton
 */
let pool: pg.Pool | null = null;

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
    max: config.maxConnections ?? 10,
    idleTimeoutMillis: config.idleTimeoutMs ?? 30000,
    connectionTimeoutMillis: config.connectionTimeoutMs ?? 5000,
  });

  pool.on("error", (err: Error) => {
    logger.error("Unexpected database pool error", { error: err.message });
  });

  pool.on("connect", () => {
    logger.debug("New database connection established");
  });

  logger.info("Database pool initialized");
};

/**
 * Get the database pool instance.
 *
 * @throws Error if pool is not initialized
 */
export const getPool = (): pg.Pool => {
  if (!pool) {
    throw new ValidationError("Database pool not initialized. Call initDatabase() first.");
  }
  return pool;
};

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
  const db = getPool();
  const start = Date.now();

  try {
    const result = await db.query<T>(text, params as unknown[]);
    const duration = Date.now() - start;

    logger.debug("Query executed", {
      query: text.substring(0, 100),
      duration,
      rowCount: result.rowCount,
    });

    return {
      rows: result.rows,
      rowCount: result.rowCount ?? 0,
    };
  } catch (error) {
    const duration = Date.now() - start;
    logger.error("Query failed", {
      query: text.substring(0, 100),
      duration,
      error: error instanceof Error ? error.message : "Unknown error",
    });
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
  const db = getPool();
  const client = await db.connect();

  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
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
  if (pool) {
    await pool.end();
    pool = null;
    logger.info("Database pool closed");
  }
};

/**
 * Check if the database is healthy by running a simple query.
 */
export const isDatabaseHealthy = async (): Promise<boolean> => {
  try {
    const db = getPool();
    await db.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
};
