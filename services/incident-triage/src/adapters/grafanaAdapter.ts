/**
 * Grafana Adapter
 *
 * Parses Grafana unified alerting webhook payloads into normalized alert
 * structures and generates fingerprints for deduplication.
 */

import crypto from "crypto";
import {
  ValidationError,
  createLogger,
  redactObject,
  GRAFANA_ALERT_STATUSES,
} from "@kenchi/shared";
import type { AlertSourcePort } from "../ports/alertSourcePort.js";
import type { NormalizedAlert, AlertSeverity } from "../types/incidentTypes.js";
import { GRAFANA_SEVERITY_MAP, type GrafanaWebhookPayload } from "../types/grafanaTypes.js";

const logger = createLogger("grafana-adapter");

/** Default severity when no severity label is available */
const DEFAULT_SEVERITY: AlertSeverity = "medium";

/** Fingerprint hash algorithm */
const FINGERPRINT_ALGORITHM = "sha256";

/** Fingerprint separator */
const FINGERPRINT_SEPARATOR = "|";

/** Fingerprint hash encoding length (hex substring) */
const FINGERPRINT_HASH_LENGTH = 40;

/** Delivery ID prefix for synthetic IDs */
const DELIVERY_ID_PREFIX = "grafana";

// ==================== Internal Helpers ====================

/**
 * Maps Grafana severity label to normalized severity.
 * Checks commonLabels first, then falls back to first alert's labels.
 */
const mapSeverity = (payload: GrafanaWebhookPayload): AlertSeverity => {
  const severityLabel =
    payload.commonLabels.severity ??
    (payload.alerts.length > 0 ? payload.alerts[0].labels.severity : undefined);

  if (!severityLabel) {
    return DEFAULT_SEVERITY;
  }

  return GRAFANA_SEVERITY_MAP[severityLabel.toLowerCase()] ?? DEFAULT_SEVERITY;
};

/**
 * Extracts environment from Grafana labels.
 */
const extractEnvironment = (payload: GrafanaWebhookPayload): string | null =>
  payload.commonLabels.env ??
  payload.commonLabels.environment ??
  (payload.alerts.length > 0
    ? (payload.alerts[0].labels.env ?? payload.alerts[0].labels.environment ?? null)
    : null);

/**
 * Extracts metrics from the first alert's values map.
 */
const extractMetrics = (payload: GrafanaWebhookPayload): Readonly<Record<string, unknown>> => {
  if (payload.alerts.length > 0 && payload.alerts[0].values) {
    return payload.alerts[0].values;
  }
  return {};
};

/**
 * Extracts labels from Grafana payload.
 */
const extractLabels = (payload: GrafanaWebhookPayload): Readonly<Record<string, string>> => ({
  ...payload.commonLabels,
  grafana_receiver: payload.receiver,
  grafana_org_id: String(payload.orgId),
  ...(payload.groupKey ? { grafana_group_key: payload.groupKey } : {}),
});

/**
 * Builds a title from the payload.
 */
const buildTitle = (payload: GrafanaWebhookPayload): string => {
  if (payload.title) {
    return payload.title;
  }

  const alertName = payload.commonLabels.alertname;
  if (alertName) {
    return `Grafana Alert: ${alertName}`;
  }

  return `Grafana Alert from ${payload.receiver}`;
};

/**
 * Builds a description from annotations.
 */
const buildDescription = (payload: GrafanaWebhookPayload): string | null =>
  payload.commonAnnotations.description ??
  payload.commonAnnotations.summary ??
  payload.message ??
  null;

/**
 * Validates that the incoming body matches expected Grafana alerting structure.
 * Only processes "firing" alerts — throws ValidationError for "resolved".
 */
const validatePayload = (body: unknown): GrafanaWebhookPayload => {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Invalid Grafana webhook payload: body is not an object", {
      operation: "validatePayload",
    });
  }

  const payload = body as Record<string, unknown>;

  if (!payload.status || typeof payload.status !== "string") {
    throw new ValidationError("Invalid Grafana webhook payload: missing status", {
      operation: "validatePayload",
    });
  }

  if (payload.status === GRAFANA_ALERT_STATUSES.RESOLVED) {
    throw new ValidationError("Grafana alert is resolved -- skipping triage", {
      operation: "validatePayload",
      metadata: { status: payload.status },
    });
  }

  if (!Array.isArray(payload.alerts) || payload.alerts.length === 0) {
    throw new ValidationError("Invalid Grafana webhook payload: missing or empty alerts array", {
      operation: "validatePayload",
    });
  }

  const firstAlert = payload.alerts[0] as Record<string, unknown>;
  if (!firstAlert.fingerprint || typeof firstAlert.fingerprint !== "string") {
    throw new ValidationError("Invalid Grafana webhook payload: missing alerts[0].fingerprint", {
      operation: "validatePayload",
    });
  }

  if (payload.orgId === undefined || typeof payload.orgId !== "number") {
    throw new ValidationError("Invalid Grafana webhook payload: missing orgId", {
      operation: "validatePayload",
    });
  }

  return body as GrafanaWebhookPayload;
};

// ==================== Fingerprint Logic ====================

/**
 * Generates a fingerprint for deduplication.
 * Uses sha256 hash of: source | service_name | orgId | alertname
 */
const computeFingerprint = (alert: NormalizedAlert): string => {
  const alertname = (alert.labels as Record<string, string>).alertname ?? "";
  const orgId = (alert.labels as Record<string, string>).grafana_org_id ?? "";

  const components = [alert.source, alert.serviceName ?? "", orgId, alertname].join(
    FINGERPRINT_SEPARATOR
  );

  return crypto
    .createHash(FINGERPRINT_ALGORITHM)
    .update(components)
    .digest("hex")
    .substring(0, FINGERPRINT_HASH_LENGTH);
};

/**
 * Generates a synthetic delivery ID from orgId, fingerprint, and timestamp.
 */
const generateDeliveryId = (orgId: number, alertFingerprint: string): string => {
  const components = [DELIVERY_ID_PREFIX, String(orgId), alertFingerprint, String(Date.now())].join(
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
 * Creates a Grafana alert source adapter.
 */
export const createGrafanaAdapter = (): AlertSourcePort => ({
  parseWebhook: (
    body: unknown,
    _headers: Readonly<Record<string, string | string[] | undefined>>
  ): NormalizedAlert => {
    const payload = validatePayload(body);
    const firstAlert = payload.alerts[0];
    const serviceName = payload.commonLabels.service ?? payload.commonLabels.job ?? null;
    const deliveryId = generateDeliveryId(payload.orgId, firstAlert.fingerprint);

    const partialAlert: NormalizedAlert = {
      sourceAlertId: firstAlert.fingerprint,
      deliveryId,
      source: "grafana",
      title: buildTitle(payload),
      description: buildDescription(payload),
      severity: mapSeverity(payload),
      fingerprint: "",
      serviceName,
      environment: extractEnvironment(payload),
      metrics: extractMetrics(payload),
      labels: extractLabels(payload),
      receivedAt: new Date().toISOString(),
      sourcePayload: redactObject(body as Record<string, unknown>) as Readonly<
        Record<string, unknown>
      >,
    };

    const fingerprint = computeFingerprint(partialAlert);

    logger.info("Grafana webhook parsed", {
      provider: "grafana",
      operation: "parseWebhook",
      sourceAlertId: firstAlert.fingerprint,
      severity: partialAlert.severity,
      serviceName,
      orgId: payload.orgId,
    });

    return { ...partialAlert, fingerprint };
  },

  generateFingerprint: computeFingerprint,
});
