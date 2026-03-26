/**
 * OpsGenie Alert Adapter
 *
 * Parses OpsGenie webhook payloads into normalized alert structures
 * and generates fingerprints for deduplication.
 */

import { ValidationError, createLogger, redactObject } from "@kenchi/shared";
import type { AlertSourcePort } from "../ports/alertSourcePort.js";
import type { NormalizedAlert, AlertSeverity } from "../types/incidentTypes.js";
import {
  OPSGENIE_PRIORITY_MAP,
  type OpsGenieWebhookPayload,
  type OpsGenieAlertData,
} from "../types/opsgenieTypes.js";
import { computeHash } from "../helpers/fingerprint.js";

const logger = createLogger("opsgenie-adapter");

/** Default severity when priority is not recognized */
const DEFAULT_SEVERITY: AlertSeverity = "medium";

/** Delivery ID prefix for synthetic IDs */
const DELIVERY_ID_PREFIX = "og";

// ==================== Internal Helpers ====================

/**
 * Maps OpsGenie priority (P1-P5) to normalized severity.
 */
const mapSeverity = (priority: string): AlertSeverity =>
  OPSGENIE_PRIORITY_MAP[priority.toUpperCase()] ?? DEFAULT_SEVERITY;

/**
 * Extracts environment from OpsGenie alert tags.
 */
const extractEnvironment = (tags: readonly string[] | undefined): string | null => {
  if (!tags) {
    return null;
  }
  const envTag = tags.find((tag) => tag.startsWith("env:"));
  return envTag ? envTag.slice(4) : null;
};

/**
 * Extracts service name from OpsGenie alert tags or entity.
 */
const extractServiceName = (alertData: OpsGenieAlertData): string | null => {
  const tags = alertData.tags ?? [];
  const serviceTag = tags.find((tag) => tag.startsWith("service:"));
  if (serviceTag) {
    return serviceTag.slice(8);
  }
  return alertData.entity ?? null;
};

/**
 * Extracts labels from OpsGenie alert data.
 */
const extractLabels = (
  alertData: OpsGenieAlertData,
  payload: OpsGenieWebhookPayload
): Readonly<Record<string, string>> => ({
  og_alert_id: alertData.alertId,
  og_tiny_id: alertData.tinyId,
  og_priority: alertData.priority,
  og_action: payload.action,
  ...(alertData.source ? { og_source: alertData.source } : {}),
  ...(alertData.team ? { og_team: alertData.team } : {}),
  ...(alertData.tags
    ? Object.fromEntries(
        alertData.tags.map((tag) => {
          const [key, ...valueParts] = tag.split(":");
          return [`og_tag_${key}`, valueParts.join(":") || "true"];
        })
      )
    : {}),
});

/**
 * Validates that the incoming body matches expected OpsGenie webhook structure.
 */
const validatePayload = (body: unknown): OpsGenieWebhookPayload => {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Invalid OpsGenie webhook payload: body is not an object", {
      operation: "validatePayload",
    });
  }

  const payload = body as Record<string, unknown>;

  if (!payload.action || typeof payload.action !== "string") {
    throw new ValidationError("Invalid OpsGenie webhook payload: missing action", {
      operation: "validatePayload",
    });
  }

  if (!payload.alert || typeof payload.alert !== "object") {
    throw new ValidationError("Invalid OpsGenie webhook payload: missing alert", {
      operation: "validatePayload",
    });
  }

  const alertObj = payload.alert as Record<string, unknown>;

  if (!alertObj.alertId || typeof alertObj.alertId !== "string") {
    throw new ValidationError("Invalid OpsGenie webhook payload: missing alert.alertId", {
      operation: "validatePayload",
    });
  }

  if (!alertObj.message || typeof alertObj.message !== "string") {
    throw new ValidationError("Invalid OpsGenie webhook payload: missing alert.message", {
      operation: "validatePayload",
    });
  }

  return body as OpsGenieWebhookPayload;
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
 * Uses sha256 hash of: source | service_name | alert_id
 */
const computeFingerprint = (alert: NormalizedAlert): string =>
  computeHash([alert.source, alert.serviceName ?? "", alert.sourceAlertId]);

/**
 * Generates a synthetic delivery ID from alert ID and creation timestamp.
 */
const generateDeliveryId = (alertId: string, createdAt: number): string =>
  computeHash([DELIVERY_ID_PREFIX, alertId, String(createdAt)]);

// ==================== Adapter Implementation ====================

/**
 * Creates an OpsGenie alert source adapter.
 */
export const createOpsGenieAdapter = (): AlertSourcePort => ({
  parseWebhook: (
    body: unknown,
    _headers: Readonly<Record<string, string | string[] | undefined>>
  ): NormalizedAlert => {
    const payload = validatePayload(body);
    const { alert: alertData } = payload;
    const deliveryId = generateDeliveryId(alertData.alertId, alertData.createdAt);
    const serviceName = extractServiceName(alertData);
    const environment = extractEnvironment(alertData.tags);

    const partialAlert: NormalizedAlert = {
      sourceAlertId: alertData.alertId,
      deliveryId,
      source: "opsgenie",
      title: alertData.message,
      description: alertData.description ?? null,
      severity: mapSeverity(alertData.priority),
      fingerprint: "",
      serviceName,
      environment,
      metrics: {},
      labels: extractLabels(alertData, payload),
      receivedAt: new Date().toISOString(),
      sourcePayload: truncateSourcePayload(redactObject(body as Record<string, unknown>)),
    };

    const fingerprint = computeFingerprint(partialAlert);

    logger.info("OpsGenie webhook parsed", {
      provider: "opsgenie",
      operation: "parseWebhook",
      sourceAlertId: alertData.alertId,
      severity: partialAlert.severity,
      serviceName,
    });

    return { ...partialAlert, fingerprint };
  },

  generateFingerprint: computeFingerprint,
});
