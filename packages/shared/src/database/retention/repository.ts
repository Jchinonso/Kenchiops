/**
 * Data Retention Repository
 *
 * Database operations for retention policy management and enforcement.
 *
 * @module database/retention/repository
 */

import { query, createLogger, getErrorMessage, validateNonEmptyString } from "../common.js";
import { RETENTION_QUERIES, RETENTION_DEFAULTS } from "../../constants/retention.js";
import type {
  RetentionPolicy,
  RetentionPolicyRow,
  UpsertRetentionPolicyInput,
  RetentionEnforcementResult,
} from "./types.js";

const logger = createLogger("retention-repository");

// ==================== Row Mapper ====================

const mapRowToRetentionPolicy = (row: RetentionPolicyRow): RetentionPolicy => ({
  tenantId: row.tenant_id,
  auditLogDays: row.audit_log_days,
  analysisDays: row.analysis_days,
  eventDays: row.event_days,
  webhookDays: row.webhook_days,
  updatedAt: row.updated_at,
});

// ==================== Public API ====================

/**
 * Get the retention policy for a tenant.
 * Returns null if no policy has been explicitly configured
 * (callers should fall back to system defaults).
 *
 * @param tenantId - Tenant ID
 * @returns Retention policy or null
 */
export const getRetentionPolicy = async (tenantId: string): Promise<RetentionPolicy | null> => {
  validateNonEmptyString(tenantId, "tenantId");

  try {
    const result = await query<RetentionPolicyRow>(RETENTION_QUERIES.GET_POLICY, [tenantId]);
    return result.rows.length > 0 ? mapRowToRetentionPolicy(result.rows[0]) : null;
  } catch (error) {
    logger.error("Failed to get retention policy", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Create or update a retention policy for a tenant.
 * Missing fields default to the system-wide defaults.
 *
 * @param input - Policy values to upsert
 * @returns The upserted retention policy
 */
export const upsertRetentionPolicy = async (
  input: UpsertRetentionPolicyInput
): Promise<RetentionPolicy> => {
  validateNonEmptyString(input.tenantId, "tenantId");

  try {
    const result = await query<RetentionPolicyRow>(RETENTION_QUERIES.UPSERT_POLICY, [
      input.tenantId,
      input.auditLogDays ?? RETENTION_DEFAULTS.AUDIT_LOG_DAYS,
      input.analysisDays ?? RETENTION_DEFAULTS.ANALYSIS_DAYS,
      input.eventDays ?? RETENTION_DEFAULTS.EVENT_DAYS,
      input.webhookDays ?? RETENTION_DEFAULTS.WEBHOOK_DAYS,
    ]);

    logger.info("Upserted retention policy", { tenantId: input.tenantId });

    return mapRowToRetentionPolicy(result.rows[0]);
  } catch (error) {
    logger.error("Failed to upsert retention policy", {
      tenantId: input.tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Enforce retention policy for a single tenant.
 * Deletes data older than the configured TTLs in batches.
 *
 * Uses the tenant's custom policy if set, otherwise falls back to system defaults.
 *
 * @param tenantId - Tenant ID
 * @returns Summary of how many records were deleted per table
 */
export const enforceRetentionForTenant = async (
  tenantId: string
): Promise<RetentionEnforcementResult> => {
  validateNonEmptyString(tenantId, "tenantId");

  const policy = await getRetentionPolicy(tenantId);
  const auditDays = policy?.auditLogDays ?? RETENTION_DEFAULTS.AUDIT_LOG_DAYS;
  const webhookDays = policy?.webhookDays ?? RETENTION_DEFAULTS.WEBHOOK_DAYS;
  const analysisDays = policy?.analysisDays ?? RETENTION_DEFAULTS.ANALYSIS_DAYS;
  const eventDays = policy?.eventDays ?? RETENTION_DEFAULTS.EVENT_DAYS;
  const batchLimit = RETENTION_DEFAULTS.BATCH_DELETE_LIMIT;

  try {
    const [auditResult, webhookResult, analysesResult, eventsResult] = await Promise.all([
      query(RETENTION_QUERIES.PURGE_AUDIT_LOGS, [tenantId, auditDays, batchLimit]),
      query(RETENTION_QUERIES.PURGE_WEBHOOK_ACTIVITY, [tenantId, webhookDays, batchLimit]),
      query(RETENTION_QUERIES.PURGE_ANALYSES, [tenantId, analysisDays, batchLimit]),
      query(RETENTION_QUERIES.PURGE_EVENTS, [tenantId, eventDays, batchLimit]),
    ]);

    const result: RetentionEnforcementResult = {
      tenantId,
      auditLogsDeleted: auditResult.rowCount ?? 0,
      webhookActivityDeleted: webhookResult.rowCount ?? 0,
      analysesDeleted: analysesResult.rowCount ?? 0,
      eventsDeleted: eventsResult.rowCount ?? 0,
    };

    const totalDeleted =
      result.auditLogsDeleted +
      result.webhookActivityDeleted +
      result.analysesDeleted +
      result.eventsDeleted;

    if (totalDeleted > 0) {
      logger.info("Retention enforcement completed", {
        tenantId,
        auditLogsDeleted: result.auditLogsDeleted,
        webhookActivityDeleted: result.webhookActivityDeleted,
        analysesDeleted: result.analysesDeleted,
        eventsDeleted: result.eventsDeleted,
      });
    }

    return result;
  } catch (error) {
    logger.error("Failed to enforce retention for tenant", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};
