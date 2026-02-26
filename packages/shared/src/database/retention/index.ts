/**
 * Data Retention Module
 *
 * Database operations for retention policy management and enforcement.
 *
 * @module database/retention
 */

// Types
export type {
  RetentionPolicy,
  UpsertRetentionPolicyInput,
  RetentionEnforcementResult,
} from "./types.js";

// Repository operations
export {
  getRetentionPolicy,
  upsertRetentionPolicy,
  enforceRetentionForTenant,
} from "./repository.js";
