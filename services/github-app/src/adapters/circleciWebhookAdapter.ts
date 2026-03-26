/**
 * CircleCI Webhook Adapter
 *
 * Implements CIWebhookPort for CircleCI job webhooks.
 * Validates the circleci-signature header (HMAC-SHA256, v1=<hex>)
 * and normalizes job payloads to NormalizedBuildEvent.
 *
 * @module adapters/circleciWebhookAdapter
 */

import crypto from "crypto";
import {
  createLogger,
  CI_PROVIDERS,
  CIRCLECI_SIGNATURE_PREFIX,
  CIRCLECI_FAILURE_STATUSES,
  type CIWebhookPort,
  type NormalizedBuildEvent,
  type RequestContext,
} from "@kenchi/shared";
import type { CircleCIWebhookPayload } from "../types/circleciTypes.js";

const logger = createLogger("circleci-webhook");

// ==================== Type Guard ====================

const isCircleCIWebhookPayload = (payload: unknown): payload is CircleCIWebhookPayload => {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }

  const candidate = payload as Record<string, unknown>;

  return (
    typeof candidate.type === "string" &&
    typeof candidate.id === "string" &&
    typeof candidate.happened_at === "string" &&
    typeof candidate.job === "object" &&
    candidate.job !== null &&
    typeof candidate.project === "object" &&
    candidate.project !== null &&
    typeof candidate.pipeline === "object" &&
    candidate.pipeline !== null
  );
};

// ==================== Helpers ====================

/**
 * Extract owner/repo from a CircleCI project slug.
 *
 * CircleCI project slugs follow the format: `gh/<owner>/<repo>` or `bb/<owner>/<repo>`.
 * Falls back to organization name and project name if slug parsing fails.
 */
const extractRepositoryInfo = (
  payload: CircleCIWebhookPayload
): { readonly fullName: string; readonly owner: string; readonly name: string } => {
  const { slug } = payload.project;
  // slug format: "gh/owner/repo" or "bb/owner/repo" or "circleci/<id>/..."
  const parts = slug.split("/");

  if (parts.length >= 3) {
    const owner = parts[1];
    const name = parts.slice(2).join("/");
    return { fullName: `${owner}/${name}`, owner, name };
  }

  // Fallback to organization name + project name
  return {
    fullName: `${payload.organization.name}/${payload.project.name}`,
    owner: payload.organization.name,
    name: payload.project.name,
  };
};

/**
 * Extract the commit SHA from the pipeline VCS data.
 * Returns empty string if no VCS revision is available (manual trigger).
 */
const extractCommitSha = (payload: CircleCIWebhookPayload): string =>
  payload.pipeline.vcs?.revision ?? "";

/**
 * Extract the branch from the pipeline VCS data.
 */
const extractBranch = (payload: CircleCIWebhookPayload): string | undefined =>
  payload.pipeline.vcs?.branch ?? undefined;

// ==================== Adapter ====================

export const circleciWebhookAdapter: CIWebhookPort = {
  verifySignature: (rawBody: Buffer, signature: string, secret: string): boolean => {
    // CircleCI signature format: "v1=<hex-digest>"
    if (!signature.startsWith(CIRCLECI_SIGNATURE_PREFIX)) {
      logger.warn("Invalid CircleCI signature prefix", {
        provider: "circleci",
        operation: "verifySignature",
      });
      return false;
    }

    const expectedSignature = signature.slice(CIRCLECI_SIGNATURE_PREFIX.length);
    const computedSignature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

    try {
      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature, "hex"),
        Buffer.from(computedSignature, "hex")
      );
    } catch {
      // timingSafeEqual throws if buffer lengths differ -- treat as invalid signature
      return false;
    }
  },

  normalizeEvent: (payload: unknown, _context: RequestContext): NormalizedBuildEvent | null => {
    if (!isCircleCIWebhookPayload(payload)) {
      return null;
    }

    const repoInfo = extractRepositoryInfo(payload);
    const commitSha = extractCommitSha(payload);

    // Skip events without a commit SHA (e.g., manual pipeline triggers without VCS)
    if (!commitSha) {
      return null;
    }

    const conclusion = CIRCLECI_FAILURE_STATUSES.has(payload.job.status)
      ? "failure"
      : payload.job.status;

    return {
      provider: CI_PROVIDERS.CIRCLECI,
      buildId: payload.job.id,
      buildName: payload.job.name,
      conclusion,
      commitSha,
      branch: extractBranch(payload),
      repository: repoInfo,
      pullRequestNumbers: [],
      installationId: 0,
      timestamp: new Date(payload.happened_at),
      metadata: {
        pipelineId: payload.pipeline.id,
        pipelineNumber: payload.pipeline.number,
        workflowId: payload.workflow.id,
        workflowName: payload.workflow.name,
        jobNumber: payload.job.number,
        projectSlug: payload.project.slug,
      },
    };
  },

  isFailureEvent: (payload: unknown): boolean => {
    if (!isCircleCIWebhookPayload(payload)) {
      return false;
    }
    return CIRCLECI_FAILURE_STATUSES.has(payload.job.status);
  },
};
