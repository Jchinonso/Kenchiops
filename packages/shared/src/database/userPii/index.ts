/**
 * User PII Module
 *
 * Database operations for PII access and GDPR erasure.
 *
 * @module database/userPii
 */

// Types
export type { UserPii, OAuthIdentitySummary, PiiErasureResult } from "./types.js";

// Repository operations
export { getUserPii, erasePii } from "./repository.js";
