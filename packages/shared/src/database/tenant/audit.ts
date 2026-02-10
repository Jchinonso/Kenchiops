/**
 * Tenant Audit Service
 *
 * Handles audit logging for tenant operations.
 *
 * @module database/tenant/audit
 */

import type pg from "pg";
import {
  query,
  createLogger,
  getErrorMessage,
  AUDIT_DEFAULTS,
  AUDIT_QUERIES,
  type TenantAuditAction,
  type TenantAuditEntry,
} from "../common.js";
import type { AuditRow } from "./types.js";
import { mapRowToAuditEntry, validateId, validateLimit } from "./helpers.js";

const logger = createLogger("tenant-audit");

/**
 * Insert an audit log entry within a transaction.
 *
 * @param client - Database transaction client
 * @param tenantId - Tenant ID
 * @param action - Audit action type
 * @param metadata - Additional metadata for the action
 */
export const insertAuditLog = async (
  client: pg.PoolClient,
  tenantId: string,
  action: TenantAuditAction,
  metadata: Record<string, unknown> = {}
): Promise<void> => {
  validateId(tenantId, "tenantId");

  try {
    await client.query(AUDIT_QUERIES.INSERT, [
      tenantId,
      action,
      AUDIT_DEFAULTS.ACTOR,
      JSON.stringify(metadata),
    ]);

    logger.debug("Inserted audit log entry", { tenantId, action });
  } catch (error) {
    logger.error("Failed to insert audit log", {
      tenantId,
      action,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Log an audit event for a tenant.
 *
 * @param tenantId - Tenant ID
 * @param action - Audit action type
 * @param metadata - Additional metadata for the action
 * @param actor - Actor performing the action
 */
export const logAuditEvent = async (
  tenantId: string,
  action: TenantAuditAction,
  metadata: Record<string, unknown> = {},
  actor: string = AUDIT_DEFAULTS.ACTOR
): Promise<void> => {
  validateId(tenantId, "tenantId");

  try {
    await query(AUDIT_QUERIES.INSERT, [tenantId, action, actor, JSON.stringify(metadata)]);

    logger.info("Logged audit event", { tenantId, action, actor });
  } catch (error) {
    logger.error("Failed to log audit event", {
      tenantId,
      action,
      actor,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Get audit log entries for a tenant.
 *
 * @param tenantId - Tenant ID
 * @param limit - Maximum number of entries to return
 * @returns Array of audit entries
 */
export const getAuditLog = async (
  tenantId: string,
  limit: number = AUDIT_DEFAULTS.LIMIT
): Promise<readonly TenantAuditEntry[]> => {
  validateId(tenantId, "tenantId");
  validateLimit(limit);

  try {
    const result = await query<AuditRow>(AUDIT_QUERIES.SELECT_BY_TENANT, [tenantId, limit]);
    return Object.freeze(result.rows.map(mapRowToAuditEntry));
  } catch (error) {
    logger.error("Failed to get audit log", {
      tenantId,
      limit,
      error: getErrorMessage(error),
    });
    throw error;
  }
};
