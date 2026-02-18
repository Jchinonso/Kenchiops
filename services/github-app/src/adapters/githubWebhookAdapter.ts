/**
 * GitHub Actions Webhook Adapter
 *
 * Implements CIWebhookPort for GitHub Actions check_run webhooks.
 * Wraps existing signature verification and event normalization logic.
 *
 * @module adapters/githubWebhookAdapter
 */

import crypto from "crypto";
import {
  CI_PROVIDERS,
  GITHUB_SIGNATURE,
  type CIWebhookPort,
  type NormalizedBuildEvent,
  type RequestContext,
} from "@kenchi/shared";
import { GITHUB_CHECK_CONCLUSIONS, type CheckRunWebhook } from "../types/githubTypes.js";

// ==================== Constants ====================

/**
 * Conclusions that should be skipped (not actual failures).
 * Mirrors the set in checkRunAnalysis.ts.
 */
const SKIP_CONCLUSIONS: ReadonlySet<string> = new Set([
  GITHUB_CHECK_CONCLUSIONS.CANCELLED,
  GITHUB_CHECK_CONCLUSIONS.SKIPPED,
  GITHUB_CHECK_CONCLUSIONS.STALE,
]);

/**
 * Check names that are status/summary checks and should be skipped.
 */
const STATUS_CHECK_PATTERNS: readonly RegExp[] = [
  /^ci[\s-_]?success$/i,
  /^ci[\s-_]?status$/i,
  /^all[\s-_]?checks/i,
  /^status[\s-_]?check/i,
  /^branch[\s-_]?protection/i,
  /^required[\s-_]?checks/i,
];

// ==================== Helpers ====================

const isStatusCheck = (checkName: string): boolean =>
  STATUS_CHECK_PATTERNS.some((pattern) => pattern.test(checkName));

const isCheckRunWebhook = (payload: unknown): payload is CheckRunWebhook =>
  typeof payload === "object" &&
  payload !== null &&
  "check_run" in payload &&
  "repository" in payload;

// ==================== Adapter ====================

export const githubWebhookAdapter: CIWebhookPort = {
  verifySignature: (rawBody: Buffer, signature: string, secret: string): boolean => {
    if (!signature.startsWith(GITHUB_SIGNATURE.PREFIX)) {
      return false;
    }

    const expectedSignature = signature.slice(GITHUB_SIGNATURE.PREFIX.length);
    const computedSignature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

    try {
      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature, "hex"),
        Buffer.from(computedSignature, "hex")
      );
    } catch {
      return false;
    }
  },

  normalizeEvent: (payload: unknown, _context: RequestContext): NormalizedBuildEvent | null => {
    if (!isCheckRunWebhook(payload)) {
      return null;
    }

    const { check_run, repository, installation } = payload;

    // Skip status/summary checks
    if (isStatusCheck(check_run.name)) {
      return null;
    }

    // Skip non-failure conclusions
    const conclusion = check_run.conclusion ?? "failure";
    if (SKIP_CONCLUSIONS.has(conclusion)) {
      return null;
    }

    return {
      provider: CI_PROVIDERS.GITHUB_ACTIONS,
      buildId: String(check_run.id),
      buildName: check_run.name,
      conclusion,
      commitSha: check_run.head_sha,
      repository: {
        fullName: repository.full_name,
        owner: repository.owner.login,
        name: repository.name,
      },
      pullRequestNumbers: check_run.pull_requests.map((pr) => pr.number),
      installationId: installation?.id ?? 0,
      timestamp: new Date(),
      metadata: {
        checkRunId: check_run.id,
      },
    };
  },

  isFailureEvent: (payload: unknown): boolean => {
    if (!isCheckRunWebhook(payload)) {
      return false;
    }

    const { check_run } = payload;
    const conclusion = check_run.conclusion ?? "";

    return (
      check_run.conclusion !== null &&
      !SKIP_CONCLUSIONS.has(conclusion) &&
      conclusion !== GITHUB_CHECK_CONCLUSIONS.SUCCESS &&
      conclusion !== GITHUB_CHECK_CONCLUSIONS.NEUTRAL &&
      !isStatusCheck(check_run.name)
    );
  },
};
