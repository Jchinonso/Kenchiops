/**
 * Repository-Channel Mapping Cache
 *
 * Caches repository-to-channel mappings to reduce database load
 * for frequently accessed multi-tenant routing data.
 *
 * @module cache/mappingCache
 */

import {
  cacheGet,
  cacheSet,
  cacheDelete,
  cacheDeletePattern,
  cacheGetOrSet,
  CACHE_TTL,
} from "./cacheClient.js";
import { mappingCacheKeys } from "./cacheKeys.js";
import { createLogger } from "../core/logger.js";
import type { CachedMapping, CacheResult, MappingFetcher, MappingArrayFetcher } from "./types.js";

const logger = createLogger("mapping-cache");

// ==================== Helper Functions ====================

/**
 * Extracts data from cache result.
 */
const extractCacheData = <T>(result: CacheResult<T>): T | null => result.data;

// ==================== Channel for Repository ====================

/**
 * Get cached channel mapping for repository.
 *
 * @param tenantId - Tenant identifier
 * @param repository - Repository full name (owner/repo)
 * @returns Cached mapping or null if not found
 */
export const getCachedChannelForRepo = async (
  tenantId: string,
  repository: string
): Promise<CachedMapping | null> => {
  const cacheKey = mappingCacheKeys.channelForRepo(tenantId, repository);
  const result = await cacheGet<CachedMapping>(cacheKey);

  return extractCacheData(result);
};

/**
 * Cache channel mapping for repository.
 *
 * @param tenantId - Tenant identifier
 * @param repository - Repository full name (owner/repo)
 * @param mapping - Mapping data to cache
 */
export const cacheChannelForRepo = async (
  tenantId: string,
  repository: string,
  mapping: CachedMapping
): Promise<void> => {
  const cacheKey = mappingCacheKeys.channelForRepo(tenantId, repository);

  await cacheSet(cacheKey, mapping, { ttlSeconds: CACHE_TTL.MEDIUM });
};

/**
 * Get cached channel mapping for repository or fetch and cache if not found.
 *
 * @param tenantId - Tenant identifier
 * @param repository - Repository full name (owner/repo)
 * @param fetcher - Function to fetch mapping if not cached
 * @returns Cached or freshly fetched mapping, or null if not found
 */
export const getOrFetchChannelForRepo = async (
  tenantId: string,
  repository: string,
  fetcher: MappingFetcher
): Promise<CachedMapping | null> => {
  const cached = await getCachedChannelForRepo(tenantId, repository);

  if (cached) {
    return cached;
  }

  const fresh = await fetcher();

  if (fresh) {
    await cacheChannelForRepo(tenantId, repository, fresh);
  }

  return fresh;
};

// ==================== Mappings for Channel ====================

/**
 * Get cached mappings for a channel.
 *
 * @param tenantId - Tenant identifier
 * @param channelId - Slack channel identifier
 * @returns Cached mappings or null if not found
 */
export const getCachedMappingsForChannel = async (
  tenantId: string,
  channelId: string
): Promise<readonly CachedMapping[] | null> => {
  const cacheKey = mappingCacheKeys.mappingsForChannel(tenantId, channelId);
  const result = await cacheGet<readonly CachedMapping[]>(cacheKey);

  return extractCacheData(result);
};

/**
 * Cache mappings for a channel.
 *
 * @param tenantId - Tenant identifier
 * @param channelId - Slack channel identifier
 * @param mappings - Mappings data to cache
 */
export const cacheMappingsForChannel = async (
  tenantId: string,
  channelId: string,
  mappings: readonly CachedMapping[]
): Promise<void> => {
  const cacheKey = mappingCacheKeys.mappingsForChannel(tenantId, channelId);

  await cacheSet(cacheKey, mappings, { ttlSeconds: CACHE_TTL.MEDIUM });
};

/**
 * Get cached mappings for channel or fetch and cache if not found.
 *
 * @param tenantId - Tenant identifier
 * @param channelId - Slack channel identifier
 * @param fetcher - Function to fetch mappings if not cached
 * @returns Cached or freshly fetched mappings
 */
export const getOrFetchMappingsForChannel = async (
  tenantId: string,
  channelId: string,
  fetcher: MappingArrayFetcher
): Promise<readonly CachedMapping[]> => {
  const cacheKey = mappingCacheKeys.mappingsForChannel(tenantId, channelId);

  return cacheGetOrSet(cacheKey, fetcher, { ttlSeconds: CACHE_TTL.MEDIUM });
};

// ==================== All Mappings for Tenant ====================

/**
 * Get cached all mappings for tenant.
 *
 * @param tenantId - Tenant identifier
 * @returns Cached mappings or null if not found
 */
export const getCachedAllMappingsForTenant = async (
  tenantId: string
): Promise<readonly CachedMapping[] | null> => {
  const cacheKey = mappingCacheKeys.allForTenant(tenantId);
  const result = await cacheGet<readonly CachedMapping[]>(cacheKey);

  return extractCacheData(result);
};

/**
 * Cache all mappings for tenant.
 *
 * @param tenantId - Tenant identifier
 * @param mappings - Mappings data to cache
 */
export const cacheAllMappingsForTenant = async (
  tenantId: string,
  mappings: readonly CachedMapping[]
): Promise<void> => {
  const cacheKey = mappingCacheKeys.allForTenant(tenantId);

  await cacheSet(cacheKey, mappings, { ttlSeconds: CACHE_TTL.MEDIUM });
};

/**
 * Get cached all mappings for tenant or fetch and cache if not found.
 *
 * @param tenantId - Tenant identifier
 * @param fetcher - Function to fetch mappings if not cached
 * @returns Cached or freshly fetched mappings
 */
export const getOrFetchAllMappingsForTenant = async (
  tenantId: string,
  fetcher: MappingArrayFetcher
): Promise<readonly CachedMapping[]> => {
  const cacheKey = mappingCacheKeys.allForTenant(tenantId);

  return cacheGetOrSet(cacheKey, fetcher, { ttlSeconds: CACHE_TTL.MEDIUM });
};

// ==================== Cache Invalidation ====================

/**
 * Invalidate mapping cache for a tenant.
 *
 * @param tenantId - Tenant identifier
 * @returns Number of cache entries deleted
 */
export const invalidateMappingCache = async (tenantId: string): Promise<number> => {
  const deletedCount = await cacheDeletePattern(mappingCacheKeys.tenantPattern(tenantId));

  logger.info("Invalidated mapping cache", { tenantId, entriesDeleted: deletedCount });

  return deletedCount;
};

/**
 * Invalidate specific repository mapping.
 *
 * @param tenantId - Tenant identifier
 * @param repository - Repository full name (owner/repo)
 */
export const invalidateRepositoryMapping = async (
  tenantId: string,
  repository: string
): Promise<void> => {
  await Promise.all([
    cacheDelete(mappingCacheKeys.channelForRepo(tenantId, repository)),
    cacheDelete(mappingCacheKeys.allForTenant(tenantId)),
    cacheDelete(mappingCacheKeys.isMapped(tenantId, repository)),
  ]);
};

/**
 * Invalidate channel mappings.
 *
 * @param tenantId - Tenant identifier
 * @param channelId - Slack channel identifier
 */
export const invalidateChannelMappings = async (
  tenantId: string,
  channelId: string
): Promise<void> => {
  await Promise.all([
    cacheDelete(mappingCacheKeys.mappingsForChannel(tenantId, channelId)),
    cacheDelete(mappingCacheKeys.allForTenant(tenantId)),
  ]);
};
