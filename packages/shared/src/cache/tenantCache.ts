/**
 * Tenant Cache
 *
 * Caches tenant data to reduce database load for frequently
 * accessed multi-tenant data.
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
import type {
  CachedTenant,
  CachedTenantStats,
  CacheResult,
  TenantFetcher,
  TenantStatsFetcher,
} from "./types.js";

const logger = createLogger("tenant-cache");

// ==================== Helper Functions ====================

/**
 * Extracts data from cache result.
 */
const extractCacheData = <T>(result: CacheResult<T>): T | null => result.data;

// ==================== Tenant by ID ====================

/**
 * Get cached tenant by ID.
 *
 * @param tenantId - Tenant identifier
 * @returns Cached tenant or null if not found
 */
export const getCachedTenantById = async (tenantId: string): Promise<CachedTenant | null> => {
  const cacheKey = tenantCacheKeys.byId(tenantId);
  const result = await cacheGet<CachedTenant>(cacheKey);

  return extractCacheData(result);
};

/**
 * Cache tenant by ID.
 *
 * @param tenant - Tenant data to cache
 */
export const cacheTenantById = async (tenant: CachedTenant): Promise<void> => {
  const cacheKey = tenantCacheKeys.byId(tenant.id);

  await cacheSet(cacheKey, tenant, { ttlSeconds: CACHE_TTL.MEDIUM });
};

/**
 * Get cached tenant by ID or fetch and cache if not found.
 *
 * @param tenantId - Tenant identifier
 * @param fetcher - Function to fetch tenant if not cached
 * @returns Cached or freshly fetched tenant, or null if not found
 */
export const getOrFetchTenantById = async (
  tenantId: string,
  fetcher: TenantFetcher
): Promise<CachedTenant | null> => {
  const cached = await getCachedTenantById(tenantId);

  if (cached) {
    return cached;
  }

  const fresh = await fetcher();

  if (fresh) {
    await cacheTenantById(fresh);
  }

  return fresh;
};

// ==================== Tenant by Installation ====================

/**
 * Get cached tenant by GitHub installation ID.
 *
 * @param installationId - GitHub installation identifier
 * @returns Cached tenant or null if not found
 */
export const getCachedTenantByInstallation = async (
  installationId: number
): Promise<CachedTenant | null> => {
  const cacheKey = tenantCacheKeys.byInstallation(installationId);
  const result = await cacheGet<CachedTenant>(cacheKey);

  return extractCacheData(result);
};

/**
 * Cache tenant by GitHub installation ID.
 *
 * @param installationId - GitHub installation identifier
 * @param tenant - Tenant data to cache
 */
export const cacheTenantByInstallation = async (
  installationId: number,
  tenant: CachedTenant
): Promise<void> => {
  const cacheKey = tenantCacheKeys.byInstallation(installationId);

  await cacheSet(cacheKey, tenant, { ttlSeconds: CACHE_TTL.MEDIUM });

  // Also cache by ID for consistency
  await cacheTenantById(tenant);
};

/**
 * Get cached tenant by installation ID or fetch and cache if not found.
 *
 * @param installationId - GitHub installation identifier
 * @param fetcher - Function to fetch tenant if not cached
 * @returns Cached or freshly fetched tenant, or null if not found
 */
export const getOrFetchTenantByInstallation = async (
  installationId: number,
  fetcher: TenantFetcher
): Promise<CachedTenant | null> => {
  const cached = await getCachedTenantByInstallation(installationId);

  if (cached) {
    return cached;
  }

  const fresh = await fetcher();

  if (fresh) {
    await cacheTenantByInstallation(installationId, fresh);
  }

  return fresh;
};

// ==================== Tenant by Slack Workspace ====================

/**
 * Get cached tenant by Slack workspace ID.
 *
 * @param workspaceId - Slack workspace identifier
 * @returns Cached tenant or null if not found
 */
export const getCachedTenantBySlackWorkspace = async (
  workspaceId: string
): Promise<CachedTenant | null> => {
  const cacheKey = tenantCacheKeys.bySlackWorkspace(workspaceId);
  const result = await cacheGet<CachedTenant>(cacheKey);

  return extractCacheData(result);
};

/**
 * Cache tenant by Slack workspace ID.
 *
 * @param workspaceId - Slack workspace identifier
 * @param tenant - Tenant data to cache
 */
export const cacheTenantBySlackWorkspace = async (
  workspaceId: string,
  tenant: CachedTenant
): Promise<void> => {
  const cacheKey = tenantCacheKeys.bySlackWorkspace(workspaceId);

  await cacheSet(cacheKey, tenant, { ttlSeconds: CACHE_TTL.MEDIUM });

  // Also cache by ID for consistency
  await cacheTenantById(tenant);
};

/**
 * Get cached tenant by Slack workspace or fetch and cache if not found.
 *
 * @param workspaceId - Slack workspace identifier
 * @param fetcher - Function to fetch tenant if not cached
 * @returns Cached or freshly fetched tenant, or null if not found
 */
export const getOrFetchTenantBySlackWorkspace = async (
  workspaceId: string,
  fetcher: TenantFetcher
): Promise<CachedTenant | null> => {
  const cached = await getCachedTenantBySlackWorkspace(workspaceId);

  if (cached) {
    return cached;
  }

  const fresh = await fetcher();

  if (fresh) {
    await cacheTenantBySlackWorkspace(workspaceId, fresh);
  }

  return fresh;
};

// ==================== Tenant by GitHub Org ====================

/**
 * Get cached tenant by GitHub org name.
 *
 * @param orgName - GitHub organization name
 * @returns Cached tenant or null if not found
 */
export const getCachedTenantByGitHubOrg = async (orgName: string): Promise<CachedTenant | null> => {
  const cacheKey = tenantCacheKeys.byGitHubOrg(orgName);
  const result = await cacheGet<CachedTenant>(cacheKey);

  return extractCacheData(result);
};

/**
 * Cache tenant by GitHub org name.
 *
 * @param orgName - GitHub organization name
 * @param tenant - Tenant data to cache
 */
export const cacheTenantByGitHubOrg = async (
  orgName: string,
  tenant: CachedTenant
): Promise<void> => {
  const cacheKey = tenantCacheKeys.byGitHubOrg(orgName);

  await cacheSet(cacheKey, tenant, { ttlSeconds: CACHE_TTL.MEDIUM });

  // Also cache by ID for consistency
  await cacheTenantById(tenant);
};

// ==================== Tenant Statistics ====================

/**
 * Get cached tenant statistics.
 *
 * @param tenantId - Tenant identifier
 * @returns Cached statistics or null if not found
 */
export const getCachedTenantStats = async (tenantId: string): Promise<CachedTenantStats | null> => {
  const cacheKey = tenantCacheKeys.statistics(tenantId);
  const result = await cacheGet<CachedTenantStats>(cacheKey);

  return extractCacheData(result);
};

/**
 * Cache tenant statistics.
 *
 * @param tenantId - Tenant identifier
 * @param tenantStats - Statistics data to cache
 */
export const cacheTenantStats = async (
  tenantId: string,
  tenantStats: CachedTenantStats
): Promise<void> => {
  const cacheKey = tenantCacheKeys.statistics(tenantId);

  // Stats are more volatile, use shorter TTL
  await cacheSet(cacheKey, tenantStats, { ttlSeconds: CACHE_TTL.SHORT });
};

/**
 * Get cached tenant statistics or fetch and cache if not found.
 *
 * @param tenantId - Tenant identifier
 * @param fetcher - Function to fetch statistics if not cached
 * @returns Cached or freshly fetched statistics
 */
export const getOrFetchTenantStats = async (
  tenantId: string,
  fetcher: TenantStatsFetcher
): Promise<CachedTenantStats> => {
  const cacheKey = tenantCacheKeys.statistics(tenantId);

  return cacheGetOrSet(cacheKey, fetcher, { ttlSeconds: CACHE_TTL.SHORT });
};

// ==================== Cache Invalidation ====================

/**
 * Invalidate all cache entries for a tenant.
 *
 * @param tenantId - Tenant identifier
 * @returns Total number of cache entries deleted
 */
export const invalidateTenantCache = async (tenantId: string): Promise<number> => {
  const [tenantDeleted, mappingDeleted] = await Promise.all([
    cacheDeletePattern(tenantCacheKeys.allPattern()),
    cacheDeletePattern(mappingCacheKeys.tenantPattern(tenantId)),
  ]);

  const totalDeleted = tenantDeleted + mappingDeleted;

  logger.info("Invalidated tenant cache", { tenantId, entriesDeleted: totalDeleted });

  return totalDeleted;
};

/**
 * Invalidate tenant cache by ID.
 *
 * @param tenantId - Tenant identifier
 */
export const invalidateTenantById = async (tenantId: string): Promise<void> => {
  const cacheKey = tenantCacheKeys.byId(tenantId);

  await cacheDelete(cacheKey);
};

/**
 * Invalidate tenant cache by installation ID.
 *
 * @param installationId - GitHub installation identifier
 */
export const invalidateTenantByInstallation = async (installationId: number): Promise<void> => {
  const cacheKey = tenantCacheKeys.byInstallation(installationId);

  await cacheDelete(cacheKey);
};

/**
 * Invalidate tenant cache by Slack workspace.
 *
 * @param workspaceId - Slack workspace identifier
 */
export const invalidateTenantBySlackWorkspace = async (workspaceId: string): Promise<void> => {
  const cacheKey = tenantCacheKeys.bySlackWorkspace(workspaceId);

  await cacheDelete(cacheKey);
};
