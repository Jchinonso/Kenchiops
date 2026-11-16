#!/usr/bin/env tsx
/**
 * Local database migration runner.
 *
 * Applies any pending `database/init/*.sql` files to the database pointed at by
 * DATABASE_URL, tracking applied files in `schema_migrations`. Safe to run
 * repeatedly — already-applied files are skipped.
 *
 * Usage:
 *   npm run migrate                 # apply pending migrations
 *   MIGRATE_MODE=baseline npm run migrate   # record all files as applied (no execution)
 *
 * In Docker this same logic runs via the `migrate` compose service
 * (packages/shared/src/database/migrator/cli.ts).
 */

import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import pg from "pg";
import { runMigrations, type MigrationMode } from "../packages/shared/src/database/index.js";
import type { RequestContext } from "../packages/shared/src/core/types.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(scriptDir, "..", "database", "init");

const connectionString = process.env.DATABASE_URL;
const mode: MigrationMode = process.env.MIGRATE_MODE === "baseline" ? "baseline" : "apply";

const run = async (): Promise<void> => {
  if (connectionString === undefined || connectionString.length === 0) {
    console.error("DATABASE_URL is required. Example: postgres://kenchi:pw@localhost:5433/kenchi");
    process.exit(1);
  }

  const context: RequestContext = {
    requestId: randomUUID(),
    tenantId: "system",
    actor: "migrate-script",
  };

  const pool = new pg.Pool({ connectionString, max: 1 });
  try {
    const result = await runMigrations(pool, { directory: migrationsDir, mode }, context);
    console.log(
      `Migrations: ${result.applied.length} applied, ${result.baselined.length} baselined, ` +
        `${result.skipped.length} already up to date${
          result.drifted.length > 0 ? `, ${result.drifted.length} drifted (changed on disk)` : ""
        }`
    );
    if (result.applied.length > 0) {
      console.log(`Applied:\n  ${result.applied.join("\n  ")}`);
    }
  } catch (error) {
    console.error("Migration failed:", error instanceof Error ? error.message : error);
    await pool.end();
    process.exit(1);
  }
  await pool.end();
};

void run();
