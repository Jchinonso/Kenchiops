/**
 * Database Migrator Types
 *
 * Type definitions for the schema migration runner.
 *
 * @module database/migrator/types
 */

/**
 * A migration file discovered on disk, ready to be applied.
 */
export interface MigrationFile {
  /** Numeric ordering prefix parsed from the filename (e.g. 23 for "023_x.sql"). */
  readonly version: number;
  /** Full filename including extension (e.g. "023_multi_org_membership.sql"). Unique key. */
  readonly name: string;
  /** Raw SQL contents of the file. */
  readonly sql: string;
  /** SHA-256 hex digest of {@link sql}, used to detect post-apply drift. */
  readonly checksum: string;
  /** When true, the file is executed outside a transaction (opt-in via directive). */
  readonly noTransaction: boolean;
}

/**
 * A migration already recorded in the tracking table.
 */
export interface AppliedMigration {
  readonly name: string;
  readonly checksum: string;
  readonly appliedAt: Date;
}

/**
 * Mode controlling how {@link runMigrations} treats the discovered files.
 *
 * - `apply`: execute every pending file in order (default).
 * - `baseline`: record all discovered files as applied WITHOUT executing them.
 *   Used once to adopt an existing database that already matches the latest schema.
 */
export type MigrationMode = "apply" | "baseline";

/**
 * Options for {@link runMigrations}.
 */
export interface RunMigrationsOptions {
  /** Absolute path to the directory containing ordered `*.sql` files. */
  readonly directory: string;
  /** Execution mode. Defaults to `apply`. */
  readonly mode?: MigrationMode;
  /**
   * When true and the tracking table is created for the first time on a
   * database that already contains application tables, automatically baseline
   * the existing files instead of re-running them. Defaults to true.
   */
  readonly autoBaselineExisting?: boolean;
}

/**
 * Outcome of a migration run.
 */
export interface MigrationResult {
  /** Filenames that were executed during this run. */
  readonly applied: ReadonlyArray<string>;
  /** Filenames that were marked applied without execution (baseline). */
  readonly baselined: ReadonlyArray<string>;
  /** Filenames already applied before this run (skipped). */
  readonly skipped: ReadonlyArray<string>;
  /** Filenames whose on-disk checksum no longer matches the recorded one. */
  readonly drifted: ReadonlyArray<string>;
}
