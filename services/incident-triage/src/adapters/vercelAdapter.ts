/**
 * Vercel Adapter
 *
 * Parses Vercel deployment webhook payloads into normalized alert structures
 * and generates fingerprints for deduplication.
 */

import crypto from "crypto";
import {
  ValidationError,
  createLogger,
  redactObject,
  VERCEL_DEPLOYMENT_EVENTS,
} from "@kenchi/shared";
import type { AlertSourcePort } from "../ports/alertSourcePort.js";
import type { NormalizedAlert, AlertSeverity } from "../types/incidentTypes.js";
import type { VercelWebhook, VercelDeploymentPayload } from "../types/vercelTypes.js";

const logger = createLogger("vercel-adapter");

/** Fingerprint hash algorithm */
const FINGERPRINT_ALGORITHM = "sha256";

/** Fingerprint separator */
const FINGERPRINT_SEPARATOR = "|";

/** Fingerprint hash encoding length (hex substring) */
const FINGERPRINT_HASH_LENGTH = 40;

// ==================== Internal Helpers ====================

/**
 * Type guard for Vercel webhook payloads.
 */
const isVercelWebhook = (payload: unknown): payload is VercelWebhook =>
  typeof payload === "object" &&
  payload !== null &&
  "type" in payload &&
  "id" in payload &&
  "payload" in payload &&
  typeof (payload as Record<string, unknown>).type === "string" &&
  typeof (payload as Record<string, unknown>).id === "string";

/**
 * Validates that the incoming body matches expected Vercel webhook structure.
 */
const validatePayload = (body: unknown): VercelWebhook => {
  if (!isVercelWebhook(body)) {
    throw new ValidationError("Invalid Vercel webhook payload: missing required fields", {
      operation: "validatePayload",
    });
  }

  const { payload } = body;
  if (!payload || typeof payload !== "object") {
    throw new ValidationError("Invalid Vercel webhook payload: missing payload object", {
      operation: "validatePayload",
    });
  }

  const deploymentPayload = payload as VercelDeploymentPayload;
  if (!deploymentPayload.deployment || typeof deploymentPayload.deployment !== "object") {
    throw new ValidationError("Invalid Vercel webhook payload: missing payload.deployment", {
      operation: "validatePayload",
    });
  }

  return body;
};

/**
 * Maps Vercel deployment event type to severity.
 * deployment.error -> high, deployment.canceled -> medium
 */
const mapSeverity = (eventType: string): AlertSeverity =>
  eventType === VERCEL_DEPLOYMENT_EVENTS.ERROR ? "high" : "medium";

/**
 * Extracts git context labels from Vercel deployment metadata.
 */
const extractLabels = (webhook: VercelWebhook): Readonly<Record<string, string>> => {
  const { meta } = webhook.payload.deployment;
  const teamId = webhook.payload.team?.id ?? "";
  const projectId = webhook.payload.project.id;
  const owner = meta.githubOrg ?? meta.githubCommitOrg ?? "";
  const repo = meta.githubRepo ?? meta.githubCommitRepo ?? "";
  const commitSha = meta.githubCommitSha ?? meta.gitCommitSha ?? "";
  const branch = meta.githubCommitRef ?? meta.gitBranch ?? "";
  const prId = meta.githubPrId ?? "";

  return {
    ...(owner ? { owner } : {}),
    ...(repo ? { repo } : {}),
    ...(commitSha ? { commitSha } : {}),
    ...(branch ? { branch } : {}),
    ...(prId ? { prNumber: prId } : {}),
    ...(teamId ? { teamId } : {}),
    ...(projectId ? { projectId } : {}),
  };
};

/**
 * Extracts deployment metrics from webhook payload.
 */
const extractMetrics = (webhook: VercelWebhook): Readonly<Record<string, unknown>> => ({
  deploymentUrl: webhook.payload.deployment.url,
  region: webhook.region,
});

/**
 * Builds a description from the Vercel webhook.
 */
const buildDescription = (webhook: VercelWebhook): string => {
  const { deployment } = webhook.payload;
  const target = webhook.payload.target ?? "unknown";
  return `Deployment ${deployment.id} to ${target} environment failed. URL: ${deployment.url}`;
};

// ==================== Fingerprint Logic ====================

/**
 * Generates a fingerprint for deduplication.
 * Uses sha256 hash of: vercel | projectId | commitSha
 */
const computeFingerprint = (alert: NormalizedAlert): string => {
  const labels = alert.labels as Record<string, string>;
  const projectId = labels.projectId ?? "";
  const commitSha = labels.commitSha ?? "";

  const components = ["vercel", projectId, commitSha].join(FINGERPRINT_SEPARATOR);

  return crypto
    .createHash(FINGERPRINT_ALGORITHM)
    .update(components)
    .digest("hex")
    .substring(0, FINGERPRINT_HASH_LENGTH);
};

// ==================== Adapter Implementation ====================

/**
 * Creates a Vercel alert source adapter.
 */
export const createVercelAdapter = (): AlertSourcePort => ({
  parseWebhook: (
    body: unknown,
    _headers: Readonly<Record<string, string | string[] | undefined>>
  ): NormalizedAlert => {
    const webhook = validatePayload(body);
    const { deployment } = webhook.payload;
    const deliveryId = webhook.id;

    if (!deliveryId) {
      throw new ValidationError("Missing Vercel webhook ID", {
        operation: "parseWebhook",
      });
    }

    const partialAlert: NormalizedAlert = {
      sourceAlertId: deployment.id,
      deliveryId,
      source: "vercel",
      title: `Vercel deployment failed: ${deployment.name}`,
      description: buildDescription(webhook),
      severity: mapSeverity(webhook.type),
      fingerprint: "",
      serviceName: deployment.name,
      environment: webhook.payload.target ?? null,
      metrics: extractMetrics(webhook),
      labels: extractLabels(webhook),
      receivedAt: new Date().toISOString(),
      sourcePayload: redactObject(body as Record<string, unknown>) as Readonly<
        Record<string, unknown>
      >,
    };

    const fingerprint = computeFingerprint(partialAlert);

    logger.info("Vercel webhook parsed", {
      provider: "vercel",
      operation: "parseWebhook",
      sourceAlertId: deployment.id,
      severity: partialAlert.severity,
      serviceName: partialAlert.serviceName,
    });

    return { ...partialAlert, fingerprint };
  },

  generateFingerprint: computeFingerprint,
});
