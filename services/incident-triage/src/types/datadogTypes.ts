/**
 * Datadog Webhook Types
 *
 * Type definitions for Datadog webhook payloads.
 * Datadog webhooks use template variables ($ALERT_ID, $ALERT_TITLE, etc.)
 * that are expanded into the JSON payload.
 */

import type { AlertSeverity } from "./incidentTypes.js";

// ==================== Payload Types ====================

/**
 * Datadog webhook payload structure.
 * Fields correspond to Datadog template variables.
 */
export interface DatadogWebhookPayload {
  readonly $ALERT_ID: string;
  readonly $ALERT_TITLE: string;
  readonly $ALERT_STATUS: string;
  readonly $ALERT_BODY?: string;
  readonly $PRIORITY?: string;
  readonly $HOSTNAME?: string;
  readonly $TAGS?: string;
  readonly $LINK?: string;
  readonly $EVENT_MSG?: string;
  readonly $ALERT_METRIC?: string;
  readonly $ALERT_QUERY?: string;
  readonly $ALERT_SCOPE?: string;
  readonly $LAST_UPDATED?: string;
  readonly $DATE?: string;
  readonly $ORG_NAME?: string;
}

// ==================== Severity Mapping ====================

/**
 * Mapping from Datadog priority levels to normalized severity.
 * P1 = most urgent, P5 = least urgent.
 */
export const DATADOG_PRIORITY_MAP: Readonly<Record<string, AlertSeverity>> = {
  P1: "critical",
  P2: "high",
  P3: "medium",
  P4: "low",
  P5: "info",
} as const;
