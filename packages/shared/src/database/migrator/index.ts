/**
 * Database Migrator Module
 *
 * Ordered, tracked SQL migration runner. Applies each `*.sql` file in
 * `database/init` exactly once and records it in `schema_migrations`.
 *
 * @module database/migrator
 */

// Types
export type {
  MigrationFile,
  AppliedMigration,
  MigrationMode,
  RunMigrationsOptions,
  MigrationResult,
} from "./types.js";

// Runner
export { runMigrations } from "./migrator.js";

// Helpers (also useful for tests and tooling)
export {
  MIGRATIONS_TABLE,
  computeChecksum,
  parseVersion,
  requiresNoTransaction,
  assertUniqueVersions,
  loadMigrationFiles,
  selectPending,
  detectDrift,
} from "./helpers.js";
