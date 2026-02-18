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
  createLogger,
  CI_PROVIDERS,
  GITHUB_SIGNATURE,
  type CIWebhookPort,
  type NormalizedBuildEvent,
  type RequestContext,
} from "@kenchi/shared";
import { GITHUB_CHECK_CONCLUSIONS, type CheckRunWebhook } from "../types/githubTypes.js";
import { SKIP_CONCLUSIONS, isStatusCheck } from "../helpers/githubCheckFilters.js";

const logger = createLogger("github-webhook");

// ==================== Helpers ====================

const isCheckRunWebhook = (payload: unknown): payload is CheckRunWebhook =>
  typeof payload === "object" &&
  payload !== null &&
  "check_run" in payload &&
  "repository" in payload;

// ==================== Adapter ====================

export const githubWebhookAdapter: CIWebhookPort = {
  verifySignature: (rawBody: Buffer, signature: string, secret: string): boolean => {
    if (!signature.startsWith(GITHUB_SIGNATURE.PREFIX)) {
      logger.warn("Invalid signature prefix", {
        provider: "github",
        operation: "verifySignature",
      });
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
      // timingSafeEqual throws if buffer lengths differ — treat as invalid signature
      return false;
    }
  },

  normalizeEvent: (
    payload: unknown,
    _context: RequestContext // Unused: normalization is a pure sync transform; context available for providers needing I/O
  ): NormalizedBuildEvent | null => {
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
