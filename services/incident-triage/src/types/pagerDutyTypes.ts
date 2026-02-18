/**
 * PagerDuty Webhook V3 Types
 *
 * Type definitions for PagerDuty webhook v3 event payloads.
 */

// ==================== PagerDuty Webhook V3 ====================

/**
 * PagerDuty webhook v3 top-level event envelope.
 */
export interface PagerDutyWebhookV3Event {
  readonly event: {
    readonly id: string;
    readonly event_type: string;
    readonly resource_type: string;
    readonly occurred_at: string;
    readonly agent?: {
      readonly type: string;
      readonly id?: string;
      readonly summary?: string;
    };
    readonly client?: {
      readonly name: string;
    };
    readonly data: PagerDutyIncidentData;
  };
}

/**
 * PagerDuty incident data from the webhook payload.
 */
export interface PagerDutyIncidentData {
  readonly id: string;
  readonly type: string;
  readonly self?: string;
  readonly html_url?: string;
  readonly number?: number;
  readonly status?: string;
  readonly title: string;
  readonly description?: string;
  readonly urgency?: "high" | "low";
  readonly priority?: {
    readonly id: string;
    readonly name: string;
    readonly summary?: string;
    readonly description?: string;
  } | null;
  readonly service?: {
    readonly id: string;
    readonly type: string;
    readonly summary: string;
    readonly self?: string;
    readonly html_url?: string;
  };
  readonly escalation_policy?: {
    readonly id: string;
    readonly type: string;
    readonly summary: string;
  };
  readonly teams?: ReadonlyArray<{
    readonly id: string;
    readonly type: string;
    readonly summary: string;
  }>;
  readonly assignments?: ReadonlyArray<{
    readonly at: string;
    readonly assignee: {
      readonly id: string;
      readonly type: string;
      readonly summary: string;
    };
  }>;
  readonly created_at?: string;
  readonly updated_at?: string;
  readonly alert_counts?: {
    readonly all?: number;
    readonly triggered?: number;
    readonly resolved?: number;
  };
  readonly first_trigger_log_entry?: {
    readonly id: string;
    readonly type: string;
  };
  readonly body?: {
    readonly type?: string;
    readonly details?: Readonly<Record<string, unknown>>;
    readonly cef_details?: {
      readonly source_origin?: string;
      readonly source_component?: string;
      readonly severity?: string;
      readonly class?: string;
      readonly dedup_key?: string;
      readonly event_class?: string;
      readonly timestamp?: string;
      readonly description?: string;
      readonly custom_details?: Readonly<Record<string, unknown>>;
    };
    readonly contexts?: ReadonlyArray<{
      readonly type: string;
      readonly src?: string;
      readonly href?: string;
      readonly text?: string;
      readonly alt?: string;
    }>;
  };
}

/**
 * PagerDuty urgency level.
 */
export type PagerDutyUrgency = "high" | "low";

/**
 * Mapping from PagerDuty priority names to normalized severity levels.
 */
export const PAGERDUTY_PRIORITY_MAP: Readonly<Record<string, string>> = {
  P1: "critical",
  P2: "high",
  P3: "medium",
  P4: "low",
  P5: "info",
  SEV1: "critical",
  SEV2: "high",
  SEV3: "medium",
  SEV4: "low",
  SEV5: "info",
} as const;

/**
 * Default severity mapping from PagerDuty urgency.
 */
export const PAGERDUTY_URGENCY_MAP: Readonly<Record<string, string>> = {
  high: "high",
  low: "low",
} as const;
