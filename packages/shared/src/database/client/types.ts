/**
 * Database Client Types
 *
 * Type definitions for database connection and query operations.
 *
 * @module database/client/types
 */

import type pg from "pg";

// ==================== Configuration Types ====================

/**
 * Database client configuration.
 */
export interface DatabaseConfig {
  readonly connectionString: string;
  readonly maxConnections?: number;
  readonly idleTimeoutMs?: number;
  readonly connectionTimeoutMs?: number;
}

// ==================== Result Types ====================

/**
 * Query result type with immutable rows.
 */
export interface QueryResult<T> {
  readonly rows: readonly T[];
  readonly rowCount: number;
}

// ==================== Internal Types ====================

/**
 * Query execution metadata for logging.
 * Extends Record<string, unknown> for compatibility with structured logging.
 */
export type QueryMetadata = Record<string, unknown> & {
  readonly query: string;
  readonly duration: number;
  readonly rowCount?: number | null;
  readonly error?: string;
};

/**
 * Transaction function signature.
 */
export type TransactionFunction<T> = (client: pg.PoolClient) => Promise<T>;

/**
 * Validation rule for database configuration fields.
 */
export interface ConfigValidationRule {
  readonly field: keyof DatabaseConfig;
  readonly isInvalid: (config: DatabaseConfig) => boolean;
  readonly message: string;
  readonly getValue?: (config: DatabaseConfig) => unknown;
}
