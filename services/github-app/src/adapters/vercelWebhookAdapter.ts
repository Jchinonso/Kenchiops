/**
 * Vercel Webhook Adapter
 *
 * Implements CIWebhookPort for Vercel deployment webhooks.
 * Handles HMAC-SHA1 signature verification and normalization
 * of Vercel deployment payloads to NormalizedBuildEvent.
 *
 * @module adapters/vercelWebhookAdapter
 */

import crypto from "crypto";
import {
  createLogger,
  CI_PROVIDERS,
  VERCEL_FAILURE_EVENTS,
  type CIWebhookPort,
  type NormalizedBuildEvent,
  type RequestContext,
} from "@kenchi/shared";
import type { VercelWebhook } from "../types/vercelTypes.js";

const logger = createLogger("vercel-webhook");

// ==================== Helpers ====================

const isVercelWebhook = (payload: unknown): payload is VercelWebhook =>
  typeof payload === "object" &&
  payload !== null &&
  "type" in payload &&
  "payload" in payload &&
  typeof (payload as Record<string, unknown>).type === "string";

/**
 * Extract git context from Vercel deployment metadata.
 * Vercel stores GitHub info in `deployment.meta` when linked to a GitHub repo.
 */
const extractGitContext = (
  meta: Readonly<Record<string, string>>
): {
  readonly commitSha: string;
  readonly owner: string;
  readonly repo: string;
  readonly branch: string | undefined;
  readonly prNumber: number | undefined;
} => {
  const commitSha = meta.githubCommitSha ?? meta.gitCommitSha ?? "";
  const owner = meta.githubOrg ?? meta.githubCommitOrg ?? "";
  const repo = meta.githubRepo ?? meta.githubCommitRepo ?? "";
  const branch = meta.githubCommitRef ?? meta.gitBranch ?? undefined;
  const prNumberStr = meta.githubPrId;
  const prNumber = prNumberStr ? parseInt(prNumberStr, 10) : undefined;

  return { commitSha, owner, repo, branch, prNumber };
};

// ==================== Adapter ====================

export const vercelWebhookAdapter: CIWebhookPort = {
  verifySignature: (rawBody: Buffer, signature: string, secret: string): boolean => {
    // Vercel uses HMAC-SHA1 with no prefix — raw hex digest
    const computedSignature = crypto.createHmac("sha1", secret).update(rawBody).digest("hex");

    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature, "hex"),
        Buffer.from(computedSignature, "hex")
      );
    } catch {
      // timingSafeEqual throws if buffer lengths differ — treat as invalid
      return false;
    }
  },

  normalizeEvent: (
    payload: unknown,
    _context: RequestContext // Unused: normalization is a pure sync transform
  ): NormalizedBuildEvent | null => {
    if (!isVercelWebhook(payload)) {
      return null;
    }

    if (!VERCEL_FAILURE_EVENTS.has(payload.type)) {
      return null;
    }

    const { deployment } = payload.payload;
    const git = extractGitContext(deployment.meta);

    if (!git.commitSha || !git.owner || !git.repo) {
      logger.warn("Vercel deployment missing git context, skipping normalization", {
        deploymentId: deployment.id,
        hasCommitSha: !!git.commitSha,
        hasOwner: !!git.owner,
        hasRepo: !!git.repo,
      });
      return null;
    }

    return {
      provider: CI_PROVIDERS.VERCEL,
      buildId: deployment.id,
      buildName: deployment.name,
      conclusion: payload.type === "deployment.error" ? "failure" : "cancelled",
      commitSha: git.commitSha,
      branch: git.branch,
      repository: {
        fullName: `${git.owner}/${git.repo}`,
        owner: git.owner,
        name: git.repo,
      },
      pullRequestNumbers: git.prNumber !== undefined ? [git.prNumber] : [],
      installationId: 0, // Vercel doesn't use GitHub installation IDs
      timestamp: new Date(payload.createdAt),
      metadata: {
        vercelDeploymentId: deployment.id,
        vercelProjectId: payload.payload.project.id,
        vercelTeamId: payload.payload.team?.id ?? null,
        target: payload.payload.target,
        deploymentUrl: deployment.url,
        framework: deployment.meta.framework ?? null,
      },
    };
  },

  isFailureEvent: (payload: unknown): boolean => {
    if (!isVercelWebhook(payload)) {
      return false;
    }
    return VERCEL_FAILURE_EVENTS.has(payload.type);
  },
};
