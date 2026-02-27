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
  CachedComment,
  CachedPRReference,
  CachedCheckAnnotation,
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

// ==================== Helpers ====================

// Tenant conversion utilities
export { toCachedTenant, toCachedMapping } from "./helpers.js";

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
} from "./githubCache.js";

// ==================== Mapping Cache Operations ====================

export {
  getCachedChannelForRepo,
  cacheChannelForRepo,
  getOrFetchChannelForRepo,
  getCachedMappingsForChannel,
  cacheMappingsForChannel,
  getOrFetchMappingsForChannel,
  getCachedAllMappingsForTenant,
  cacheAllMappingsForTenant,
  getOrFetchAllMappingsForTenant,
  invalidateMappingCache,
  invalidateRepositoryMapping,
  invalidateChannelMappings,
} from "./mappingCache.js";

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
  invalidateTenantCache,
  invalidateTenantById,
  invalidateTenantByInstallation,
  invalidateTenantBySlackWorkspace,
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

// ==================== User Status Cache ====================

export {
  setUserStatusFlag,
  clearUserStatusFlag,
  getUserStatusFlag,
  isUserBlocked,
  setTenantStatusFlag,
  clearTenantStatusFlag,
  getTenantStatusFlag,
  isTenantBlocked,
  setMembershipRevokedFlag,
  isMembershipRevoked,
  clearMembershipRevokedFlag,
} from "./userStatusCache.js";

// ==================== Webhook Deduplication Cache ====================

export { isWebhookDuplicate, markWebhookProcessed } from "./webhookDedup.js";
