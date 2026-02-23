/**
 * Incident Dedup Repository
 *
 * Database operations for managing the incident deduplication window.
 *
 * @module database/incidentDedup/repository
 */

import { query, createLogger, getErrorMessage, INCIDENT_DEDUP_QUERIES } from "../common.js";
import type { IncidentDedupRow, IncidentDedupRecord } from "./types.js";

const logger = createLogger("incident-dedup-repository");

// ==================== Row Mapper ====================

/**
 * Maps a database row to an IncidentDedupRecord domain object.
 */
const mapRowToIncidentDedup = (row: IncidentDedupRow): IncidentDedupRecord => ({
  fingerprint: row.fingerprint,
  tenantId: row.tenant_id,
  alertId: row.alert_id,
  expiresAt: row.expires_at,
  createdAt: row.created_at,
});

// ==================== Public API ====================

/**
 * Finds an active dedup entry by fingerprint and tenant.
 *
 * @param fingerprint - The alert fingerprint
 * @param tenantId - The tenant ID
 * @returns The dedup record, or null if not found or expired
 */
export const findByFingerprint = async (
  fingerprint: string,
  tenantId: string
): Promise<IncidentDedupRecord | null> => {
  if (!fingerprint?.trim()) {
    return null;
  }

  try {
    const result = await query<IncidentDedupRow>(INCIDENT_DEDUP_QUERIES.FIND_BY_FINGERPRINT, [
      fingerprint,
      tenantId,
    ]);
    return result.rows.length > 0 ? mapRowToIncidentDedup(result.rows[0]) : null;
  } catch (error) {
    logger.error("Failed to find dedup entry by fingerprint", {
      fingerprint,
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Upserts a dedup window entry.
 *
 * @param fingerprint - The alert fingerprint
 * @param tenantId - The tenant ID
 * @param alertId - The alert ID that owns this window
 * @param expiresAt - When this dedup window expires
 */
export const upsertDedupEntry = async (
  fingerprint: string,
  tenantId: string,
  alertId: string,
  expiresAt: Date
): Promise<void> => {
  try {
    await query(INCIDENT_DEDUP_QUERIES.UPSERT, [
      fingerprint,
      tenantId,
      alertId,
      expiresAt.toISOString(),
    ]);

    logger.info("Dedup entry upserted", {
      fingerprint,
      tenantId,
      alertId,
    });
  } catch (error) {
    logger.error("Failed to upsert dedup entry", {
      fingerprint,
      tenantId,
      alertId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Removes expired dedup window entries.
 *
 * @returns The number of expired entries removed
 */
export const cleanupExpiredEntries = async (): Promise<number> => {
  try {
    const result = await query(INCIDENT_DEDUP_QUERIES.CLEANUP_EXPIRED, []);
    const deletedCount = result.rowCount ?? 0;

    logger.info("Expired dedup entries cleaned up", { deletedCount });
    return deletedCount;
  } catch (error) {
    logger.error("Failed to cleanup expired dedup entries", {
      error: getErrorMessage(error),
    });
    throw error;
  }
};
