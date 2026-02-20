/**
 * Prometheus Alertmanager Adapter
 *
 * Parses Prometheus Alertmanager webhook payloads into normalized alert
 * structures and generates fingerprints for deduplication.
 */

import crypto from "crypto";
import {
  ValidationError,
  createLogger,
  redactObject,
  PROMETHEUS_ALERT_STATUSES,
  PROMETHEUS_WEBHOOK_VERSION,
} from "@kenchi/shared";
import type { AlertSourcePort } from "../ports/alertSourcePort.js";
import type { NormalizedAlert, AlertSeverity } from "../types/incidentTypes.js";
import {
  PROMETHEUS_SEVERITY_MAP,
  type PrometheusAlertmanagerPayload,
} from "../types/prometheusTypes.js";

const logger = createLogger("prometheus-adapter");

/** Default severity when no severity label is available */
const DEFAULT_SEVERITY: AlertSeverity = "medium";

/** Fingerprint hash algorithm */
const FINGERPRINT_ALGORITHM = "sha256";

/** Fingerprint separator */
const FINGERPRINT_SEPARATOR = "|";

/** Fingerprint hash encoding length (hex substring) */
const FINGERPRINT_HASH_LENGTH = 40;

/** Delivery ID prefix for synthetic IDs */
const DELIVERY_ID_PREFIX = "prometheus";

// ==================== Internal Helpers ====================

/**
 * Maps Prometheus severity label to normalized severity.
 * Checks commonLabels first, then falls back to first alert's labels.
 */
const mapSeverity = (payload: PrometheusAlertmanagerPayload): AlertSeverity => {
  const severityLabel =
    payload.commonLabels.severity ??
    (payload.alerts.length > 0 ? payload.alerts[0].labels.severity : undefined);

  if (!severityLabel) {
    return DEFAULT_SEVERITY;
  }

  return PROMETHEUS_SEVERITY_MAP[severityLabel.toLowerCase()] ?? DEFAULT_SEVERITY;
};

/**
 * Extracts environment from Prometheus labels.
 */
const extractEnvironment = (payload: PrometheusAlertmanagerPayload): string | null =>
  payload.commonLabels.env ??
  payload.commonLabels.environment ??
  (payload.alerts.length > 0
    ? (payload.alerts[0].labels.env ?? payload.alerts[0].labels.environment ?? null)
    : null);

/**
 * Extracts labels from Prometheus payload.
 */
const extractLabels = (
  payload: PrometheusAlertmanagerPayload
): Readonly<Record<string, string>> => ({
  ...payload.commonLabels,
  prometheus_receiver: payload.receiver,
  prometheus_group_key: payload.groupKey,
});

/**
 * Builds a title from the payload.
 */
const buildTitle = (payload: PrometheusAlertmanagerPayload): string => {
  const alertName = payload.commonLabels.alertname;
  if (alertName) {
    return `Prometheus Alert: ${alertName}`;
  }
  return `Prometheus Alert from ${payload.receiver}`;
};

/**
 * Builds a description from annotations.
 */
const buildDescription = (payload: PrometheusAlertmanagerPayload): string | null =>
  payload.commonAnnotations.description ?? payload.commonAnnotations.summary ?? null;

/**
 * Validates that the incoming body matches expected Alertmanager webhook structure.
 * Only processes "firing" alerts — throws ValidationError for "resolved".
 */
const validatePayload = (body: unknown): PrometheusAlertmanagerPayload => {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Invalid Prometheus webhook payload: body is not an object", {
      operation: "validatePayload",
    });
  }

  const payload = body as Record<string, unknown>;

  if (!payload.status || typeof payload.status !== "string") {
    throw new ValidationError("Invalid Prometheus webhook payload: missing status", {
      operation: "validatePayload",
    });
  }

  if (payload.status === PROMETHEUS_ALERT_STATUSES.RESOLVED) {
    throw new ValidationError("Prometheus alert is resolved -- skipping triage", {
      operation: "validatePayload",
      metadata: { status: payload.status },
    });
  }

  if (payload.version && payload.version !== PROMETHEUS_WEBHOOK_VERSION) {
    throw new ValidationError(`Unsupported Prometheus webhook version: ${payload.version}`, {
      operation: "validatePayload",
      metadata: { version: payload.version },
    });
  }

  if (!payload.groupKey || typeof payload.groupKey !== "string") {
    throw new ValidationError("Invalid Prometheus webhook payload: missing groupKey", {
      operation: "validatePayload",
    });
  }

  if (!Array.isArray(payload.alerts) || payload.alerts.length === 0) {
    throw new ValidationError("Invalid Prometheus webhook payload: missing or empty alerts array", {
      operation: "validatePayload",
    });
  }

  const firstAlert = payload.alerts[0] as Record<string, unknown>;
  if (!firstAlert.fingerprint || typeof firstAlert.fingerprint !== "string") {
    throw new ValidationError("Invalid Prometheus webhook payload: missing alerts[0].fingerprint", {
      operation: "validatePayload",
    });
  }

  return body as PrometheusAlertmanagerPayload;
};

// ==================== Fingerprint Logic ====================

/**
 * Generates a fingerprint for deduplication.
 * Uses sha256 hash of: source | service_name | alertname | instance
 */
const computeFingerprint = (alert: NormalizedAlert): string => {
  const alertname = (alert.labels as Record<string, string>).alertname ?? "";
  const instance = (alert.labels as Record<string, string>).instance ?? "";

  const components = [alert.source, alert.serviceName ?? "", alertname, instance].join(
    FINGERPRINT_SEPARATOR
  );

  return crypto
    .createHash(FINGERPRINT_ALGORITHM)
    .update(components)
    .digest("hex")
    .substring(0, FINGERPRINT_HASH_LENGTH);
};

/**
 * Generates a synthetic delivery ID from groupKey, fingerprint, and timestamp.
 */
const generateDeliveryId = (groupKey: string, alertFingerprint: string): string => {
  const components = [DELIVERY_ID_PREFIX, groupKey, alertFingerprint, String(Date.now())].join(
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
 * Creates a Prometheus Alertmanager alert source adapter.
 */
export const createPrometheusAdapter = (): AlertSourcePort => ({
  parseWebhook: (
    body: unknown,
    _headers: Readonly<Record<string, string | string[] | undefined>>
  ): NormalizedAlert => {
    const payload = validatePayload(body);
    const firstAlert = payload.alerts[0];
    const serviceName = payload.commonLabels.service ?? payload.commonLabels.job ?? null;
    const deliveryId = generateDeliveryId(payload.groupKey, firstAlert.fingerprint);

    const partialAlert: NormalizedAlert = {
      sourceAlertId: firstAlert.fingerprint,
      deliveryId,
      source: "prometheus",
      title: buildTitle(payload),
      description: buildDescription(payload),
      severity: mapSeverity(payload),
      fingerprint: "",
      serviceName,
      environment: extractEnvironment(payload),
      metrics: {},
      labels: extractLabels(payload),
      receivedAt: new Date().toISOString(),
      sourcePayload: redactObject(body as Record<string, unknown>) as Readonly<
        Record<string, unknown>
      >,
    };

    const fingerprint = computeFingerprint(partialAlert);

    logger.info("Prometheus webhook parsed", {
      provider: "prometheus",
      operation: "parseWebhook",
      sourceAlertId: firstAlert.fingerprint,
      severity: partialAlert.severity,
      serviceName,
      groupKey: payload.groupKey,
    });

    return { ...partialAlert, fingerprint };
  },

  generateFingerprint: computeFingerprint,
});
