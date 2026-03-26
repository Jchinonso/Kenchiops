/**
 * OpsGenie Webhook & API Types
 *
 * Type definitions for OpsGenie webhook payloads and API responses.
 */

import type { AlertSeverity } from "./incidentTypes.js";

// ==================== Webhook Payload ====================

/**
 * OpsGenie webhook payload structure.
 */
export interface OpsGenieWebhookPayload {
  readonly action: string;
  readonly source: {
    readonly name: string;
    readonly type: string;
  };
  readonly alert: OpsGenieAlertData;
  readonly integrationId?: string;
  readonly integrationName?: string;
}

/**
 * OpsGenie alert data from the webhook payload.
 */
export interface OpsGenieAlertData {
  readonly alertId: string;
  readonly tinyId: string;
  readonly message: string;
  readonly alias?: string;
  readonly description?: string;
  readonly priority: string;
  readonly source?: string;
  readonly tags?: readonly string[];
  readonly entity?: string;
  readonly createdAt: number;
  readonly updatedAt?: number;
  readonly username?: string;
  readonly team?: string;
  readonly responders?: readonly OpsGenieResponder[];
}

/**
 * OpsGenie alert responder.
 */
export interface OpsGenieResponder {
  readonly id: string;
  readonly type: string;
  readonly name?: string;
}

// ==================== API Response Types ====================

/**
 * OpsGenie alert detail response from GET /v2/alerts/{id}.
 */
export interface OpsGenieAlertDetailResponse {
  readonly data: {
    readonly id: string;
    readonly tinyId: string;
    readonly message: string;
    readonly description?: string;
    readonly priority: string;
    readonly status: string;
    readonly tags: readonly string[];
    readonly source?: string;
    readonly entity?: string;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly acknowledged: boolean;
    readonly count: number;
    readonly teams: readonly OpsGenieResponder[];
    readonly responders: readonly OpsGenieResponder[];
    readonly report?: {
      readonly ackTime?: number;
      readonly closeTime?: number;
    };
  };
  readonly requestId: string;
}

/**
 * OpsGenie alert log entry from GET /v2/alerts/{id}/logs.
 */
export interface OpsGenieAlertLogEntry {
  readonly log: string;
  readonly type: string;
  readonly owner: string;
  readonly createdAt: string;
  readonly offset: string;
}

/**
 * OpsGenie alert logs response.
 */
export interface OpsGenieAlertLogsResponse {
  readonly data: readonly OpsGenieAlertLogEntry[];
  readonly requestId: string;
}

/**
 * OpsGenie alert note entry from GET /v2/alerts/{id}/notes.
 */
export interface OpsGenieAlertNote {
  readonly note: string;
  readonly owner: string;
  readonly createdAt: string;
  readonly offset: string;
}

/**
 * OpsGenie alert notes response.
 */
export interface OpsGenieAlertNotesResponse {
  readonly data: readonly OpsGenieAlertNote[];
  readonly requestId: string;
}

// ==================== Severity Mapping ====================

/**
 * Mapping from OpsGenie priority levels (P1-P5) to normalized severity.
 */
export const OPSGENIE_PRIORITY_MAP: Readonly<Record<string, AlertSeverity>> = {
  P1: "critical",
  P2: "high",
  P3: "medium",
  P4: "low",
  P5: "info",
} as const;
