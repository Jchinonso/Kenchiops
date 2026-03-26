/**
 * Sentry Webhook & API Types
 *
 * Type definitions for Sentry webhook payloads and API responses.
 */

import type { AlertSeverity } from "./incidentTypes.js";

// ==================== Webhook Payload ====================

/**
 * Sentry webhook payload structure (issue alerts).
 */
export interface SentryWebhookPayload {
  readonly action: string;
  readonly data: {
    readonly issue: SentryIssueData;
  };
  readonly actor: {
    readonly type: string;
    readonly id?: number;
    readonly name?: string;
  };
  readonly installation?: {
    readonly uuid: string;
  };
}

/**
 * Sentry issue data from the webhook payload.
 */
export interface SentryIssueData {
  readonly id: string;
  readonly title: string;
  readonly culprit: string;
  readonly metadata: {
    readonly type?: string;
    readonly value?: string;
    readonly filename?: string;
    readonly function?: string;
  };
  readonly level: string;
  readonly status: string;
  readonly count: string;
  readonly userCount: number;
  readonly firstSeen: string;
  readonly lastSeen: string;
  readonly project: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
  };
  readonly shortId: string;
  readonly platform?: string;
}

// ==================== API Response Types ====================

/**
 * Sentry event response from /api/0/issues/{id}/events/latest/.
 */
export interface SentryEventResponse {
  readonly eventID: string;
  readonly context: Readonly<Record<string, unknown>>;
  readonly entries: readonly SentryEventEntry[];
  readonly tags: readonly SentryTag[];
  readonly dateCreated: string;
  readonly message: string;
}

/**
 * Sentry event entry (exception or breadcrumbs).
 */
export interface SentryEventEntry {
  readonly type: string;
  readonly data: Readonly<Record<string, unknown>>;
}

/**
 * Sentry tag key-value pair.
 */
export interface SentryTag {
  readonly key: string;
  readonly value: string;
}

// ==================== Exception Sub-Types ====================

/**
 * Sentry exception value from an exception entry.
 */
export interface SentryExceptionValue {
  readonly type: string;
  readonly value: string;
  readonly stacktrace: {
    readonly frames: readonly SentryStackFrame[];
  } | null;
}

/**
 * Sentry stack frame.
 */
export interface SentryStackFrame {
  readonly filename: string;
  readonly function: string;
  readonly lineNo: number;
  readonly colNo: number | null;
  readonly context: ReadonlyArray<readonly [number, string]>;
  readonly inApp: boolean;
  readonly absPath?: string;
  readonly module?: string;
}

// ==================== Breadcrumb Sub-Types ====================

/**
 * Sentry breadcrumb from a breadcrumbs entry.
 */
export interface SentryBreadcrumb {
  readonly timestamp: string;
  readonly category: string;
  readonly message: string;
  readonly level: string;
  readonly data?: Readonly<Record<string, unknown>>;
}

// ==================== Severity Mapping ====================

/**
 * Mapping from Sentry level strings to normalized severity.
 */
export const SENTRY_LEVEL_MAP: Readonly<Record<string, AlertSeverity>> = {
  fatal: "critical",
  error: "high",
  warning: "medium",
  info: "low",
  debug: "info",
} as const;
