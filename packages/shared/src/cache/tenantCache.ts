/**
 * Tenant and Mapping Cache
 *
 * Caches tenant data and repository-channel mappings to reduce
 * database load for frequently accessed multi-tenant data.
 *
 * @module cache/tenantCache
 */

import {
  cacheGet,
  cacheSet,
  cacheDelete,
  cacheDeletePattern,
  cacheGetOrSet,
  CACHE_TTL,
} from "./cacheClient.js";
import { tenantCacheKeys, mappingCacheKeys } from "./cacheKeys.js";
import { createLogger } from "../core/logger.js";

// Import from types module
import type { CachedTenant, CachedMapping, CachedTenantStats } from "./tenantCacheTypes.js";

// Re-export types and converters for backwards compatibility
export {
  toCachedTenant,
  toCachedMapping,
  type CachedTenant,
  type CachedMapping,
  type CachedTenantStats,
} from "./tenantCacheTypes.js";

const logger = createLogger("tenant-cache");

// ==================== Tenant Cache Operations ====================

/**
 * Get cached tenant by ID
 */
export const getCachedTenantById = async (tenantId: string): Promise<CachedTenant | null> => {
  const result = await cacheGet<CachedTenant>(tenantCacheKeys.byId(tenantId));
  return result.data;
};

/**
 * Cache tenant by ID
 */
export const cacheTenantById = async (tenant: CachedTenant): Promise<void> => {
  await cacheSet(tenantCacheKeys.byId(tenant.id), tenant, { ttlSeconds: CACHE_TTL.MEDIUM });
};

/**
 * Get or fetch tenant by ID
 */
export const getOrFetchTenantById = async (
  tenantId: string,
  fetcher: () => Promise<CachedTenant | null>
): Promise<CachedTenant | null> => {
  const cached = await getCachedTenantById(tenantId);
  if (cached) {
    return cached;
  }

  const tenant = await fetcher();
  if (tenant) {
    await cacheTenantById(tenant);
  }
  return tenant;
};

/**
 * Get cached tenant by GitHub installation ID
 */
export const getCachedTenantByInstallation = async (
  installationId: number
): Promise<CachedTenant | null> => {
  const result = await cacheGet<CachedTenant>(tenantCacheKeys.byInstallation(installationId));
  return result.data;
};

/**
 * Cache tenant by GitHub installation ID
 */
export const cacheTenantByInstallation = async (
  installationId: number,
  tenant: CachedTenant
): Promise<void> => {
  await cacheSet(tenantCacheKeys.byInstallation(installationId), tenant, {
    ttlSeconds: CACHE_TTL.MEDIUM,
  });

  // Also cache by ID for consistency
  await cacheTenantById(tenant);
};

/**
 * Get or fetch tenant by installation ID
 */
export const getOrFetchTenantByInstallation = async (
  installationId: number,
  fetcher: () => Promise<CachedTenant | null>
): Promise<CachedTenant | null> => {
  const cached = await getCachedTenantByInstallation(installationId);
  if (cached) {
    return cached;
  }

  const tenant = await fetcher();
  if (tenant) {
    await cacheTenantByInstallation(installationId, tenant);
  }
  return tenant;
};

/**
 * Get cached tenant by Slack workspace ID
 */
export const getCachedTenantBySlackWorkspace = async (
  workspaceId: string
): Promise<CachedTenant | null> => {
  const result = await cacheGet<CachedTenant>(tenantCacheKeys.bySlackWorkspace(workspaceId));
  return result.data;
};

/**
 * Cache tenant by Slack workspace ID
 */
export const cacheTenantBySlackWorkspace = async (
  workspaceId: string,
  tenant: CachedTenant
): Promise<void> => {
  await cacheSet(tenantCacheKeys.bySlackWorkspace(workspaceId), tenant, {
    ttlSeconds: CACHE_TTL.MEDIUM,
  });

  // Also cache by ID for consistency
  await cacheTenantById(tenant);
};

/**
 * Get or fetch tenant by Slack workspace
 */
export const getOrFetchTenantBySlackWorkspace = async (
  workspaceId: string,
  fetcher: () => Promise<CachedTenant | null>
): Promise<CachedTenant | null> => {
  const cached = await getCachedTenantBySlackWorkspace(workspaceId);
  if (cached) {
    return cached;
  }

  const tenant = await fetcher();
  if (tenant) {
    await cacheTenantBySlackWorkspace(workspaceId, tenant);
  }
  return tenant;
};

/**
 * Get cached tenant by GitHub org name
 */
export const getCachedTenantByGitHubOrg = async (orgName: string): Promise<CachedTenant | null> => {
  const result = await cacheGet<CachedTenant>(tenantCacheKeys.byGitHubOrg(orgName));
  return result.data;
};

/**
 * Cache tenant by GitHub org name
 */
export const cacheTenantByGitHubOrg = async (
  orgName: string,
  tenant: CachedTenant
): Promise<void> => {
  await cacheSet(tenantCacheKeys.byGitHubOrg(orgName), tenant, { ttlSeconds: CACHE_TTL.MEDIUM });

  // Also cache by ID for consistency
  await cacheTenantById(tenant);
};

// ==================== Tenant Statistics Cache ====================

/**
 * Get cached tenant statistics
 */
export const getCachedTenantStats = async (tenantId: string): Promise<CachedTenantStats | null> => {
  const result = await cacheGet<CachedTenantStats>(tenantCacheKeys.statistics(tenantId));
  return result.data;
};

/**
 * Cache tenant statistics
 */
export const cacheTenantStats = async (
  tenantId: string,
  stats: CachedTenantStats
): Promise<void> => {
  // Stats are more volatile, use shorter TTL
  await cacheSet(tenantCacheKeys.statistics(tenantId), stats, { ttlSeconds: CACHE_TTL.SHORT });
};

/**
 * Get or fetch tenant statistics
 */
export const getOrFetchTenantStats = async (
  tenantId: string,
  fetcher: () => Promise<CachedTenantStats>
): Promise<CachedTenantStats> =>
  cacheGetOrSet(tenantCacheKeys.statistics(tenantId), fetcher, { ttlSeconds: CACHE_TTL.SHORT });

// ==================== Mapping Cache Operations ====================

/**
 * Get cached channel for repository
 */
export const getCachedChannelForRepo = async (
  tenantId: string,
  repository: string
): Promise<CachedMapping | null> => {
  const result = await cacheGet<CachedMapping>(
    mappingCacheKeys.channelForRepo(tenantId, repository)
  );
  return result.data;
};

/**
 * Cache channel for repository
 */
export const cacheChannelForRepo = async (
  tenantId: string,
  repository: string,
  mapping: CachedMapping
): Promise<void> => {
  await cacheSet(mappingCacheKeys.channelForRepo(tenantId, repository), mapping, {
    ttlSeconds: CACHE_TTL.MEDIUM,
  });
};

/**
 * Get or fetch channel for repository
 */
export const getOrFetchChannelForRepo = async (
  tenantId: string,
  repository: string,
  fetcher: () => Promise<CachedMapping | null>
): Promise<CachedMapping | null> => {
  const cached = await getCachedChannelForRepo(tenantId, repository);
  if (cached) {
    return cached;
  }

  const mapping = await fetcher();
  if (mapping) {
    await cacheChannelForRepo(tenantId, repository, mapping);
  }
  return mapping;
};

/**
 * Get cached mappings for channel
 */
export const getCachedMappingsForChannel = async (
  tenantId: string,
  channelId: string
): Promise<readonly CachedMapping[] | null> => {
  const result = await cacheGet<readonly CachedMapping[]>(
    mappingCacheKeys.mappingsForChannel(tenantId, channelId)
  );
  return result.data;
};

/**
 * Cache mappings for channel
 */
export const cacheMappingsForChannel = async (
  tenantId: string,
  channelId: string,
  mappings: readonly CachedMapping[]
): Promise<void> => {
  await cacheSet(mappingCacheKeys.mappingsForChannel(tenantId, channelId), mappings, {
    ttlSeconds: CACHE_TTL.MEDIUM,
  });
};

/**
 * Get or fetch mappings for channel
 */
export const getOrFetchMappingsForChannel = async (
  tenantId: string,
  channelId: string,
  fetcher: () => Promise<readonly CachedMapping[]>
): Promise<readonly CachedMapping[]> =>
  cacheGetOrSet(mappingCacheKeys.mappingsForChannel(tenantId, channelId), fetcher, {
    ttlSeconds: CACHE_TTL.MEDIUM,
  });

/**
 * Get cached all mappings for tenant
 */
export const getCachedAllMappingsForTenant = async (
  tenantId: string
): Promise<readonly CachedMapping[] | null> => {
  const result = await cacheGet<readonly CachedMapping[]>(mappingCacheKeys.allForTenant(tenantId));
  return result.data;
};

/**
 * Cache all mappings for tenant
 */
export const cacheAllMappingsForTenant = async (
  tenantId: string,
  mappings: readonly CachedMapping[]
): Promise<void> => {
  await cacheSet(mappingCacheKeys.allForTenant(tenantId), mappings, {
    ttlSeconds: CACHE_TTL.MEDIUM,
  });
};

/**
 * Get or fetch all mappings for tenant
 */
export const getOrFetchAllMappingsForTenant = async (
  tenantId: string,
  fetcher: () => Promise<readonly CachedMapping[]>
): Promise<readonly CachedMapping[]> =>
  cacheGetOrSet(mappingCacheKeys.allForTenant(tenantId), fetcher, { ttlSeconds: CACHE_TTL.MEDIUM });

// ==================== Cache Invalidation ====================

/**
 * Invalidate all cache entries for a tenant
 */
export const invalidateTenantCache = async (tenantId: string): Promise<number> => {
  const [tenantDeleted, mappingDeleted] = await Promise.all([
    cacheDeletePattern(tenantCacheKeys.allPattern()),
    cacheDeletePattern(mappingCacheKeys.tenantPattern(tenantId)),
  ]);

  const total = tenantDeleted + mappingDeleted;

  logger.info("Invalidated tenant cache", {
    tenantId,
    entriesDeleted: total,
  });

  return total;
};

/**
 * Invalidate tenant by ID
 */
export const invalidateTenantById = async (tenantId: string): Promise<void> => {
  await cacheDelete(tenantCacheKeys.byId(tenantId));
};

/**
 * Invalidate tenant by installation ID
 */
export const invalidateTenantByInstallation = async (installationId: number): Promise<void> => {
  await cacheDelete(tenantCacheKeys.byInstallation(installationId));
};

/**
 * Invalidate tenant by Slack workspace
 */
export const invalidateTenantBySlackWorkspace = async (workspaceId: string): Promise<void> => {
  await cacheDelete(tenantCacheKeys.bySlackWorkspace(workspaceId));
};

/**
 * Invalidate mapping cache for a tenant
 */
export const invalidateMappingCache = async (tenantId: string): Promise<number> => {
  const deleted = await cacheDeletePattern(mappingCacheKeys.tenantPattern(tenantId));

  logger.info("Invalidated mapping cache", {
    tenantId,
    entriesDeleted: deleted,
  });

  return deleted;
};

/**
 * Invalidate specific repository mapping
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
 * Invalidate channel mappings
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
