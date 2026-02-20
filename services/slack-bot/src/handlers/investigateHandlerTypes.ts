/**
 * Investigate Handler Types
 *
 * Type definitions and constants for the `/kenchi investigate` subcommand handler.
 *
 * @module handlers/investigateHandlerTypes
 */

import type { InvestigationRecord } from "@kenchi/shared";

// ==================== Constants ====================

/**
 * Polling configuration for investigation result retrieval.
 * The handler polls the incident-triage service until the investigation completes or times out.
 */
export const INVESTIGATION_POLL_CONFIG = {
  /** Maximum number of polling attempts before declaring a timeout */
  MAX_ATTEMPTS: 8,
  /** Delay between polling attempts in milliseconds */
  INTERVAL_MS: 3000,
  /** Request timeout for individual HTTP calls in milliseconds */
  REQUEST_TIMEOUT_MS: 10000,
} as const;

// ==================== Types ====================

/**
 * API envelope for a single investigation from the incident-triage service.
 */
export interface InvestigationApiResponse {
  readonly data: InvestigationRecord;
}

/**
 * API envelope for the POST investigation creation response.
 */
export interface InvestigationCreateResponse {
  readonly data: {
    readonly id: string;
    readonly status: string;
  };
}
