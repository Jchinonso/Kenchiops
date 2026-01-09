/**
 * Cache Module
 *
 * Provides Redis-based caching for GitHub API responses, tenant data,
 * and AI analysis results.
 *
 * @module cache
 */

// Core cache client
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
  type CacheEntry,
  type CacheResult,
  type CacheSetOptions,
  type CacheStats,
} from "./cacheClient.js";

// Cache key utilities
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

// GitHub cache
export {
  getCachedPullRequest,
  cachePullRequest,
  getOrFetchPullRequest,
  getCachedPullRequestDiff,
  cachePullRequestDiff,
  getOrFetchPullRequestDiff,
  type CachedPullRequest,
} from "./githubCache.js";

// Tenant cache
export {
  toCachedTenant,
  toCachedMapping,
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
  type CachedTenant,
  type CachedMapping,
  type CachedTenantStats,
} from "./tenantCache.js";

// Analysis cache
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
  type CachedAnnotation,
  type CachedAction,
  type CachedAnalysis,
  type CachedConsolidatedAnalysis,
} from "./analysisCache.js";
