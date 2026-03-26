/**
 * New Relic Webhook & API Types
 *
 * Type definitions for New Relic webhook payloads and NerdGraph API responses.
 */

import type { AlertSeverity } from "./incidentTypes.js";

// ==================== Webhook Payload ====================

/**
 * New Relic alert notification webhook payload.
 */
export interface NewRelicWebhookPayload {
  readonly id: string;
  readonly account_id: number;
  readonly account_name: string;
  readonly condition_id: number;
  readonly condition_name: string;
  readonly current_state: string;
  readonly details: string;
  readonly event_type: string;
  readonly incident_acknowledge_url?: string;
  readonly incident_url?: string;
  readonly owner?: string;
  readonly policy_name: string;
  readonly policy_url?: string;
  readonly runbook_url?: string;
  readonly severity: string;
  readonly targets: readonly NewRelicTarget[];
  readonly timestamp: number;
  readonly timestamp_utc: string;
  readonly violation_callback_url?: string;
  readonly violation_chart_url?: string;
  readonly condition_family_id?: number;
}

/**
 * New Relic alert target.
 */
export interface NewRelicTarget {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly link?: string;
  readonly labels?: Readonly<Record<string, string>>;
  readonly product?: string;
}

/**
 * New Relic condition data from the webhook.
 */
export interface NewRelicConditionData {
  readonly id: number;
  readonly name: string;
  readonly type: string;
  readonly enabled: boolean;
}

// ==================== NerdGraph API Types ====================

/**
 * NerdGraph GraphQL response envelope.
 */
export interface NerdGraphResponse<T> {
  readonly data: T;
  readonly errors?: readonly NerdGraphError[];
}

/**
 * NerdGraph GraphQL error.
 */
export interface NerdGraphError {
  readonly message: string;
  readonly locations?: readonly { readonly line: number; readonly column: number }[];
  readonly path?: readonly string[];
  readonly extensions?: Readonly<Record<string, unknown>>;
}

/**
 * NerdGraph NRQL query result.
 */
export interface NerdGraphNrqlResult {
  readonly actor: {
    readonly account: {
      readonly nrql: {
        readonly results: readonly Readonly<Record<string, unknown>>[];
      };
    };
  };
}

// ==================== Severity Mapping ====================

/**
 * Mapping from New Relic severity/priority strings to normalized severity.
 */
export const NEWRELIC_SEVERITY_MAP: Readonly<Record<string, AlertSeverity>> = {
  CRITICAL: "critical",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
  WARNING: "medium",
  INFO: "info",
} as const;

/**
 * New Relic alert states that indicate an active problem.
 */
export const NEWRELIC_ACTIVE_STATES: ReadonlySet<string> = new Set([
  "open",
  "ACTIVATED",
]) as ReadonlySet<string>;
