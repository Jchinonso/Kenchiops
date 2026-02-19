/**
 * Netlify Helpers
 *
 * Shared helpers for Netlify deploy webhook processing.
 * Used by both the webhook adapter and the deployment handler.
 *
 * @module helpers/netlifyHelpers
 */

import { NETLIFY_COMMIT_URL_PATTERN } from "@kenchi/shared";
import type { NetlifyDeployPayload, NetlifyGitContext } from "../types/netlifyTypes.js";

export type { NetlifyGitContext } from "../types/netlifyTypes.js";

/**
 * Parse owner and repo from a Netlify commit_url field.
 * Expected format: `https://github.com/<owner>/<repo>/commit/<sha>`
 */
const parseCommitUrl = (commitUrl: string): { readonly owner: string; readonly repo: string } => {
  const match = NETLIFY_COMMIT_URL_PATTERN.exec(commitUrl);
  return match ? { owner: match[1], repo: match[2] } : { owner: "", repo: "" };
};

/**
 * Extract git context from a Netlify deploy payload.
 * Netlify provides git info as top-level fields (not nested metadata).
 */
export const extractGitContext = (payload: NetlifyDeployPayload): NetlifyGitContext => {
  const { owner, repo } = parseCommitUrl(payload.commit_url ?? "");
  const commitSha = payload.commit_ref ?? "";
  const branch = payload.branch || undefined;
  const prNumber = payload.review_id ?? undefined;

  return { commitSha, owner, repo, branch, prNumber };
};

/**
 * Map Netlify deploy state to a conclusion string.
 * Netlify failures are always `state: "error"`, so conclusion is always "failure".
 */
export const mapNetlifyConclusion = (_state: string): string => "failure";
