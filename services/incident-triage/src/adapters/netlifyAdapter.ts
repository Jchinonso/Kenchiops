/**
 * Netlify Adapter
 *
 * Parses Netlify deploy webhook payloads into normalized alert structures
 * and generates fingerprints for deduplication.
 */

import {
  ValidationError,
  createLogger,
  redactObject,
  NETLIFY_COMMIT_URL_PATTERN,
} from "@kenchi/shared";
import type { AlertSourcePort } from "../ports/alertSourcePort.js";
import type { NormalizedAlert, AlertSeverity } from "../types/incidentTypes.js";
import type { NetlifyDeployPayload } from "../types/netlifyTypes.js";
import { computeHash } from "../helpers/fingerprint.js";

const logger = createLogger("netlify-adapter");

// ==================== Internal Helpers ====================

/**
 * Type guard for Netlify deploy payloads.
 */
const isNetlifyPayload = (payload: unknown): payload is NetlifyDeployPayload =>
  typeof payload === "object" &&
  payload !== null &&
  "id" in payload &&
  "site_id" in payload &&
  "state" in payload &&
  typeof (payload as Record<string, unknown>).state === "string";

/**
 * Validates that the incoming body matches expected Netlify deploy structure.
 */
const validatePayload = (body: unknown): NetlifyDeployPayload => {
  if (!isNetlifyPayload(body)) {
    throw new ValidationError("Invalid Netlify webhook payload: missing required fields", {
      operation: "validatePayload",
    });
  }

  if (!body.id || !body.site_id) {
    throw new ValidationError("Invalid Netlify webhook payload: missing id or site_id", {
      operation: "validatePayload",
    });
  }

  return body;
};

/**
 * Maps Netlify deploy state to severity.
 * state: "error" → high, all other failure states → medium
 */
const mapSeverity = (state: string): AlertSeverity => (state === "error" ? "high" : "medium");

/**
 * Extracts git context labels from Netlify deploy payload.
 */
const extractLabels = (payload: NetlifyDeployPayload): Readonly<Record<string, string>> => {
  const match = payload.commit_url ? NETLIFY_COMMIT_URL_PATTERN.exec(payload.commit_url) : null;
  const owner = match?.[1] ?? "";
  const repo = match?.[2] ?? "";
  const commitSha = payload.commit_ref ?? "";
  const branch = payload.branch ?? "";
  const prNumber =
    payload.review_id !== null && payload.review_id !== undefined ? String(payload.review_id) : "";

  return {
    ...(owner ? { owner } : {}),
    ...(repo ? { repo } : {}),
    ...(commitSha ? { commitSha } : {}),
    ...(branch ? { branch } : {}),
    ...(prNumber ? { prNumber } : {}),
    ...(payload.site_id ? { siteId: payload.site_id } : {}),
  };
};

/**
 * Extracts deployment metrics from Netlify payload.
 */
const extractMetrics = (payload: NetlifyDeployPayload): Readonly<Record<string, unknown>> => ({
  deployUrl: payload.deploy_url,
  ...(payload.deploy_time !== null && payload.deploy_time !== undefined
    ? { deployTime: payload.deploy_time }
    : {}),
  ...(payload.error_message ? { errorMessage: payload.error_message } : {}),
  ...(payload.framework ? { framework: payload.framework } : {}),
});

/**
 * Builds a description from the Netlify deploy payload.
 */
const buildDescription = (payload: NetlifyDeployPayload): string => {
  const errorMsg = payload.error_message ? `: ${payload.error_message}` : "";
  return `Deploy ${payload.id} to ${payload.context} environment failed${errorMsg}. URL: ${payload.deploy_url}`;
};

// ==================== Fingerprint Logic ====================

/**
 * Generates a fingerprint for deduplication.
 * Uses sha256 hash of: netlify | siteId | commitRef
 */
const computeFingerprint = (alert: NormalizedAlert): string => {
  const siteId = alert.labels.siteId ?? "";
  const commitSha = alert.labels.commitSha ?? "";

  return computeHash(["netlify", siteId, commitSha]);
};

// ==================== Adapter Implementation ====================

/**
 * Creates a Netlify alert source adapter.
 */
export const createNetlifyAdapter = (): AlertSourcePort => ({
  parseWebhook: (
    body: unknown,
    _headers: Readonly<Record<string, string | string[] | undefined>>
  ): NormalizedAlert => {
    const payload = validatePayload(body);

    const partialAlert: NormalizedAlert = {
      sourceAlertId: payload.id,
      deliveryId: payload.id,
      source: "netlify",
      title: `Netlify deploy failed: ${payload.name}`,
      description: buildDescription(payload),
      severity: mapSeverity(payload.state),
      fingerprint: "",
      serviceName: payload.name,
      environment: payload.context ?? null,
      metrics: extractMetrics(payload),
      labels: extractLabels(payload),
      receivedAt: new Date().toISOString(),
      sourcePayload: redactObject(body as Record<string, unknown>) as Readonly<
        Record<string, unknown>
      >,
    };

    const fingerprint = computeFingerprint(partialAlert);

    logger.info("Netlify webhook parsed", {
      provider: "netlify",
      operation: "parseWebhook",
      sourceAlertId: payload.id,
      severity: partialAlert.severity,
      serviceName: partialAlert.serviceName,
    });

    return { ...partialAlert, fingerprint };
  },

  generateFingerprint: computeFingerprint,
});
