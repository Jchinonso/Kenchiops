/**
 * Incident Dedup Module
 *
 * Database operations for managing the incident deduplication window.
 *
 * @module database/incidentDedup
 */

// Types
export type { IncidentDedupRow, IncidentDedupRecord } from "./types.js";

// Repository operations
export { findByFingerprint, upsertDedupEntry, cleanupExpiredEntries } from "./repository.js";
