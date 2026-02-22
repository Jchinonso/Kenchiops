/**
 * GitLab CI Webhook Adapter
 *
 * Implements CIWebhookPort for GitLab CI job webhooks.
 * Validates the X-Gitlab-Token header (plain string match)
 * and normalizes job payloads to NormalizedBuildEvent.
 *
 * @module adapters/gitlabWebhookAdapter
 */

import crypto from "crypto";
import {
  createLogger,
  CI_PROVIDERS,
  GITLAB_HOMEPAGE_PATH_PATTERN,
  GITLAB_FAILURE_STATUSES,
  type CIWebhookPort,
  type NormalizedBuildEvent,
  type RequestContext,
} from "@kenchi/shared";
import type { GitLabJobWebhook } from "../types/gitlabTypes.js";

const logger = createLogger("gitlab-webhook");

// ==================== Type Guard ====================

const isGitLabJobWebhook = (payload: unknown): payload is GitLabJobWebhook => {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }

  const candidate = payload as Record<string, unknown>;

  return (
    candidate.object_kind === "build" &&
    typeof candidate.build_id === "number" &&
    typeof candidate.build_name === "string" &&
    typeof candidate.build_status === "string" &&
    typeof candidate.sha === "string" &&
    typeof candidate.repository === "object" &&
    candidate.repository !== null
  );
};

// ==================== Helpers ====================

/**
 * Extract repository full name and owner/name from GitLab webhook.
 *
 * GitLab job hooks provide repository.homepage (e.g. "https://gitlab.com/group/project").
 * We parse the path from that URL. Falls back to project_name if parsing fails.
 */
const extractRepositoryInfo = (
  payload: GitLabJobWebhook
): { readonly fullName: string; readonly owner: string; readonly name: string } => {
  const { homepage } = payload.repository;
  const pathMatch = GITLAB_HOMEPAGE_PATH_PATTERN.exec(homepage);
  const fullName = pathMatch ? pathMatch[1] : payload.project_name;
  const parts = fullName.split("/");
  const name = parts[parts.length - 1] ?? payload.repository.name;
  const owner = parts.length > 1 ? parts.slice(0, -1).join("/") : payload.user.username;

  return { fullName, owner, name };
};

// ==================== Adapter ====================

export const gitlabWebhookAdapter: CIWebhookPort = {
  verifySignature: (_rawBody: Buffer, signature: string, secret: string): boolean => {
    // GitLab uses X-Gitlab-Token: a plain string match (not HMAC).
    // Use timingSafeEqual to prevent timing attacks.
    try {
      const sigBuffer = Buffer.from(signature);
      const secretBuffer = Buffer.from(secret);

      if (sigBuffer.length !== secretBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(sigBuffer, secretBuffer);
    } catch {
      logger.warn("GitLab token comparison failed", {
        provider: "gitlab",
        operation: "verifySignature",
      });
      return false;
    }
  },

  normalizeEvent: (payload: unknown, _context: RequestContext): NormalizedBuildEvent | null => {
    if (!isGitLabJobWebhook(payload)) {
      return null;
    }

    const repoInfo = extractRepositoryInfo(payload);

    return {
      provider: CI_PROVIDERS.GITLAB_CI,
      buildId: String(payload.build_id),
      buildName: payload.build_name,
      conclusion: payload.build_status === "failed" ? "failure" : payload.build_status,
      commitSha: payload.sha,
      branch: payload.ref,
      repository: repoInfo,
      pullRequestNumbers: payload.merge_request ? [payload.merge_request.iid] : [],
      installationId: 0,
      timestamp: new Date(),
      metadata: {
        pipelineId: payload.pipeline_id,
        projectId: payload.project_id,
        stage: payload.build_stage,
        duration: payload.build_duration,
      },
    };
  },

  isFailureEvent: (payload: unknown): boolean => {
    if (!isGitLabJobWebhook(payload)) {
      return false;
    }
    return GITLAB_FAILURE_STATUSES.has(payload.build_status);
  },
};
