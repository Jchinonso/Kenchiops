/**
 * Cache Key Generation
 *
 * Centralized cache key generation with namespacing and type safety.
 * All cache keys are prefixed with 'kenchi:' for easy identification.
 *
 * @module cache/cacheKeys
 */

// ==================== Constants ====================

/**
 * Cache key prefix for all Kenchi cache entries
 */
const PREFIX = "kenchi:cache" as const;

/**
 * Cache namespaces for different data types
 */
export const CACHE_NAMESPACE = {
  GITHUB: "github",
  TENANT: "tenant",
  MAPPING: "mapping",
  ANALYSIS: "analysis",
  TOKEN: "token",
} as const;

export type CacheNamespace = (typeof CACHE_NAMESPACE)[keyof typeof CACHE_NAMESPACE];

// ==================== Key Builders ====================

/**
 * Build a cache key with namespace
 */
const buildKey = (namespace: CacheNamespace, ...parts: readonly string[]): string =>
  [PREFIX, namespace, ...parts].join(":");

// ==================== GitHub Cache Keys ====================

/**
 * GitHub cache key builders
 */
export const githubCacheKeys = {
  /** Installation repositories list */
  installationRepos: (installationId: number): string =>
    buildKey(CACHE_NAMESPACE.GITHUB, "repos", String(installationId)),

  /** Repository details */
  repository: (owner: string, repo: string): string =>
    buildKey(CACHE_NAMESPACE.GITHUB, "repo", owner, repo),

  /** Pull request metadata */
  pullRequest: (owner: string, repo: string, prNumber: number): string =>
    buildKey(CACHE_NAMESPACE.GITHUB, "pr", owner, repo, String(prNumber)),

  /** Pull request diff */
  pullRequestDiff: (owner: string, repo: string, prNumber: number): string =>
    buildKey(CACHE_NAMESPACE.GITHUB, "pr-diff", owner, repo, String(prNumber)),

  /** Commit details */
  commit: (owner: string, repo: string, sha: string): string =>
    buildKey(CACHE_NAMESPACE.GITHUB, "commit", owner, repo, sha),

  /** Check run details */
  checkRun: (owner: string, repo: string, checkRunId: number): string =>
    buildKey(CACHE_NAMESPACE.GITHUB, "check", owner, repo, String(checkRunId)),

  /** Workflow run details */
  workflowRun: (owner: string, repo: string, runId: number): string =>
    buildKey(CACHE_NAMESPACE.GITHUB, "workflow", owner, repo, String(runId)),

  /** Workflow logs */
  workflowLogs: (owner: string, repo: string, runId: number): string =>
    buildKey(CACHE_NAMESPACE.GITHUB, "logs", owner, repo, String(runId)),

  /** Pattern for all GitHub cache entries for a repository */
  repositoryPattern: (owner: string, repo: string): string =>
    buildKey(CACHE_NAMESPACE.GITHUB, "*", owner, repo, "*"),

  /** Pattern for all installation cache entries */
  installationPattern: (installationId: number): string =>
    buildKey(CACHE_NAMESPACE.GITHUB, "*", String(installationId), "*"),
} as const;

// ==================== Tenant Cache Keys ====================

/**
 * Tenant cache key builders
 */
export const tenantCacheKeys = {
  /** Tenant by ID */
  byId: (tenantId: string): string => buildKey(CACHE_NAMESPACE.TENANT, "id", tenantId),

  /** Tenant by GitHub installation ID */
  byInstallation: (installationId: number): string =>
    buildKey(CACHE_NAMESPACE.TENANT, "install", String(installationId)),

  /** Tenant by GitHub organization */
  byGitHubOrg: (orgName: string): string => buildKey(CACHE_NAMESPACE.TENANT, "org", orgName),

  /** Tenant by Slack workspace ID */
  bySlackWorkspace: (workspaceId: string): string =>
    buildKey(CACHE_NAMESPACE.TENANT, "slack", workspaceId),

  /** All active tenants */
  activeTenants: (): string => buildKey(CACHE_NAMESPACE.TENANT, "active"),

  /** Tenant statistics */
  statistics: (tenantId: string): string => buildKey(CACHE_NAMESPACE.TENANT, "stats", tenantId),

  /** Pattern for all tenant cache entries */
  allPattern: (): string => buildKey(CACHE_NAMESPACE.TENANT, "*"),
} as const;

// ==================== Mapping Cache Keys ====================

/**
 * Repository-channel mapping cache key builders
 */
export const mappingCacheKeys = {
  /** Channel for a repository */
  channelForRepo: (tenantId: string, repository: string): string =>
    buildKey(CACHE_NAMESPACE.MAPPING, "repo", tenantId, repository.replace("/", "-")),

  /** Mappings for a channel */
  mappingsForChannel: (tenantId: string, channelId: string): string =>
    buildKey(CACHE_NAMESPACE.MAPPING, "channel", tenantId, channelId),

  /** All mappings for a tenant */
  allForTenant: (tenantId: string): string => buildKey(CACHE_NAMESPACE.MAPPING, "all", tenantId),

  /** Check if repository is mapped */
  isMapped: (tenantId: string, repository: string): string =>
    buildKey(CACHE_NAMESPACE.MAPPING, "exists", tenantId, repository.replace("/", "-")),

  /** Pattern for all mapping cache entries for a tenant */
  tenantPattern: (tenantId: string): string =>
    buildKey(CACHE_NAMESPACE.MAPPING, "*", tenantId, "*"),
} as const;

// ==================== Analysis Cache Keys ====================

/**
 * AI analysis result cache key builders
 */
export const analysisCacheKeys = {
  /** Analysis by commit SHA and check name */
  byCommitAndCheck: (repository: string, commitSha: string, checkName: string): string =>
    buildKey(
      CACHE_NAMESPACE.ANALYSIS,
      "check",
      repository.replace("/", "-"),
      commitSha.substring(0, 12),
      checkName.replace(/\s+/g, "-").toLowerCase()
    ),

  /** Consolidated analysis for a commit */
  byCommit: (repository: string, commitSha: string): string =>
    buildKey(
      CACHE_NAMESPACE.ANALYSIS,
      "commit",
      repository.replace("/", "-"),
      commitSha.substring(0, 12)
    ),

  /** Analysis by log hash (for deduplication) */
  byLogHash: (logHash: string): string => buildKey(CACHE_NAMESPACE.ANALYSIS, "log", logHash),

  /** Pattern for all analysis cache entries for a repository */
  repositoryPattern: (repository: string): string =>
    buildKey(CACHE_NAMESPACE.ANALYSIS, "*", repository.replace("/", "-"), "*"),
} as const;

// ==================== Token Cache Keys ====================

/**
 * Token cache key builders (for GitHub installation tokens)
 */
export const tokenCacheKeys = {
  /** Installation access token */
  installationToken: (installationId: number): string =>
    buildKey(CACHE_NAMESPACE.TOKEN, "install", String(installationId)),

  /** Pattern for all token cache entries */
  allPattern: (): string => buildKey(CACHE_NAMESPACE.TOKEN, "*"),
} as const;

// ==================== Utility Functions ====================

/**
 * Parse a cache key to extract namespace and parts
 */
export const parseCacheKey = (key: string): { namespace: string; parts: string[] } | null => {
  const segments = key.split(":");

  if (segments.length < 3 || segments[0] !== "kenchi" || segments[1] !== "cache") {
    return null;
  }

  return {
    namespace: segments[2],
    parts: segments.slice(3),
  };
};

/**
 * Get all cache key patterns for invalidation
 */
export const getAllPatterns = (): readonly string[] => [`${PREFIX}:*`];
