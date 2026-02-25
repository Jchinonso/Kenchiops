/**
 * Consent Tracking Constants
 *
 * SQL queries and configuration for consent record operations.
 * The consent_records table is append-only (no UPDATE/DELETE from app layer).
 *
 * @module constants/consent
 */

// ==================== Consent Purposes ====================

export const CONSENT_PURPOSES = {
  DATA_PROCESSING: "data_processing",
  ANALYTICS: "analytics",
  AI_TRAINING: "ai_training",
  MARKETING: "marketing",
  THIRD_PARTY_SHARING: "third_party_sharing",
} as const;

// ==================== Consent Actions ====================

export const CONSENT_ACTIONS = {
  GRANTED: "granted",
  WITHDRAWN: "withdrawn",
} as const;

// ==================== SQL Queries ====================

export const CONSENT_QUERIES = {
  /** Append a new consent record (grant or withdrawal). */
  INSERT: `
    INSERT INTO consent_records (user_id, tenant_id, purpose, action, privacy_notice_version, ip_address, user_agent)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `,

  /**
   * Get current consent status from the materialized view.
   * Returns latest action per purpose for a user+tenant.
   */
  GET_CURRENT_STATUS: `
    SELECT * FROM consent_status_current
    WHERE user_id = $1 AND tenant_id = $2
  `,

  /** Get current consent status for a specific purpose. */
  GET_STATUS_BY_PURPOSE: `
    SELECT * FROM consent_status_current
    WHERE user_id = $1 AND tenant_id = $2 AND purpose = $3
  `,

  /** Get full consent history for a user+tenant (all records, chronological). */
  GET_HISTORY: `
    SELECT * FROM consent_records
    WHERE user_id = $1 AND tenant_id = $2
    ORDER BY created_at DESC
  `,
} as const;
