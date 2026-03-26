/**
 * New Relic Alert Adapter
 *
 * Parses New Relic webhook payloads into normalized alert structures
 * and generates fingerprints for deduplication.
 */

import { ValidationError, createLogger, redactObject } from "@kenchi/shared";
import type { AlertSourcePort } from "../ports/alertSourcePort.js";
import type { NormalizedAlert, AlertSeverity } from "../types/incidentTypes.js";
import {
  NEWRELIC_SEVERITY_MAP,
  type NewRelicWebhookPayload,
  type NewRelicTarget,
} from "../types/newRelicTypes.js";
import { computeHash } from "../helpers/fingerprint.js";

const logger = createLogger("newrelic-adapter");

/** Default severity when severity string is not recognized */
const DEFAULT_SEVERITY: AlertSeverity = "medium";

/** Delivery ID prefix for synthetic IDs */
const DELIVERY_ID_PREFIX = "nr";

// ==================== Internal Helpers ====================

/**
 * Maps New Relic severity to normalized severity.
 */
const mapSeverity = (severity: string): AlertSeverity =>
  NEWRELIC_SEVERITY_MAP[severity.toUpperCase()] ?? DEFAULT_SEVERITY;

/**
 * Extracts the primary target name as service name.
 */
const extractServiceName = (targets: readonly NewRelicTarget[]): string | null => {
  const firstTarget = targets.length > 0 ? targets[0] : null;
  return firstTarget?.name ?? null;
};

/**
 * Extracts labels from New Relic payload.
 */
const extractLabels = (payload: NewRelicWebhookPayload): Readonly<Record<string, string>> => ({
  nr_condition_id: String(payload.condition_id),
  nr_condition_name: payload.condition_name,
  nr_policy_name: payload.policy_name,
  nr_account_id: String(payload.account_id),
  nr_account_name: payload.account_name,
  nr_current_state: payload.current_state,
  nr_event_type: payload.event_type,
  ...(payload.owner ? { nr_owner: payload.owner } : {}),
});

/**
 * Extracts metrics from New Relic payload.
 */
const extractMetrics = (payload: NewRelicWebhookPayload): Readonly<Record<string, unknown>> => ({
  conditionId: payload.condition_id,
  conditionName: payload.condition_name,
  policyName: payload.policy_name,
  targetCount: payload.targets.length,
});

/**
 * Validates that the incoming body matches expected New Relic webhook structure.
 */
const validatePayload = (body: unknown): NewRelicWebhookPayload => {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Invalid New Relic webhook payload: body is not an object", {
      operation: "validatePayload",
    });
  }

  const payload = body as Record<string, unknown>;

  if (!payload.id || typeof payload.id !== "string") {
    throw new ValidationError("Invalid New Relic webhook payload: missing id", {
      operation: "validatePayload",
    });
  }

  if (!payload.condition_name || typeof payload.condition_name !== "string") {
    throw new ValidationError("Invalid New Relic webhook payload: missing condition_name", {
      operation: "validatePayload",
    });
  }

  if (!payload.severity || typeof payload.severity !== "string") {
    throw new ValidationError("Invalid New Relic webhook payload: missing severity", {
      operation: "validatePayload",
    });
  }

  if (!Array.isArray(payload.targets)) {
    throw new ValidationError("Invalid New Relic webhook payload: missing targets array", {
      operation: "validatePayload",
    });
  }

  return body as NewRelicWebhookPayload;
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
 * Uses sha256 hash of: source | condition_id | policy_name | service_name
 */
const computeFingerprint = (alert: NormalizedAlert): string => {
  const conditionId = alert.labels.nr_condition_id ?? "";
  const policyName = alert.labels.nr_policy_name ?? "";

  return computeHash([alert.source, conditionId, policyName, alert.serviceName ?? ""]);
};

/**
 * Generates a synthetic delivery ID from incident ID and timestamp.
 */
const generateDeliveryId = (incidentId: string, timestamp: number): string =>
  computeHash([DELIVERY_ID_PREFIX, incidentId, String(timestamp)]);

// ==================== Adapter Implementation ====================

/**
 * Creates a New Relic alert source adapter.
 */
export const createNewRelicAdapter = (): AlertSourcePort => ({
  parseWebhook: (
    body: unknown,
    _headers: Readonly<Record<string, string | string[] | undefined>>
  ): NormalizedAlert => {
    const payload = validatePayload(body);
    const deliveryId = generateDeliveryId(payload.id, payload.timestamp);
    const serviceName = extractServiceName(payload.targets);

    const partialAlert: NormalizedAlert = {
      sourceAlertId: payload.id,
      deliveryId,
      source: "newrelic",
      title: payload.condition_name,
      description: payload.details || null,
      severity: mapSeverity(payload.severity),
      fingerprint: "",
      serviceName,
      environment: null,
      metrics: extractMetrics(payload),
      labels: extractLabels(payload),
      receivedAt: new Date().toISOString(),
      sourcePayload: truncateSourcePayload(redactObject(body as Record<string, unknown>)),
    };

    const fingerprint = computeFingerprint(partialAlert);

    logger.info("New Relic webhook parsed", {
      provider: "newrelic",
      operation: "parseWebhook",
      sourceAlertId: payload.id,
      severity: partialAlert.severity,
      serviceName,
    });

    return { ...partialAlert, fingerprint };
  },

  generateFingerprint: computeFingerprint,
});
