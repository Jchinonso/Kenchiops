/**
 * Incident Dedup Types
 *
 * Type definitions for incident deduplication window storage.
 *
 * @module database/incidentDedup/types
 */

// ==================== Database Row Types ====================

/**
 * Database row type for incident_dedup_window table.
 */
export interface IncidentDedupRow {
  readonly fingerprint: string;
  readonly tenant_id: string | null;
  readonly alert_id: string;
  readonly expires_at: Date;
  readonly created_at: Date;
}

// ==================== Domain Types ====================

/**
 * Domain record for an incident dedup window entry.
 */
export interface IncidentDedupRecord {
  readonly fingerprint: string;
  readonly tenantId: string | null;
  readonly alertId: string;
  readonly expiresAt: Date;
  readonly createdAt: Date;
}
