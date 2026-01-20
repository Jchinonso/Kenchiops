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
import { createLogger } from "../core/logger.js";
import type {
  CachedPullRequest,
  CachedComment,
  CachedPRReference,
  CachedCheckAnnotation,
  CacheResult,
  PullRequestFetcher,
  DiffFetcher,
  CommitsFetcher,
  FilesFetcher,
  CommentsFetcher,
  CommitPRsFetcher,
  AnnotationsFetcher,
} from "./types.js";

/** Re-exported types for backward compatibility. */
export type {
  CachedPullRequest,
  CachedComment,
  CachedPRReference,
  CachedCheckAnnotation,
} from "./types.js";

const logger = createLogger("github-cache");

// ==================== Helper Functions ====================

/**
 * Extracts data from cache result.
 */
const extractCacheData = <T>(result: CacheResult<T>): T | null => result.data;

/**
 * Logs cache operation for debugging.
 */
const logCacheOperation = (
  operation: string,
  owner: string,
  repo: string,
  prNumber: number
): void => {
  logger.debug(`GitHub cache ${operation}`, { owner, repo, prNumber });
};

// ==================== Pull Request Cache ====================

/**
 * Get cached pull request metadata.
 *
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param prNumber - Pull request number
 * @returns Cached pull request or null if not found
 */
export const getCachedPullRequest = async (
  owner: string,
  repo: string,
  prNumber: number
): Promise<CachedPullRequest | null> => {
  const cacheKey = githubCacheKeys.pullRequest(owner, repo, prNumber);
  const result = await cacheGet<CachedPullRequest>(cacheKey);

  if (result.hit) {
    logCacheOperation("hit:pr", owner, repo, prNumber);
  }

  return extractCacheData(result);
};

/**
 * Cache pull request metadata.
 *
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param prNumber - Pull request number
 * @param pullRequest - Pull request data to cache
 */
export const cachePullRequest = async (
  owner: string,
  repo: string,
  prNumber: number,
  pullRequest: CachedPullRequest
): Promise<void> => {
  const cacheKey = githubCacheKeys.pullRequest(owner, repo, prNumber);

  await cacheSet(cacheKey, pullRequest, { ttlSeconds: CACHE_TTL.MEDIUM });

  logCacheOperation("set:pr", owner, repo, prNumber);
};

/**
 * Get cached pull request or fetch and cache if not found.
 *
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param prNumber - Pull request number
 * @param fetcher - Function to fetch pull request if not cached
 * @returns Cached or freshly fetched pull request
 */
export const getOrFetchPullRequest = async (
  owner: string,
  repo: string,
  prNumber: number,
  fetcher: PullRequestFetcher
): Promise<CachedPullRequest> => {
  const cacheKey = githubCacheKeys.pullRequest(owner, repo, prNumber);

  return cacheGetOrSet(cacheKey, fetcher, { ttlSeconds: CACHE_TTL.MEDIUM });
};

// ==================== Pull Request Diff Cache ====================

/**
 * Get cached pull request diff.
 *
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param prNumber - Pull request number
 * @returns Cached diff string or null if not found
 */
export const getCachedPullRequestDiff = async (
  owner: string,
  repo: string,
  prNumber: number
): Promise<string | null> => {
  const cacheKey = githubCacheKeys.pullRequestDiff(owner, repo, prNumber);
  const result = await cacheGet<string>(cacheKey);

  if (result.hit) {
    logCacheOperation("hit:diff", owner, repo, prNumber);
  }

  return extractCacheData(result);
};

/**
 * Cache pull request diff.
 *
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param prNumber - Pull request number
 * @param diff - Diff content to cache
 */
export const cachePullRequestDiff = async (
  owner: string,
  repo: string,
  prNumber: number,
  diff: string
): Promise<void> => {
  const cacheKey = githubCacheKeys.pullRequestDiff(owner, repo, prNumber);

  await cacheSet(cacheKey, diff, { ttlSeconds: CACHE_TTL.MEDIUM });

  logCacheOperation("set:diff", owner, repo, prNumber);
};

/**
 * Get cached pull request diff or fetch and cache if not found.
 *
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param prNumber - Pull request number
 * @param fetcher - Function to fetch diff if not cached
 * @returns Cached or freshly fetched diff
 */
export const getOrFetchPullRequestDiff = async (
  owner: string,
  repo: string,
  prNumber: number,
  fetcher: DiffFetcher
): Promise<string> => {
  const cacheKey = githubCacheKeys.pullRequestDiff(owner, repo, prNumber);

  return cacheGetOrSet(cacheKey, fetcher, { ttlSeconds: CACHE_TTL.MEDIUM });
};

// ==================== Pull Request Commits Cache ====================

/**
 * Get or fetch pull request commits.
 *
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param prNumber - Pull request number
 * @param fetcher - Function to fetch commits if not cached
 * @returns Cached or freshly fetched commits
 */
export const getOrFetchPullRequestCommits = async (
  owner: string,
  repo: string,
  prNumber: number,
  fetcher: CommitsFetcher
): Promise<readonly string[]> => {
  const cacheKey = githubCacheKeys.pullRequestCommits(owner, repo, prNumber);

  return cacheGetOrSet(cacheKey, fetcher, { ttlSeconds: CACHE_TTL.MEDIUM });
};

// ==================== Pull Request Files Cache ====================

/**
 * Get or fetch pull request changed files.
 *
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param prNumber - Pull request number
 * @param fetcher - Function to fetch files if not cached
 * @returns Cached or freshly fetched file paths
 */
export const getOrFetchPullRequestFiles = async (
  owner: string,
  repo: string,
  prNumber: number,
  fetcher: FilesFetcher
): Promise<readonly string[]> => {
  const cacheKey = githubCacheKeys.pullRequestFiles(owner, repo, prNumber);

  return cacheGetOrSet(cacheKey, fetcher, { ttlSeconds: CACHE_TTL.MEDIUM });
};

// ==================== Pull Request Comments Cache ====================

/**
 * Get or fetch pull request comments.
 *
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param prNumber - Pull request number
 * @param fetcher - Function to fetch comments if not cached
 * @returns Cached or freshly fetched comments
 */
export const getOrFetchPullRequestComments = async (
  owner: string,
  repo: string,
  prNumber: number,
  fetcher: CommentsFetcher
): Promise<readonly CachedComment[]> => {
  const cacheKey = githubCacheKeys.pullRequestComments(owner, repo, prNumber);

  return cacheGetOrSet(cacheKey, fetcher, { ttlSeconds: CACHE_TTL.SHORT });
};

// ==================== Commit PRs Cache ====================

/**
 * Get or fetch PRs associated with a commit.
 *
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param commitSha - Commit SHA
 * @param fetcher - Function to fetch PRs if not cached
 * @returns Cached or freshly fetched PR references
 */
export const getOrFetchCommitPullRequests = async (
  owner: string,
  repo: string,
  commitSha: string,
  fetcher: CommitPRsFetcher
): Promise<readonly CachedPRReference[]> => {
  const cacheKey = githubCacheKeys.commitPullRequests(owner, repo, commitSha);

  return cacheGetOrSet(cacheKey, fetcher, { ttlSeconds: CACHE_TTL.MEDIUM });
};

// ==================== Check Annotations Cache ====================

/**
 * Get or fetch check run annotations.
 *
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param checkRunId - Check run ID
 * @param fetcher - Function to fetch annotations if not cached
 * @returns Cached or freshly fetched annotations
 */
export const getOrFetchCheckAnnotations = async (
  owner: string,
  repo: string,
  checkRunId: number,
  fetcher: AnnotationsFetcher
): Promise<readonly CachedCheckAnnotation[]> => {
  const cacheKey = githubCacheKeys.checkAnnotations(owner, repo, checkRunId);

  return cacheGetOrSet(cacheKey, fetcher, { ttlSeconds: CACHE_TTL.MEDIUM });
};
