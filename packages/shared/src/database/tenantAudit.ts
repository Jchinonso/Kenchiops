/**
 * Tenant Audit Service
 *
 * Handles audit logging for tenant operations.
 * Separated from tenantService for modularity.
 *
 * @module database/tenantAudit
 */

import type pg from "pg";
import { query } from "./client.js";
import { AUDIT_DEFAULTS, AUDIT_QUERIES } from "../constants/index.js";
import type { TenantAuditAction, TenantAuditEntry } from "../core/types.js";

// ==================== Types ====================

/**
 * Database row type for tenant_audit_log table
 */
export interface AuditRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly action: TenantAuditAction;
  readonly actor: string | null;
  readonly metadata: Record<string, unknown>;
  readonly created_at: Date;
}

// ==================== Converters ====================

/**
 * Convert database row to TenantAuditEntry
 */
export const rowToAuditEntry = (row: AuditRow): TenantAuditEntry => ({
  id: row.id,
  tenantId: row.tenant_id,
  action: row.action,
  actor: row.actor,
  metadata: row.metadata,
  createdAt: row.created_at,
});

// ==================== Internal Helpers ====================

/**
 * Insert an audit log entry within a transaction.
 * Used internally by tenant operations.
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
  await client.query(AUDIT_QUERIES.INSERT, [
    tenantId,
    action,
    AUDIT_DEFAULTS.ACTOR,
    JSON.stringify(metadata),
  ]);
};

// ==================== Public API ====================

/**
 * Log an audit event for a tenant.
 * Used for standalone audit entries outside of transactions.
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
  await query(AUDIT_QUERIES.INSERT, [tenantId, action, actor, JSON.stringify(metadata)]);
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
  const result = await query<AuditRow>(AUDIT_QUERIES.SELECT_BY_TENANT, [tenantId, limit]);
  return result.rows.map(rowToAuditEntry);
};
