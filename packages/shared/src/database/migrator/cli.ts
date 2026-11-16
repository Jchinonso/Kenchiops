/**
 * Database Migrator CLI
 *
 * Standalone entrypoint that connects to Postgres and applies pending
 * migrations. Used by the `migrate` Docker service (run once on stack startup,
 * before app services boot).
 *
 * Connection comes from the shared config (`DATABASE_URL`). Migration files are
 * read from `<cwd>/database/init`; in the container that directory is mounted
 * read-only. An established database with no tracking table is auto-baselined
 * (recorded as up to date) rather than re-run — see {@link runMigrations}.
 *
 * @module database/migrator/cli
 */

import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import pg from "pg";
import { config } from "../../core/config.js";
import { createLogger } from "../../core/logger.js";
import { getErrorMessage } from "../../core/errors.js";
import type { RequestContext } from "../../core/types.js";
import { runMigrations } from "./migrator.js";

const logger = createLogger("migrator-cli");

/** Process exit codes for the migrator entrypoint. */
const EXIT_FAILURE = 1;

/**
 * Connect, run migrations, and exit non-zero on failure so dependent services
 * do not start against an unmigrated database.
 */
const main = async (): Promise<void> => {
  const directory = resolve(process.cwd(), "database/init");
  const context: RequestContext = {
    requestId: randomUUID(),
    tenantId: "system",
    actor: "migrator",
  };

  const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 1 });

  try {
    const result = await runMigrations(pool, { directory }, context);
    logger.info("Migration run finished", {
      applied: result.applied.length,
      baselined: result.baselined.length,
      skipped: result.skipped.length,
      drifted: result.drifted.length,
      ...context,
    });
  } catch (error) {
    logger.error("Migration run failed", { error: getErrorMessage(error), ...context });
    await pool.end();
    process.exit(EXIT_FAILURE);
  }

  await pool.end();
};

void main();
