/**
 * PagerDuty Adapter
 *
 * Parses PagerDuty webhook v3 payloads into normalized alert structures
 * and generates fingerprints for deduplication.
 */

import crypto from "crypto";
import { ValidationError, createLogger } from "@kenchi/shared";
import type { AlertSourcePort } from "../ports/alertSourcePort.js";
import type { NormalizedAlert, AlertSeverity } from "../types/incidentTypes.js";
import {
  PAGERDUTY_PRIORITY_MAP,
  PAGERDUTY_URGENCY_MAP,
  type PagerDutyWebhookV3Event,
  type PagerDutyIncidentData,
} from "../types/pagerDutyTypes.js";

const logger = createLogger("pagerduty-adapter");

/** PagerDuty delivery ID header */
const PAGERDUTY_DELIVERY_HEADER = "x-webhook-id";

/** Default severity when no priority or urgency is available */
const DEFAULT_SEVERITY: AlertSeverity = "medium";

/** Fingerprint hash algorithm */
const FINGERPRINT_ALGORITHM = "sha256";

/** Fingerprint separator */
const FINGERPRINT_SEPARATOR = "|";

/** Fingerprint hash encoding length (hex substring) */
const FINGERPRINT_HASH_LENGTH = 40;

// ==================== Internal Helpers ====================

/**
 * Extracts the delivery ID from PagerDuty webhook headers.
 */
const extractDeliveryId = (
  headers: Readonly<Record<string, string | string[] | undefined>>
): string => {
  const deliveryId = headers[PAGERDUTY_DELIVERY_HEADER];
  if (!deliveryId || typeof deliveryId !== "string") {
    throw new ValidationError("Missing PagerDuty delivery ID header", {
      operation: "extractDeliveryId",
      metadata: { header: PAGERDUTY_DELIVERY_HEADER },
    });
  }
  return deliveryId;
};

/**
 * Maps PagerDuty priority/urgency to normalized severity.
 */
const mapSeverity = (data: PagerDutyIncidentData): AlertSeverity => {
  // Prefer explicit priority
  const priorityName = data.priority?.name?.toUpperCase() ?? "";
  const prioritySeverity = PAGERDUTY_PRIORITY_MAP[priorityName];
  if (prioritySeverity) {
    return prioritySeverity as AlertSeverity;
  }

  // Fall back to urgency
  const urgency = data.urgency ?? "";
  const urgencySeverity = PAGERDUTY_URGENCY_MAP[urgency];
  if (urgencySeverity) {
    return urgencySeverity as AlertSeverity;
  }

  return DEFAULT_SEVERITY;
};

/**
 * Extracts environment from PagerDuty custom details.
 */
const extractEnvironment = (data: PagerDutyIncidentData): string | null => {
  const customDetails = data.body?.cef_details?.custom_details;
  if (!customDetails) {
    return null;
  }

  // Check common environment field names
  const envValue = customDetails.environment ?? customDetails.env ?? customDetails.stage ?? null;

  return typeof envValue === "string" ? envValue : null;
};

/**
 * Extracts metrics from PagerDuty custom details.
 */
const extractMetrics = (data: PagerDutyIncidentData): Readonly<Record<string, unknown>> => {
  const customDetails = data.body?.cef_details?.custom_details;
  return customDetails ?? {};
};

/**
 * Extracts labels from PagerDuty incident data.
 */
const extractLabels = (data: PagerDutyIncidentData): Readonly<Record<string, string>> => {
  const labels: Record<string, string> = {};

  if (data.service?.id) {
    labels.pd_service_id = data.service.id;
  }
  if (data.service?.summary) {
    labels.pd_service_name = data.service.summary;
  }
  if (data.escalation_policy?.summary) {
    labels.pd_escalation_policy = data.escalation_policy.summary;
  }
  if (data.urgency) {
    labels.pd_urgency = data.urgency;
  }
  if (data.body?.cef_details?.class) {
    labels.pd_alert_class = data.body.cef_details.class;
  }

  return labels;
};

/**
 * Validates that the incoming body matches expected PagerDuty v3 structure.
 */
const validatePayload = (body: unknown): PagerDutyWebhookV3Event => {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Invalid PagerDuty webhook payload: body is not an object", {
      operation: "validatePayload",
    });
  }

  const payload = body as Record<string, unknown>;

  if (!payload.event || typeof payload.event !== "object") {
    throw new ValidationError("Invalid PagerDuty webhook payload: missing event object", {
      operation: "validatePayload",
    });
  }

  const eventObj = payload.event as Record<string, unknown>;

  if (!eventObj.data || typeof eventObj.data !== "object") {
    throw new ValidationError("Invalid PagerDuty webhook payload: missing event.data", {
      operation: "validatePayload",
    });
  }

  const data = eventObj.data as Record<string, unknown>;

  if (!data.id || typeof data.id !== "string") {
    throw new ValidationError("Invalid PagerDuty webhook payload: missing event.data.id", {
      operation: "validatePayload",
    });
  }

  if (!data.title || typeof data.title !== "string") {
    throw new ValidationError("Invalid PagerDuty webhook payload: missing event.data.title", {
      operation: "validatePayload",
    });
  }

  return body as PagerDutyWebhookV3Event;
};

// ==================== Fingerprint Logic ====================

/**
 * Generates a fingerprint for deduplication from alert labels.
 * Uses sha256 hash of: source | service_name | pd_service_id | pd_alert_class
 */
const computeFingerprint = (alert: NormalizedAlert): string => {
  const pdServiceId = (alert.labels as Record<string, string>).pd_service_id ?? "";
  const alertClass = (alert.labels as Record<string, string>).pd_alert_class ?? "";

  const components = [alert.source, alert.serviceName ?? "", pdServiceId, alertClass].join(
    FINGERPRINT_SEPARATOR
  );

  return crypto
    .createHash(FINGERPRINT_ALGORITHM)
    .update(components)
    .digest("hex")
    .substring(0, FINGERPRINT_HASH_LENGTH);
};

// ==================== Adapter Implementation ====================

/**
 * Creates a PagerDuty alert source adapter.
 */
export const createPagerDutyAdapter = (): AlertSourcePort => ({
  parseWebhook: (
    body: unknown,
    headers: Readonly<Record<string, string | string[] | undefined>>
  ): NormalizedAlert => {
    const payload = validatePayload(body);
    const { event } = payload;
    const { data } = event;
    const deliveryId = extractDeliveryId(headers);

    const partialAlert: NormalizedAlert = {
      sourceAlertId: data.id,
      deliveryId,
      source: "pagerduty",
      title: data.title,
      description: data.description ?? null,
      severity: mapSeverity(data),
      fingerprint: "",
      serviceName: data.service?.summary ?? null,
      environment: extractEnvironment(data),
      metrics: extractMetrics(data),
      labels: extractLabels(data),
      receivedAt: new Date().toISOString(),
      sourcePayload: body as Readonly<Record<string, unknown>>,
    };

    const fingerprint = computeFingerprint(partialAlert);

    logger.info("PagerDuty webhook parsed", {
      provider: "pagerduty",
      operation: "parseWebhook",
      sourceAlertId: data.id,
      severity: partialAlert.severity,
      serviceName: partialAlert.serviceName,
    });

    return { ...partialAlert, fingerprint };
  },

  generateFingerprint: computeFingerprint,
});
