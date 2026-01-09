/**
 * GitHub API Response Cache
 *
 * Caches GitHub API responses to reduce rate limit consumption
 * and improve response times for frequently accessed data.
 *
 * @module cache/githubCache
 */

import { cacheGet, cacheSet, cacheGetOrSet, CACHE_TTL } from "./cacheClient.js";
import { githubCacheKeys } from "./cacheKeys.js";

// ==================== Types ====================

/**
 * Cached pull request metadata
 */
export interface CachedPullRequest {
  readonly number: number;
  readonly title: string;
  readonly body: string | null;
  readonly author: string;
  readonly headBranch: string;
  readonly baseBranch: string;
  readonly headSha: string;
  readonly labels: readonly string[];
  readonly state: string;
  readonly draft: boolean;
}

// ==================== Pull Request Cache ====================

/**
 * Get cached pull request
 */
export const getCachedPullRequest = async (
  owner: string,
  repo: string,
  prNumber: number
): Promise<CachedPullRequest | null> => {
  const result = await cacheGet<CachedPullRequest>(
    githubCacheKeys.pullRequest(owner, repo, prNumber)
  );
  return result.data;
};

/**
 * Cache pull request metadata
 */
export const cachePullRequest = async (
  owner: string,
  repo: string,
  prNumber: number,
  pr: CachedPullRequest
): Promise<void> => {
  await cacheSet(githubCacheKeys.pullRequest(owner, repo, prNumber), pr, {
    ttlSeconds: CACHE_TTL.MEDIUM,
  });
};

/**
 * Get or fetch pull request
 */
export const getOrFetchPullRequest = async (
  owner: string,
  repo: string,
  prNumber: number,
  fetcher: () => Promise<CachedPullRequest>
): Promise<CachedPullRequest> =>
  cacheGetOrSet(githubCacheKeys.pullRequest(owner, repo, prNumber), fetcher, {
    ttlSeconds: CACHE_TTL.MEDIUM,
  });

// ==================== Pull Request Diff Cache ====================

/**
 * Get cached pull request diff
 */
export const getCachedPullRequestDiff = async (
  owner: string,
  repo: string,
  prNumber: number
): Promise<string | null> => {
  const result = await cacheGet<string>(githubCacheKeys.pullRequestDiff(owner, repo, prNumber));
  return result.data;
};

/**
 * Cache pull request diff
 */
export const cachePullRequestDiff = async (
  owner: string,
  repo: string,
  prNumber: number,
  diff: string
): Promise<void> => {
  await cacheSet(githubCacheKeys.pullRequestDiff(owner, repo, prNumber), diff, {
    ttlSeconds: CACHE_TTL.MEDIUM,
  });
};

/**
 * Get or fetch pull request diff
 */
export const getOrFetchPullRequestDiff = async (
  owner: string,
  repo: string,
  prNumber: number,
  fetcher: () => Promise<string>
): Promise<string> =>
  cacheGetOrSet(githubCacheKeys.pullRequestDiff(owner, repo, prNumber), fetcher, {
    ttlSeconds: CACHE_TTL.MEDIUM,
  });
