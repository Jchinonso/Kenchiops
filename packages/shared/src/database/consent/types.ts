/**
 * Consent Tracking Types
 *
 * Type definitions for consent record operations.
 * Schema is append-only: each consent change is a new INSERT.
 *
 * @module database/consent/types
 */

// ==================== Consent Types ====================

/**
 * Consent purpose identifiers.
 */
export type ConsentPurpose =
  | "data_processing"
  | "analytics"
  | "ai_training"
  | "marketing"
  | "third_party_sharing";

/**
 * Consent action: whether consent was granted or withdrawn.
 */
export type ConsentAction = "granted" | "withdrawn";

// ==================== Domain Types ====================

/**
 * Consent record domain object.
 * Represents a single consent event (grant or withdrawal).
 */
export interface ConsentRecord {
  readonly id: string;
  readonly userId: string;
  readonly tenantId: string;
  readonly purpose: ConsentPurpose;
  readonly action: ConsentAction;
  readonly privacyNoticeVersion: string;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly createdAt: Date;
}

// ==================== Row Types ====================

/**
 * Database row for consent_records table (append-only).
 */
export interface ConsentRecordRow {
  readonly id: string;
  readonly user_id: string;
  readonly tenant_id: string;
  readonly purpose: string;
  readonly action: string;
  readonly privacy_notice_version: string;
  readonly ip_address: string | null;
  readonly user_agent: string | null;
  readonly created_at: Date;
}

/**
 * Row from the consent_status_current materialized view.
 */
export interface ConsentStatusRow {
  readonly user_id: string;
  readonly tenant_id: string;
  readonly purpose: string;
  readonly action: string;
  readonly privacy_notice_version: string;
  readonly created_at: Date;
}

// ==================== Input Types ====================

/**
 * Input for recording a consent grant.
 */
export interface GrantConsentInput {
  readonly userId: string;
  readonly tenantId: string;
  readonly purpose: ConsentPurpose;
  readonly privacyNoticeVersion: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

/**
 * Input for recording a consent withdrawal.
 */
export interface WithdrawConsentInput {
  readonly userId: string;
  readonly tenantId: string;
  readonly purpose: ConsentPurpose;
  readonly privacyNoticeVersion: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

/**
 * Current consent status for a specific purpose.
 */
export interface CurrentConsentStatus {
  readonly purpose: ConsentPurpose;
  readonly action: ConsentAction;
  readonly privacyNoticeVersion: string;
  readonly recordedAt: Date;
}
