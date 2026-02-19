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
import { extractGitContext, mapVercelConclusion } from "../helpers/vercelHelpers.js";

const logger = createLogger("vercel-webhook");

// ==================== Helpers ====================

const isVercelWebhook = (payload: unknown): payload is VercelWebhook =>
  typeof payload === "object" &&
  payload !== null &&
  "type" in payload &&
  "payload" in payload &&
  typeof (payload as Record<string, unknown>).type === "string";

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
      conclusion: mapVercelConclusion(payload.type),
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
