/**
 * Database Client Module
 *
 * PostgreSQL connection pool with query and transaction support.
 *
 * @module database/client
 */

// Types
export type {
  DatabaseConfig,
  QueryResult,
  QueryMetadata,
  TransactionFunction,
  ConfigValidationRule,
} from "./types.js";

// Client functions
export {
  initDatabase,
  getPool,
  query,
  transaction,
  closeDatabase,
  isDatabaseHealthy,
} from "./client.js";

// Helpers (for internal use by other database modules)
export { validateConfig, validateQueryText } from "./helpers.js";
