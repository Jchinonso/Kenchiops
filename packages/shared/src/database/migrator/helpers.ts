/**
 * Database Migrator Helpers
 *
 * Pure helpers for discovering, parsing, and ordering migration files.
 * No I/O side effects beyond reading the migration directory.
 *
 * @module database/migrator/helpers
 */

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { ValidationError } from "../../core/errors.js";
import type { MigrationFile } from "./types.js";

/** Matches migration filenames like "023_multi_org_membership.sql". */
const MIGRATION_FILENAME_PATTERN = /^(\d+)_.*\.sql$/;

/** Directive that opts a file out of the wrapping transaction. */
const NO_TRANSACTION_DIRECTIVE = "-- migrate:no-transaction";

/** Name of the table that records applied migrations. */
export const MIGRATIONS_TABLE = "schema_migrations";

/**
 * Compute the SHA-256 hex digest of migration SQL.
 *
 * @param sql - Raw migration contents
 * @returns Lowercase hex digest
 */
export const computeChecksum = (sql: string): string =>
  createHash("sha256").update(sql, "utf8").digest("hex");

/**
 * Parse the numeric version prefix from a migration filename.
 *
 * @param name - Migration filename
 * @returns Parsed integer version
 * @throws ValidationError when the filename does not match the expected pattern
 */
export const parseVersion = (name: string): number => {
  const match = MIGRATION_FILENAME_PATTERN.exec(name);
  if (match === null) {
    throw new ValidationError("Migration filename must match <number>_<name>.sql", {
      metadata: { name },
    });
  }
  return Number.parseInt(match[1], 10);
};

/**
 * Determine whether a migration file opts out of transactional execution.
 *
 * @param sql - Raw migration contents
 * @returns true when the no-transaction directive is present
 */
export const requiresNoTransaction = (sql: string): boolean =>
  sql.includes(NO_TRANSACTION_DIRECTIVE);

/**
 * Ensure no two migration files share the same numeric version.
 *
 * @param files - Discovered migration files
 * @throws ValidationError when a duplicate version is found
 */
export const assertUniqueVersions = (files: readonly MigrationFile[]): void => {
  const seen = new Map<number, string>();
  files.forEach((file) => {
    const existing = seen.get(file.version);
    if (existing !== undefined) {
      throw new ValidationError("Duplicate migration version detected", {
        metadata: { version: file.version, files: [existing, file.name] },
      });
    }
    seen.set(file.version, file.name);
  });
};

/**
 * Read and parse all `*.sql` migration files from a directory, ordered by version.
 *
 * @param directory - Absolute path to the migrations directory
 * @returns Migration files sorted ascending by version
 * @throws ValidationError when filenames are malformed or versions collide
 */
export const loadMigrationFiles = async (directory: string): Promise<readonly MigrationFile[]> => {
  const entries = await readdir(directory);
  const sqlNames = entries.filter((name) => name.endsWith(".sql"));

  const files = await Promise.all(
    sqlNames.map(async (name): Promise<MigrationFile> => {
      const sql = await readFile(join(directory, name), "utf8");
      return {
        version: parseVersion(name),
        name,
        sql,
        checksum: computeChecksum(sql),
        noTransaction: requiresNoTransaction(sql),
      };
    })
  );

  const ordered = [...files].sort((left, right) => left.version - right.version);
  assertUniqueVersions(ordered);
  return ordered;
};

/**
 * Compute which discovered files have not yet been applied.
 *
 * @param files - Discovered migration files (ordered)
 * @param appliedNames - Set of filenames already recorded as applied
 * @returns Pending files in version order
 */
export const selectPending = (
  files: readonly MigrationFile[],
  appliedNames: ReadonlySet<string>
): readonly MigrationFile[] => files.filter((file) => !appliedNames.has(file.name));

/**
 * Identify applied files whose on-disk checksum diverges from the recorded one.
 *
 * @param files - Discovered migration files
 * @param appliedChecksums - Map of filename → recorded checksum
 * @returns Filenames whose contents changed after being applied
 */
export const detectDrift = (
  files: readonly MigrationFile[],
  appliedChecksums: ReadonlyMap<string, string>
): readonly string[] =>
  files
    .filter((file) => {
      const recorded = appliedChecksums.get(file.name);
      return recorded !== undefined && recorded !== file.checksum;
    })
    .map((file) => file.name);
