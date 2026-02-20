/**
 * Datadog Adapter
 *
 * Parses Datadog webhook payloads into normalized alert structures
 * and generates fingerprints for deduplication.
 */

import {
  ValidationError,
  createLogger,
  redactObject,
  DATADOG_FAILURE_STATUSES,
} from "@kenchi/shared";
import type { AlertSourcePort } from "../ports/alertSourcePort.js";
import type { NormalizedAlert, AlertSeverity } from "../types/incidentTypes.js";
import { DATADOG_PRIORITY_MAP, type DatadogWebhookPayload } from "../types/datadogTypes.js";
import { computeHash } from "../helpers/fingerprint.js";

const logger = createLogger("datadog-adapter");

/** Default severity when no priority is available */
const DEFAULT_SEVERITY: AlertSeverity = "medium";

/** Delivery ID prefix for synthetic IDs */
const DELIVERY_ID_PREFIX = "dd";

/** Tag prefix for extracting service name */
const SERVICE_TAG_PREFIX = "service:";

/** Tag prefix for extracting environment */
const ENV_TAG_PREFIX = "env:";

// ==================== Internal Helpers ====================

/**
 * Parses comma-separated tags string into a readonly array.
 */
const parseTags = (tagsString: string | undefined): readonly string[] =>
  tagsString ? tagsString.split(",").map((tag) => tag.trim()) : [];

/**
 * Extracts a tag value by prefix from a list of tags.
 */
const extractTagValue = (tags: readonly string[], prefix: string): string | null => {
  const found = tags.find((tag) => tag.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
};

/**
 * Maps Datadog priority to normalized severity.
 */
const mapSeverity = (priority: string | undefined): AlertSeverity => {
  if (!priority) {
    return DEFAULT_SEVERITY;
  }
  const upperPriority = priority.toUpperCase();
  return DATADOG_PRIORITY_MAP[upperPriority] ?? DEFAULT_SEVERITY;
};

/**
 * Extracts metrics from Datadog payload fields.
 */
const extractMetrics = (payload: DatadogWebhookPayload): Readonly<Record<string, unknown>> => ({
  ...(payload.$ALERT_METRIC ? { metric: payload.$ALERT_METRIC } : {}),
  ...(payload.$ALERT_QUERY ? { query: payload.$ALERT_QUERY } : {}),
  ...(payload.$ALERT_SCOPE ? { scope: payload.$ALERT_SCOPE } : {}),
});

/**
 * Extracts labels from Datadog payload.
 */
const extractLabels = (
  payload: DatadogWebhookPayload,
  tags: readonly string[]
): Readonly<Record<string, string>> => ({
  dd_alert_status: payload.$ALERT_STATUS,
  ...(payload.$HOSTNAME ? { dd_hostname: payload.$HOSTNAME } : {}),
  ...(payload.$ORG_NAME ? { dd_org_name: payload.$ORG_NAME } : {}),
  ...Object.fromEntries(
    tags.map((tag) => {
      const [key, ...valueParts] = tag.split(":");
      return [`dd_tag_${key}`, valueParts.join(":") || "true"];
    })
  ),
});

/**
 * Validates that the incoming body matches expected Datadog webhook structure.
 */
const validatePayload = (body: unknown): DatadogWebhookPayload => {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Invalid Datadog webhook payload: body is not an object", {
      operation: "validatePayload",
    });
  }

  const payload = body as Record<string, unknown>;

  if (!payload.$ALERT_ID || typeof payload.$ALERT_ID !== "string") {
    throw new ValidationError("Invalid Datadog webhook payload: missing $ALERT_ID", {
      operation: "validatePayload",
    });
  }

  if (!payload.$ALERT_TITLE || typeof payload.$ALERT_TITLE !== "string") {
    throw new ValidationError("Invalid Datadog webhook payload: missing $ALERT_TITLE", {
      operation: "validatePayload",
    });
  }

  if (!payload.$ALERT_STATUS || typeof payload.$ALERT_STATUS !== "string") {
    throw new ValidationError("Invalid Datadog webhook payload: missing $ALERT_STATUS", {
      operation: "validatePayload",
    });
  }

  // Only process failure statuses — skip recovered/resolved alerts
  if (!DATADOG_FAILURE_STATUSES.has(payload.$ALERT_STATUS as string)) {
    throw new ValidationError("Datadog alert is not a failure status -- skipping triage", {
      operation: "validatePayload",
      metadata: { status: payload.$ALERT_STATUS },
    });
  }

  return body as DatadogWebhookPayload;
};

// ==================== Fingerprint Logic ====================

/**
 * Generates a fingerprint for deduplication.
 * Uses sha256 hash of: source | service_name | hostname | alert_id
 */
const computeFingerprint = (alert: NormalizedAlert): string => {
  const hostname = alert.labels.dd_hostname ?? "";

  return computeHash([alert.source, alert.serviceName ?? "", hostname, alert.sourceAlertId]);
};

/**
 * Generates a synthetic delivery ID from alert ID and date.
 */
const generateDeliveryId = (alertId: string, date: string): string =>
  computeHash([DELIVERY_ID_PREFIX, alertId, date]);

// ==================== Adapter Implementation ====================

/**
 * Creates a Datadog alert source adapter.
 */
export const createDatadogAdapter = (): AlertSourcePort => ({
  parseWebhook: (
    body: unknown,
    _headers: Readonly<Record<string, string | string[] | undefined>>
  ): NormalizedAlert => {
    const payload = validatePayload(body);
    const tags = parseTags(payload.$TAGS);
    const serviceName = extractTagValue(tags, SERVICE_TAG_PREFIX);
    const environment = extractTagValue(tags, ENV_TAG_PREFIX);
    const dateString = payload.$DATE ?? new Date().toISOString();
    const deliveryId = generateDeliveryId(payload.$ALERT_ID, dateString);

    const partialAlert: NormalizedAlert = {
      sourceAlertId: payload.$ALERT_ID,
      deliveryId,
      source: "datadog",
      title: payload.$ALERT_TITLE,
      description: payload.$ALERT_BODY ?? null,
      severity: mapSeverity(payload.$PRIORITY),
      fingerprint: "",
      serviceName,
      environment,
      metrics: extractMetrics(payload),
      labels: extractLabels(payload, tags),
      receivedAt: new Date().toISOString(),
      sourcePayload: redactObject(body as Record<string, unknown>) as Readonly<
        Record<string, unknown>
      >,
    };

    const fingerprint = computeFingerprint(partialAlert);

    logger.info("Datadog webhook parsed", {
      provider: "datadog",
      operation: "parseWebhook",
      sourceAlertId: payload.$ALERT_ID,
      severity: partialAlert.severity,
      serviceName,
    });

    return { ...partialAlert, fingerprint };
  },

  generateFingerprint: computeFingerprint,
});
