/**
 * Consent Tracking Module
 *
 * Database operations for consent record management (GDPR Articles 6-7).
 * Append-only: each consent change is a new record.
 *
 * @module database/consent
 */

// Types
export type {
  ConsentRecord,
  ConsentPurpose,
  ConsentAction,
  CurrentConsentStatus,
  GrantConsentInput,
  WithdrawConsentInput,
} from "./types.js";

// Repository operations
export {
  grantConsent,
  withdrawConsent,
  getCurrentConsent,
  getConsentHistory,
} from "./repository.js";
