/**
 * Consent Tracking Repository
 *
 * Database operations for consent record management.
 * The consent_records table is append-only: each consent change
 * (grant or withdrawal) is a new row.
 *
 * @module database/consent/repository
 */

import {
  query,
  createLogger,
  getErrorMessage,
  validateNonEmptyString,
  validateId,
} from "../common.js";
import { CONSENT_QUERIES, CONSENT_ACTIONS } from "../../constants/consent.js";
import type {
  ConsentRecord,
  ConsentRecordRow,
  ConsentPurpose,
  ConsentAction,
  ConsentStatusRow,
  CurrentConsentStatus,
  GrantConsentInput,
  WithdrawConsentInput,
} from "./types.js";

const logger = createLogger("consent-repository");

// ==================== Row Mappers ====================

const mapRowToConsentRecord = (row: ConsentRecordRow): ConsentRecord => ({
  id: row.id,
  userId: row.user_id,
  tenantId: row.tenant_id,
  purpose: row.purpose as ConsentPurpose,
  action: row.action as ConsentAction,
  privacyNoticeVersion: row.privacy_notice_version,
  ipAddress: row.ip_address,
  userAgent: row.user_agent,
  createdAt: row.created_at,
});

const mapStatusRowToCurrentStatus = (row: ConsentStatusRow): CurrentConsentStatus => ({
  purpose: row.purpose as ConsentPurpose,
  action: row.action as ConsentAction,
  privacyNoticeVersion: row.privacy_notice_version,
  recordedAt: row.created_at,
});

// ==================== Public API ====================

/**
 * Record a consent grant for a user within a tenant.
 * Appends a new row with action='granted'.
 *
 * @param input - Consent grant details
 * @returns The created consent record
 */
export const grantConsent = async (input: GrantConsentInput): Promise<ConsentRecord> => {
  validateId(input.userId, "userId");
  validateNonEmptyString(input.tenantId, "tenantId");
  validateNonEmptyString(input.purpose, "purpose");
  validateNonEmptyString(input.privacyNoticeVersion, "privacyNoticeVersion");

  try {
    const result = await query<ConsentRecordRow>(CONSENT_QUERIES.INSERT, [
      input.userId,
      input.tenantId,
      input.purpose,
      CONSENT_ACTIONS.GRANTED,
      input.privacyNoticeVersion,
      input.ipAddress ?? null,
      input.userAgent ?? null,
    ]);

    logger.info("Consent granted", {
      userId: input.userId,
      tenantId: input.tenantId,
      purpose: input.purpose,
    });

    return mapRowToConsentRecord(result.rows[0]);
  } catch (error) {
    logger.error("Failed to grant consent", {
      userId: input.userId,
      tenantId: input.tenantId,
      purpose: input.purpose,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Record a consent withdrawal for a user within a tenant.
 * Appends a new row with action='withdrawn'.
 *
 * @param input - Consent withdrawal details
 * @returns The created consent record
 */
export const withdrawConsent = async (input: WithdrawConsentInput): Promise<ConsentRecord> => {
  validateId(input.userId, "userId");
  validateNonEmptyString(input.tenantId, "tenantId");
  validateNonEmptyString(input.purpose, "purpose");
  validateNonEmptyString(input.privacyNoticeVersion, "privacyNoticeVersion");

  try {
    const result = await query<ConsentRecordRow>(CONSENT_QUERIES.INSERT, [
      input.userId,
      input.tenantId,
      input.purpose,
      CONSENT_ACTIONS.WITHDRAWN,
      input.privacyNoticeVersion,
      input.ipAddress ?? null,
      input.userAgent ?? null,
    ]);

    logger.info("Consent withdrawn", {
      userId: input.userId,
      tenantId: input.tenantId,
      purpose: input.purpose,
    });

    return mapRowToConsentRecord(result.rows[0]);
  } catch (error) {
    logger.error("Failed to withdraw consent", {
      userId: input.userId,
      tenantId: input.tenantId,
      purpose: input.purpose,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Get current consent status for all purposes for a user within a tenant.
 * Reads from the materialized view for fast lookups.
 *
 * @param userId - User ID
 * @param tenantId - Tenant ID
 * @returns Array of current consent statuses per purpose
 */
export const getCurrentConsent = async (
  userId: string,
  tenantId: string
): Promise<readonly CurrentConsentStatus[]> => {
  validateId(userId, "userId");
  validateNonEmptyString(tenantId, "tenantId");

  try {
    const result = await query<ConsentStatusRow>(CONSENT_QUERIES.GET_CURRENT_STATUS, [
      userId,
      tenantId,
    ]);
    return Object.freeze(result.rows.map(mapStatusRowToCurrentStatus));
  } catch (error) {
    logger.error("Failed to get current consent", {
      userId,
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Get full consent history for a user within a tenant.
 * Returns all consent records, ordered by most recent first.
 *
 * @param userId - User ID
 * @param tenantId - Tenant ID
 * @returns Array of consent records
 */
export const getConsentHistory = async (
  userId: string,
  tenantId: string
): Promise<readonly ConsentRecord[]> => {
  validateId(userId, "userId");
  validateNonEmptyString(tenantId, "tenantId");

  try {
    const result = await query<ConsentRecordRow>(CONSENT_QUERIES.GET_HISTORY, [userId, tenantId]);
    return Object.freeze(result.rows.map(mapRowToConsentRecord));
  } catch (error) {
    logger.error("Failed to get consent history", {
      userId,
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};
