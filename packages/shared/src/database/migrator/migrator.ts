/**
 * Database Migrator
 *
 * Applies ordered SQL migration files exactly once, tracking applied files in a
 * `schema_migrations` table. Safe to run on every boot: already-applied files
 * are skipped, pending files are applied in version order, each inside its own
 * transaction (unless a file opts out via the `-- migrate:no-transaction`
 * directive).
 *
 * This is the single source of truth for schema application — it replaces
 * Postgres's one-shot `docker-entrypoint-initdb.d` behaviour, which only ran on
 * a fresh data volume and never re-applied later migrations.
 *
 * @module database/migrator/migrator
 */

import type pg from "pg";
import { createLogger } from "../../core/logger.js";
import { ExternalServiceError, getErrorMessage } from "../../core/errors.js";
import type { RequestContext } from "../../core/types.js";
import { MIGRATIONS_TABLE, detectDrift, loadMigrationFiles, selectPending } from "./helpers.js";
import type {
  AppliedMigration,
  MigrationFile,
  MigrationResult,
  RunMigrationsOptions,
} from "./types.js";

const logger = createLogger("migrator");

/** Sentinel table whose presence implies an established (non-empty) schema. */
const SENTINEL_TABLE = "tenants";

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
    name        TEXT PRIMARY KEY,
    checksum    TEXT NOT NULL,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

const RECORD_SQL = `
  INSERT INTO ${MIGRATIONS_TABLE} (name, checksum)
  VALUES ($1, $2)
  ON CONFLICT (name) DO NOTHING;
`;

/**
 * Roll back the current transaction, swallowing any rollback error so the
 * original failure is the one that propagates.
 */
const safeRollback = async (client: pg.PoolClient): Promise<void> => {
  try {
    await client.query("ROLLBACK");
  } catch (rollbackError) {
    logger.error("Failed to roll back migration transaction", {
      error: getErrorMessage(rollbackError),
    });
  }
};

/**
 * Check whether a table exists in the current database (public schema).
 */
const tableExists = async (pool: pg.Pool, tableName: string): Promise<boolean> => {
  const result = await pool.query<{ exists: boolean }>(
    "SELECT to_regclass($1) IS NOT NULL AS exists",
    [tableName]
  );
  return result.rows[0]?.exists ?? false;
};

/**
 * Read all recorded migrations from the tracking table.
 */
const fetchApplied = async (pool: pg.Pool): Promise<readonly AppliedMigration[]> => {
  const result = await pool.query<{ name: string; checksum: string; applied_at: Date }>(
    `SELECT name, checksum, applied_at FROM ${MIGRATIONS_TABLE}`
  );
  return result.rows.map((row) => ({
    name: row.name,
    checksum: row.checksum,
    appliedAt: row.applied_at,
  }));
};

/**
 * Record a set of files as applied without executing their SQL (baseline).
 */
const recordBaseline = async (pool: pg.Pool, files: readonly MigrationFile[]): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await Promise.all(files.map((file) => client.query(RECORD_SQL, [file.name, file.checksum])));
    await client.query("COMMIT");
  } catch (error) {
    await safeRollback(client);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Apply a single migration file, recording it on success.
 *
 * Transactional files run their SQL and tracking insert atomically. Files that
 * opt out (`-- migrate:no-transaction`) run their SQL first, then record.
 */
const applyFile = async (pool: pg.Pool, file: MigrationFile): Promise<void> => {
  if (file.noTransaction) {
    await pool.query(file.sql);
    await pool.query(RECORD_SQL, [file.name, file.checksum]);
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(file.sql);
    await client.query(RECORD_SQL, [file.name, file.checksum]);
    await client.query("COMMIT");
  } catch (error) {
    await safeRollback(client);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Run pending database migrations.
 *
 * @param pool - An initialized pg connection pool
 * @param options - Directory, mode, and baseline behaviour
 * @param context - Request context for structured logging
 * @returns Summary of applied, baselined, skipped, and drifted migrations
 * @throws ExternalServiceError when a migration file fails to apply
 */
export const runMigrations = async (
  pool: pg.Pool,
  options: RunMigrationsOptions,
  context: RequestContext
): Promise<MigrationResult> => {
  const mode = options.mode ?? "apply";
  const autoBaselineExisting = options.autoBaselineExisting ?? true;

  const files = await loadMigrationFiles(options.directory);
  logger.info("Discovered migration files", {
    count: files.length,
    directory: options.directory,
    mode,
    ...context,
  });

  // Detect whether the tracking table existed BEFORE we create it, so we can
  // decide if an established database should be baselined rather than re-run.
  const trackingTablePresent = await tableExists(pool, MIGRATIONS_TABLE);
  await pool.query(CREATE_TABLE_SQL);

  const shouldBaselineExisting =
    !trackingTablePresent && autoBaselineExisting && (await tableExists(pool, SENTINEL_TABLE));

  if (mode === "baseline" || shouldBaselineExisting) {
    await recordBaseline(pool, files);
    logger.warn("Baselined existing schema without executing migrations", {
      baselined: files.length,
      reason: mode === "baseline" ? "explicit" : "existing-schema-detected",
      ...context,
    });
    return {
      applied: [],
      baselined: files.map((file) => file.name),
      skipped: [],
      drifted: [],
    };
  }

  const applied = await fetchApplied(pool);
  const appliedNames = new Set(applied.map((row) => row.name));
  const appliedChecksums = new Map(applied.map((row) => [row.name, row.checksum]));

  const drifted = detectDrift(files, appliedChecksums);
  if (drifted.length > 0) {
    logger.warn("Applied migrations changed on disk after being applied", {
      drifted,
      ...context,
    });
  }

  const pending = selectPending(files, appliedNames);
  if (pending.length === 0) {
    logger.info("Database schema is up to date", {
      skipped: appliedNames.size,
      ...context,
    });
    return { applied: [], baselined: [], skipped: [...appliedNames], drifted };
  }

  logger.info("Applying pending migrations", {
    pending: pending.map((file) => file.name),
    ...context,
  });

  // Sequential: each migration may depend on the previous one's schema.
  // let: accumulates names across the early-exit-on-failure loop.
  const appliedNow: string[] = [];
  for (const file of pending) {
    const startTime = Date.now();
    try {
      await applyFile(pool, file);
      appliedNow.push(file.name);
      logger.info("Migration applied", {
        provider: "postgres",
        operation: "applyMigration",
        name: file.name,
        durationMs: Date.now() - startTime,
        ...context,
      });
    } catch (error) {
      logger.error("Migration failed", {
        provider: "postgres",
        operation: "applyMigration",
        name: file.name,
        durationMs: Date.now() - startTime,
        error: getErrorMessage(error),
        ...context,
      });
      throw new ExternalServiceError("postgres", `Migration ${file.name} failed`, {
        metadata: { name: file.name, applied: appliedNow },
        retryable: false,
      });
    }
  }

  logger.info("Migrations complete", { appliedCount: appliedNow.length, ...context });
  return {
    applied: appliedNow,
    baselined: [],
    skipped: [...appliedNames],
    drifted,
  };
};
