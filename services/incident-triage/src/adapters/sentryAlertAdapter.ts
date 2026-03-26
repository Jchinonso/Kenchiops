/**
 * Sentry Alert Adapter
 *
 * Parses Sentry webhook payloads into normalized alert structures
 * and generates fingerprints for deduplication.
 */

import { ValidationError, createLogger, redactObject, truncateText } from "@kenchi/shared";
import type { AlertSourcePort } from "../ports/alertSourcePort.js";
import type { NormalizedAlert, AlertSeverity } from "../types/incidentTypes.js";
import {
  SENTRY_LEVEL_MAP,
  type SentryWebhookPayload,
  type SentryIssueData,
} from "../types/sentryTypes.js";
import { computeHash } from "../helpers/fingerprint.js";

const logger = createLogger("sentry-adapter");

/** Sentry event ID header used as delivery ID */
const SENTRY_HOOK_ID_HEADER = "sentry-hook-id";

/** Default severity when level is not recognized */
const DEFAULT_SEVERITY: AlertSeverity = "medium";

// ==================== Internal Helpers ====================

/**
 * Extracts the delivery ID from Sentry webhook headers.
 */
const extractDeliveryId = (
  headers: Readonly<Record<string, string | string[] | undefined>>
): string => {
  const hookId = headers[SENTRY_HOOK_ID_HEADER];
  if (!hookId || typeof hookId !== "string") {
    throw new ValidationError("Missing Sentry hook ID header", {
      operation: "extractDeliveryId",
      metadata: { header: SENTRY_HOOK_ID_HEADER },
    });
  }
  return hookId;
};

/**
 * Maps Sentry level to normalized severity.
 */
const mapSeverity = (level: string): AlertSeverity =>
  SENTRY_LEVEL_MAP[level.toLowerCase()] ?? DEFAULT_SEVERITY;

/**
 * Extracts labels from Sentry issue data.
 */
const extractLabels = (issue: SentryIssueData): Readonly<Record<string, string>> => ({
  sentry_project_id: issue.project.id,
  sentry_project_name: issue.project.name,
  sentry_project_slug: issue.project.slug,
  sentry_short_id: issue.shortId,
  sentry_level: issue.level,
  sentry_status: issue.status,
  ...(issue.culprit ? { sentry_culprit: issue.culprit } : {}),
  ...(issue.platform ? { sentry_platform: issue.platform } : {}),
});

/**
 * Extracts metrics from Sentry issue data.
 */
const extractMetrics = (issue: SentryIssueData): Readonly<Record<string, unknown>> => ({
  eventCount: parseInt(issue.count, 10),
  userCount: issue.userCount,
  firstSeen: issue.firstSeen,
  lastSeen: issue.lastSeen,
});

/**
 * Validates that the incoming body matches expected Sentry webhook structure.
 */
const validatePayload = (body: unknown): SentryWebhookPayload => {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Invalid Sentry webhook payload: body is not an object", {
      operation: "validatePayload",
    });
  }

  const payload = body as Record<string, unknown>;

  if (!payload.action || typeof payload.action !== "string") {
    throw new ValidationError("Invalid Sentry webhook payload: missing action", {
      operation: "validatePayload",
    });
  }

  if (!payload.data || typeof payload.data !== "object") {
    throw new ValidationError("Invalid Sentry webhook payload: missing data", {
      operation: "validatePayload",
    });
  }

  const data = payload.data as Record<string, unknown>;

  if (!data.issue || typeof data.issue !== "object") {
    throw new ValidationError("Invalid Sentry webhook payload: missing data.issue", {
      operation: "validatePayload",
    });
  }

  const issue = data.issue as Record<string, unknown>;

  if (!issue.id || typeof issue.id !== "string") {
    throw new ValidationError("Invalid Sentry webhook payload: missing data.issue.id", {
      operation: "validatePayload",
    });
  }

  if (!issue.title || typeof issue.title !== "string") {
    throw new ValidationError("Invalid Sentry webhook payload: missing data.issue.title", {
      operation: "validatePayload",
    });
  }

  if (!issue.project || typeof issue.project !== "object") {
    throw new ValidationError("Invalid Sentry webhook payload: missing data.issue.project", {
      operation: "validatePayload",
    });
  }

  return body as SentryWebhookPayload;
};

/**
 * Truncates a source payload to prevent oversized storage.
 * If the serialized payload exceeds 10KB, stores a truncated notice.
 */
const truncateSourcePayload = (
  payload: Record<string, unknown>
): Readonly<Record<string, unknown>> => {
  const serialized = JSON.stringify(payload);
  if (serialized.length <= 10_000) {
    return payload as Readonly<Record<string, unknown>>;
  }
  return { _truncated: true, _originalSize: serialized.length } as Readonly<
    Record<string, unknown>
  >;
};

// ==================== Fingerprint Logic ====================

/**
 * Generates a fingerprint for deduplication.
 * Uses sha256 hash of: source | project_slug | issue_id
 */
const computeFingerprint = (alert: NormalizedAlert): string => {
  const projectSlug = alert.labels.sentry_project_slug ?? "";

  return computeHash([alert.source, projectSlug, alert.sourceAlertId]);
};

// ==================== Adapter Implementation ====================

/**
 * Creates a Sentry alert source adapter.
 */
export const createSentryAdapter = (): AlertSourcePort => ({
  parseWebhook: (
    body: unknown,
    headers: Readonly<Record<string, string | string[] | undefined>>
  ): NormalizedAlert => {
    const payload = validatePayload(body);
    const { issue } = payload.data;
    const deliveryId = extractDeliveryId(headers);

    const partialAlert: NormalizedAlert = {
      sourceAlertId: issue.id,
      deliveryId,
      source: "sentry",
      title: issue.title,
      description: issue.culprit || null,
      severity: mapSeverity(issue.level),
      fingerprint: "",
      serviceName: issue.project.name,
      environment: null,
      metrics: extractMetrics(issue),
      labels: extractLabels(issue),
      receivedAt: new Date().toISOString(),
      sourcePayload: truncateSourcePayload(redactObject(body as Record<string, unknown>)),
    };

    const fingerprint = computeFingerprint(partialAlert);

    logger.info("Sentry webhook parsed", {
      provider: "sentry",
      operation: "parseWebhook",
      sourceAlertId: issue.id,
      severity: partialAlert.severity,
      serviceName: partialAlert.serviceName,
    });

    return { ...partialAlert, fingerprint };
  },

  generateFingerprint: computeFingerprint,
});
