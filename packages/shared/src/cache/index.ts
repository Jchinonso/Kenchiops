/**
 * Cache Module
 *
 * Provides Redis-based caching for GitHub API responses, tenant data,
 * and AI analysis results.
 *
 * @module cache
 */

// ==================== Types (canonical definitions) ====================

export type {
  // Core cache types
  CacheEntry,
  CacheResult,
  CacheSetOptions,
  CacheStats,
  CacheStatsState,
  DeserializeResult,
  RedisClientReadyResult,
  // GitHub cache types
  CachedPullRequest,
  // Tenant cache types
  CachedTenant,
  CachedMapping,
  CachedTenantStats,
  // Analysis cache types
  CachedAnnotation,
  CachedAction,
  CachedAnalysis,
  CachedConsolidatedAnalysis,
  CacheOperationResult,
  CacheWriteResult,
  AnalysisApiResponse,
  AnalysisCacheLogContext,
} from "./types.js";

// Tenant conversion utilities
export { toCachedTenant, toCachedMapping } from "./types.js";

// ==================== Core Cache Client ====================

export {
  cacheGet,
  cacheSet,
  cacheDelete,
  cacheDeletePattern,
  cacheExists,
  cacheTTL,
  cacheGetOrSet,
  cacheGetMany,
  getCacheStats,
  resetCacheStats,
  CACHE_TTL,
} from "./cacheClient.js";

// ==================== Cache Key Utilities ====================

export {
  CACHE_NAMESPACE,
  githubCacheKeys,
  tenantCacheKeys,
  mappingCacheKeys,
  analysisCacheKeys,
  tokenCacheKeys,
  parseCacheKey,
  getAllPatterns,
  type CacheNamespace,
} from "./cacheKeys.js";

// ==================== GitHub Cache Operations ====================

export {
  getCachedPullRequest,
  cachePullRequest,
  getOrFetchPullRequest,
  getCachedPullRequestDiff,
  cachePullRequestDiff,
  getOrFetchPullRequestDiff,
  getOrFetchPullRequestCommits,
  getOrFetchPullRequestFiles,
  getOrFetchPullRequestComments,
  getOrFetchCommitPullRequests,
  getOrFetchCheckAnnotations,
  type CachedComment,
  type CachedPRReference,
  type CachedCheckAnnotation,
} from "./githubCache.js";

// ==================== Tenant Cache Operations ====================

export {
  getCachedTenantById,
  cacheTenantById,
  getOrFetchTenantById,
  getCachedTenantByInstallation,
  cacheTenantByInstallation,
  getOrFetchTenantByInstallation,
  getCachedTenantBySlackWorkspace,
  cacheTenantBySlackWorkspace,
  getOrFetchTenantBySlackWorkspace,
  getCachedTenantByGitHubOrg,
  cacheTenantByGitHubOrg,
  getCachedTenantStats,
  cacheTenantStats,
  getOrFetchTenantStats,
  getCachedChannelForRepo,
  cacheChannelForRepo,
  getOrFetchChannelForRepo,
  getCachedMappingsForChannel,
  cacheMappingsForChannel,
  getOrFetchMappingsForChannel,
  getCachedAllMappingsForTenant,
  cacheAllMappingsForTenant,
  getOrFetchAllMappingsForTenant,
  invalidateTenantCache,
  invalidateTenantById,
  invalidateTenantByInstallation,
  invalidateTenantBySlackWorkspace,
  invalidateMappingCache,
  invalidateRepositoryMapping,
  invalidateChannelMappings,
} from "./tenantCache.js";

// ==================== Analysis Cache Operations ====================

export {
  generateLogHash,
  getCachedCheckAnalysis,
  cacheCheckAnalysis,
  getOrFetchCheckAnalysis,
  getCachedConsolidatedAnalysis,
  cacheConsolidatedAnalysis,
  getOrFetchConsolidatedAnalysis,
  getCachedAnalysisByLogHash,
  cacheAnalysisByLogHash,
  getOrFetchAnalysisByLogHash,
  buildCachedAnalysis,
  invalidateRepositoryAnalysisCache,
  invalidateCommitAnalysis,
  invalidateCheckAnalysis,
  invalidateLogHashAnalysis,
  hasAnalysisInCache,
  hasLogHashInCache,
} from "./analysisCache.js";
