/**
 * GitHub API Response Cache
 *
 * Caches GitHub API responses to reduce rate limit consumption
 * and improve response times for frequently accessed data.
 *
 * @module cache/githubCache
 */

import {
  cacheGet,
  cacheSet,
  cacheDelete,
  cacheDeletePattern,
  cacheGetOrSet,
  CACHE_TTL,
} from "./cacheClient.js";
import { githubCacheKeys } from "./cacheKeys.js";
import { createLogger } from "../core/logger.js";

const logger = createLogger("github-cache");

// ==================== Types ====================

/**
 * Cached repository info
 */
export interface CachedRepository {
  readonly id: number;
  readonly name: string;
  readonly fullName: string;
  readonly private: boolean;
  readonly defaultBranch: string;
}

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

/**
 * Cached commit info
 */
export interface CachedCommit {
  readonly sha: string;
  readonly message: string;
  readonly author: string;
  readonly date: string;
  readonly filesChanged: number;
}

/**
 * Cached check run info
 */
export interface CachedCheckRun {
  readonly id: number;
  readonly name: string;
  readonly status: string;
  readonly conclusion: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly detailsUrl: string | null;
}

/**
 * Cached workflow run info
 */
export interface CachedWorkflowRun {
  readonly id: number;
  readonly name: string;
  readonly status: string;
  readonly conclusion: string | null;
  readonly headSha: string;
  readonly event: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ==================== Repository Cache ====================

/**
 * Get cached installation repositories
 */
export const getCachedInstallationRepos = async (
  installationId: number
): Promise<readonly CachedRepository[] | null> => {
  const result = await cacheGet<readonly CachedRepository[]>(
    githubCacheKeys.installationRepos(installationId)
  );
  return result.data;
};

/**
 * Cache installation repositories
 */
export const cacheInstallationRepos = async (
  installationId: number,
  repos: readonly CachedRepository[]
): Promise<void> => {
  await cacheSet(githubCacheKeys.installationRepos(installationId), repos, {
    ttlSeconds: CACHE_TTL.STANDARD,
  });

  logger.debug("Cached installation repos", {
    installationId,
    repoCount: repos.length,
  });
};

/**
 * Get or fetch installation repositories
 */
export const getOrFetchInstallationRepos = async (
  installationId: number,
  fetcher: () => Promise<readonly CachedRepository[]>
): Promise<readonly CachedRepository[]> =>
  cacheGetOrSet(githubCacheKeys.installationRepos(installationId), fetcher, {
    ttlSeconds: CACHE_TTL.STANDARD,
  });

/**
 * Invalidate installation repos cache
 */
export const invalidateInstallationRepos = async (installationId: number): Promise<void> => {
  await cacheDelete(githubCacheKeys.installationRepos(installationId));
};

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

/**
 * Invalidate pull request cache
 */
export const invalidatePullRequest = async (
  owner: string,
  repo: string,
  prNumber: number
): Promise<void> => {
  await cacheDelete(githubCacheKeys.pullRequest(owner, repo, prNumber));
};

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

// ==================== Commit Cache ====================

/**
 * Get cached commit
 */
export const getCachedCommit = async (
  owner: string,
  repo: string,
  sha: string
): Promise<CachedCommit | null> => {
  const result = await cacheGet<CachedCommit>(githubCacheKeys.commit(owner, repo, sha));
  return result.data;
};

/**
 * Cache commit info
 */
export const cacheCommit = async (
  owner: string,
  repo: string,
  sha: string,
  commit: CachedCommit
): Promise<void> => {
  // Commits are immutable, so cache longer
  await cacheSet(githubCacheKeys.commit(owner, repo, sha), commit, { ttlSeconds: CACHE_TTL.LONG });
};

/**
 * Get or fetch commit
 */
export const getOrFetchCommit = async (
  owner: string,
  repo: string,
  sha: string,
  fetcher: () => Promise<CachedCommit>
): Promise<CachedCommit> =>
  cacheGetOrSet(githubCacheKeys.commit(owner, repo, sha), fetcher, { ttlSeconds: CACHE_TTL.LONG });

// ==================== Check Run Cache ====================

/**
 * Get cached check run
 */
export const getCachedCheckRun = async (
  owner: string,
  repo: string,
  checkRunId: number
): Promise<CachedCheckRun | null> => {
  const result = await cacheGet<CachedCheckRun>(githubCacheKeys.checkRun(owner, repo, checkRunId));
  return result.data;
};

/**
 * Cache check run info
 */
export const cacheCheckRun = async (
  owner: string,
  repo: string,
  checkRunId: number,
  checkRun: CachedCheckRun
): Promise<void> => {
  // Completed check runs can be cached longer
  const ttl = checkRun.status === "completed" ? CACHE_TTL.LONG : CACHE_TTL.SHORT;

  await cacheSet(githubCacheKeys.checkRun(owner, repo, checkRunId), checkRun, { ttlSeconds: ttl });
};

/**
 * Get or fetch check run
 */
export const getOrFetchCheckRun = async (
  owner: string,
  repo: string,
  checkRunId: number,
  fetcher: () => Promise<CachedCheckRun>
): Promise<CachedCheckRun> =>
  cacheGetOrSet(githubCacheKeys.checkRun(owner, repo, checkRunId), fetcher, {
    ttlSeconds: CACHE_TTL.MEDIUM,
  });

// ==================== Workflow Run Cache ====================

/**
 * Get cached workflow run
 */
export const getCachedWorkflowRun = async (
  owner: string,
  repo: string,
  runId: number
): Promise<CachedWorkflowRun | null> => {
  const result = await cacheGet<CachedWorkflowRun>(githubCacheKeys.workflowRun(owner, repo, runId));
  return result.data;
};

/**
 * Cache workflow run info
 */
export const cacheWorkflowRun = async (
  owner: string,
  repo: string,
  runId: number,
  workflowRun: CachedWorkflowRun
): Promise<void> => {
  // Completed workflow runs can be cached longer
  const ttl = workflowRun.status === "completed" ? CACHE_TTL.LONG : CACHE_TTL.SHORT;

  await cacheSet(githubCacheKeys.workflowRun(owner, repo, runId), workflowRun, { ttlSeconds: ttl });
};

// ==================== Workflow Logs Cache ====================

/**
 * Get cached workflow logs
 */
export const getCachedWorkflowLogs = async (
  owner: string,
  repo: string,
  runId: number
): Promise<string | null> => {
  const result = await cacheGet<string>(githubCacheKeys.workflowLogs(owner, repo, runId));
  return result.data;
};

/**
 * Cache workflow logs
 */
export const cacheWorkflowLogs = async (
  owner: string,
  repo: string,
  runId: number,
  logs: string
): Promise<void> => {
  // Logs are immutable once workflow completes, cache for extended time
  await cacheSet(githubCacheKeys.workflowLogs(owner, repo, runId), logs, {
    ttlSeconds: CACHE_TTL.EXTENDED,
  });
};

/**
 * Get or fetch workflow logs
 */
export const getOrFetchWorkflowLogs = async (
  owner: string,
  repo: string,
  runId: number,
  fetcher: () => Promise<string>
): Promise<string> =>
  cacheGetOrSet(githubCacheKeys.workflowLogs(owner, repo, runId), fetcher, {
    ttlSeconds: CACHE_TTL.EXTENDED,
  });

// ==================== Cache Invalidation ====================

/**
 * Invalidate all cache entries for a repository
 */
export const invalidateRepositoryCache = async (owner: string, repo: string): Promise<number> => {
  const deleted = await cacheDeletePattern(githubCacheKeys.repositoryPattern(owner, repo));

  logger.info("Invalidated repository cache", {
    owner,
    repo,
    entriesDeleted: deleted,
  });

  return deleted;
};

/**
 * Invalidate all cache entries for an installation
 */
export const invalidateInstallationCache = async (installationId: number): Promise<number> => {
  const deleted = await cacheDeletePattern(githubCacheKeys.installationPattern(installationId));

  logger.info("Invalidated installation cache", {
    installationId,
    entriesDeleted: deleted,
  });

  return deleted;
};
