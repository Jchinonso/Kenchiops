/**
 * Vercel Helpers
 *
 * Shared helpers for Vercel deployment webhook processing.
 * Used by both the webhook adapter and the deployment handler.
 *
 * @module helpers/vercelHelpers
 */

import { VERCEL_DEPLOYMENT_EVENTS } from "@kenchi/shared";

/**
 * Git context extracted from Vercel deployment metadata.
 */
export interface VercelGitContext {
  readonly commitSha: string;
  readonly owner: string;
  readonly repo: string;
  readonly branch: string | undefined;
  readonly prNumber: number | undefined;
}

/**
 * Extract git context from Vercel deployment metadata.
 * Vercel stores GitHub info in `deployment.meta` when linked to a GitHub repo.
 */
export const extractGitContext = (meta: Readonly<Record<string, string>>): VercelGitContext => {
  const commitSha = meta.githubCommitSha ?? meta.gitCommitSha ?? "";
  const owner = meta.githubOrg ?? meta.githubCommitOrg ?? "";
  const repo = meta.githubRepo ?? meta.githubCommitRepo ?? "";
  const branch = meta.githubCommitRef ?? meta.gitBranch ?? undefined;
  const prNumberStr = meta.githubPrId;
  const prNumber = prNumberStr ? parseInt(prNumberStr, 10) : undefined;

  return { commitSha, owner, repo, branch, prNumber };
};

/** Map Vercel event type to a conclusion string. */
export const mapVercelConclusion = (eventType: string): string =>
  eventType === VERCEL_DEPLOYMENT_EVENTS.ERROR ? "failure" : "cancelled";
